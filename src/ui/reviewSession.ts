import * as p from '@clack/prompts';
import pc from 'picocolors';
import open from 'open';

import { loadConfig, updateConfig } from '../config.js';
import { SpotifyApiError } from '../spotify/client.js';
import { estimateChorusPositionMs, pausePlayback, playTrackAt, resumePlayback, seek } from '../spotify/playback.js';
import { fetchAllTracks, removeTrack, restoreTrack, type TrackSource } from '../spotify/tracks.js';
import type { SpotifyTrack, TrackItem } from '../spotify/types.js';
import { isInteractiveTerminal, readKey, withRawMode } from './keypress.js';
import { buildReviewFrame, type Decision, type StatusLine } from './reviewFrame.js';
import { enterAltScreen, exitAltScreen, paintFrame, terminalHeight, terminalWidth } from './terminal.js';

const SEEK_STEP_MS = 10_000;

/** One already-decided track, in review order. Superset of reviewFrame's HistoryEntry (adds `index`, needed to jump/undo). */
type SessionHistoryEntry = { index: number; track: SpotifyTrack; decision: Decision };

function resumeKeyFor(source: TrackSource): string {
  return source.kind === 'liked' ? 'liked-songs' : `playlist:${source.id}`;
}

async function loadResumeOffset(source: TrackSource, total: number): Promise<number> {
  const config = await loadConfig();
  const saved = config.resume?.[resumeKeyFor(source)];
  if (!saved || saved.offset <= 0 || saved.offset >= total) return 0;

  const choice = await p.select({
    message: `Du hattest hier bei Track ${saved.offset + 1}/${saved.total} aufgehört.`,
    options: [
      { value: saved.offset, label: 'Fortsetzen' },
      { value: 0, label: 'Von vorne beginnen' },
    ],
  });

  return p.isCancel(choice) ? 0 : choice;
}

async function saveResumeOffset(source: TrackSource, offset: number, total: number): Promise<void> {
  await updateConfig((c) => {
    c.resume ??= {};
    if (offset >= total) {
      delete c.resume[resumeKeyFor(source)];
    } else {
      c.resume[resumeKeyFor(source)] = { offset, total, updatedAt: new Date().toISOString() };
    }
  });
}

async function safePlayback(action: () => Promise<void>, onError: (error: unknown) => void): Promise<boolean> {
  try {
    await action();
    return true;
  } catch (error) {
    onError(error);
    return false;
  }
}

function openInSpotify(track: SpotifyTrack): void {
  if (!track.id) return;
  void open(`https://open.spotify.com/track/${track.id}`).catch(() => undefined);
}

export type ReviewSummary = {
  kept: number;
  removed: SpotifyTrack[];
  reviewedCount: number;
  total: number;
  quitEarly: boolean;
};

export async function runReviewSession(
  source: TrackSource,
  deviceId: string | undefined
): Promise<ReviewSummary> {
  if (!isInteractiveTerminal()) {
    throw new Error('spoticlean braucht ein interaktives Terminal (TTY), um Tasten lesen zu können.');
  }

  // Loading + resume choice still happen in the normal scrollback via clack —
  // only the review loop itself takes over the full screen. Not covered by
  // the per-track safety net further down (that only wraps the review loop
  // itself), so it needs its own: otherwise a failure here is an unhandled
  // rejection with a bare, contextless message ("Forbidden") instead of a
  // clear "loading X failed" one.
  const spinner = p.spinner();
  spinner.start(`Lade Songs aus "${source.name}"…`);
  let tracks: TrackItem[];
  try {
    tracks = await fetchAllTracks(source, (loaded, loadedTotal) => {
      spinner.message(`Lade Songs aus "${source.name}"… (${loaded}/${loadedTotal})`);
    });
  } catch (error) {
    spinner.stop(`Laden von "${source.name}" fehlgeschlagen.`, 1);
    throw new Error(`Songs aus "${source.name}" konnten nicht geladen werden: ${(error as Error).message}`);
  }
  spinner.stop(`${tracks.length} Songs geladen.`);

  const startOffset = await loadResumeOffset(source, tracks.length);

  const decisions = new Map<number, Decision>();
  const history: SessionHistoryEntry[] = [];
  let status: StatusLine | undefined;
  let hasDevice = Boolean(deviceId);
  let quitEarly = false;

  // Mutable "what's on screen right now" state, read live by render() — a
  // shared object rather than per-iteration `let`s, so render() (called
  // from key handlers closed over the loop below) always sees the current
  // track/position, not a stale snapshot from when it was defined.
  const view = { index: startOffset, positionMs: 0, isPaused: false };

  // Index into `history` that's highlighted while browsing with ↑/↓, or
  // null in the normal (not browsing) state.
  let historyCursor: number | null = null;
  // True only for the duration of re-deciding one specific past track
  // opened from the history browser (see editHistoryEntry()); the decision
  // it had before this edit, shown alongside for context.
  let isEditing = false;
  let editingIndex: number | undefined;

  function setStatus(text: string, color?: (t: string) => string): void {
    status = { text, color };
    render();
  }

  function render(): void {
    paintFrame(
      buildReviewFrame({
        sourceName: source.name,
        trackNumber: Math.min(view.index + 1, tracks.length),
        totalTracks: tracks.length,
        item: tracks[view.index],
        hasDevice,
        positionMs: view.positionMs,
        isPaused: view.isPaused,
        history,
        historyCursor,
        editing: isEditing,
        editingIndex,
        status,
        width: terminalWidth(),
        height: terminalHeight(),
      })
    );
  }

  // Only these Spotify error reasons mean auto-play genuinely can't work any
  // more this session. Everything else (e.g. ALREADY_PAUSED from a stray key
  // press while a call is still in flight, a transient 5xx, ...) is just
  // noted and retried on the next action instead of disabling playback.
  const SESSION_ENDING_REASONS = new Set(['PREMIUM_REQUIRED', 'NO_ACTIVE_DEVICE']);

  const onPlaybackError = (error: unknown) => {
    const reason = error instanceof SpotifyApiError ? error.reason : undefined;

    if (hasDevice && reason && SESSION_ENDING_REASONS.has(reason)) {
      hasDevice = false;
      setStatus(
        reason === 'PREMIUM_REQUIRED'
          ? 'Automatisches Abspielen benötigt Spotify Premium — nur noch Metadaten.'
          : 'Kein aktives Wiedergabegerät mehr gefunden — nur noch Metadaten.',
        pc.yellow
      );
      return;
    }

    const detail = reason ? ` (${reason})` : '';
    setStatus(`Wiedergabe-Aktion fehlgeschlagen${detail}: ${(error as Error).message}`, pc.yellow);
  };

  const onResize = () => render();

  enterAltScreen();
  process.stdout.on('resize', onResize);

  // Starts (or restarts) chorus-first playback for `track`, currently shown
  // at view.index, and renders. Shared between entering a track normally and
  // resuming the original track after a history-browser detour.
  async function startPlayback(track: SpotifyTrack): Promise<void> {
    view.positionMs = estimateChorusPositionMs(track.duration_ms);
    view.isPaused = false;
    render();

    if (hasDevice && !track.is_local) {
      // Awaited (not fire-and-forget): a pause/seek pressed while this is
      // still in flight would race it and produce spurious errors.
      await safePlayback(() => playTrackAt(track.uri, view.positionMs, deviceId), onPlaybackError);
      render();
    }
  }

  // Keys that make sense any time a track is on screen, regardless of
  // whether it's being reviewed forward or re-decided via the history
  // browser: pause/resume, seek, back-to-chorus, open in Spotify. Returns
  // true if it handled the key.
  async function handlePlaybackOrOpenKey(normalized: string | undefined, track: SpotifyTrack): Promise<boolean> {
    switch (normalized) {
      case 'o':
        openInSpotify(track);
        setStatus(`In Spotify geöffnet: ${track.name}`, pc.dim);
        return true;
      case ' ':
        if (hasDevice) {
          const ok = view.isPaused
            ? await safePlayback(() => resumePlayback(deviceId), onPlaybackError)
            : await safePlayback(() => pausePlayback(deviceId), onPlaybackError);
          if (ok) view.isPaused = !view.isPaused;
          render();
        }
        return true;
      case '.':
      case 'l':
        if (hasDevice) {
          view.positionMs += SEEK_STEP_MS;
          await safePlayback(() => seek(view.positionMs, deviceId), onPlaybackError);
          render();
        }
        return true;
      case ',':
      case 'h':
        if (hasDevice) {
          view.positionMs = Math.max(0, view.positionMs - SEEK_STEP_MS);
          await safePlayback(() => seek(view.positionMs, deviceId), onPlaybackError);
          render();
        }
        return true;
      case 'b':
        if (hasDevice) {
          view.positionMs = estimateChorusPositionMs(track.duration_ms);
          await safePlayback(() => seek(view.positionMs, deviceId), onPlaybackError);
          render();
        }
        return true;
      default:
        return false;
    }
  }

  function normalizeKey(key: Awaited<ReturnType<typeof readKey>>): string | undefined {
    return key.name === 'return'
      ? 'enter'
      : key.name === 'backspace' || key.name === 'delete' || key.char === '\u007f'
        ? 'backspace'
        : key.name === 'up' || key.name === 'down' || key.name === 'escape'
          ? key.name
          : key.char?.toLowerCase();
  }

  // Undoes exactly the most recent decision (pops `history`, restores via
  // the API if it had been removed). Used by the plain `u` key.
  async function undoOne(): Promise<void> {
    const last = history.pop();
    if (!last) return;
    decisions.delete(last.index);
    view.index = last.index;

    if (last.decision === 'removed') {
      setStatus(`Wiederherstellen: ${last.track.name}…`, pc.dim);
      try {
        await restoreTrack(source, last.track);
        setStatus(`↺ Wiederhergestellt: ${last.track.name}`, pc.dim);
      } catch (error) {
        setStatus(`Wiederherstellen fehlgeschlagen: ${(error as Error).message}`, pc.red);
      }
    } else {
      setStatus(`↺ Zurückgenommen: ${last.track.name}`, pc.dim);
    }
  }

  // Re-decides exactly one past track picked in the history browser, then
  // returns to wherever the session actually was — everything reviewed
  // since stays as it was. Only this track's own decision changes (and only
  // if it actually changed); nothing after it gets rewound or re-reviewed.
  // Returns true if the user asked to quit while doing this.
  async function editHistoryEntry(targetIndex: number, track: SpotifyTrack): Promise<boolean> {
    const originalIndex = view.index;
    const originalPositionMs = view.positionMs;
    const originalIsPaused = view.isPaused;

    const previousDecision = decisions.get(targetIndex);

    view.index = targetIndex;
    isEditing = true;
    editingIndex = targetIndex;
    await startPlayback(track);

    let action: Decision | 'quit' | 'cancel' | undefined;
    while (!action) {
      const key = await readKey();
      if (key.ctrl && key.name === 'c') {
        action = 'quit';
        break;
      }
      const normalized = normalizeKey(key);
      switch (normalized) {
        case 'enter':
        case 'k':
          action = 'kept';
          break;
        case 'r':
        case 'backspace':
          action = 'removed';
          break;
        case 'q':
          action = 'quit';
          break;
        case 'escape':
          action = 'cancel';
          break;
        default:
          await handlePlaybackOrOpenKey(normalized, track);
          break;
      }
    }

    if (action !== 'quit' && action !== 'cancel' && action !== previousDecision) {
      if (action === 'removed') {
        setStatus(`Entferne: ${track.name}…`, pc.dim);
        try {
          await removeTrack(source, track);
          setStatus(`✗ Entfernt: ${track.name}`, pc.red);
        } catch (error) {
          setStatus(`Entfernen fehlgeschlagen (${track.name}): ${(error as Error).message}`, pc.red);
        }
      } else {
        setStatus(`Wiederherstellen: ${track.name}…`, pc.dim);
        try {
          await restoreTrack(source, track);
          setStatus(`↺ Wiederhergestellt: ${track.name}`, pc.dim);
        } catch (error) {
          setStatus(`Wiederherstellen fehlgeschlagen: ${(error as Error).message}`, pc.red);
        }
      }
      decisions.set(targetIndex, action);
      const entry = history.find((h) => h.index === targetIndex);
      if (entry) entry.decision = action;
    }

    isEditing = false;
    editingIndex = undefined;
    view.index = originalIndex;
    view.positionMs = originalPositionMs;
    view.isPaused = originalIsPaused;
    return action === 'quit';
  }

  // Reviews the track currently at view.index: shows it, plays it, waits for
  // a key, applies the decision. Returns true when the user asked to quit.
  async function reviewOneTrack(): Promise<boolean> {
    const item = tracks[view.index]!;
    const track = item.track;
    await startPlayback(track);

    let action: Decision | 'undo' | 'quit' | undefined;

    while (!action) {
      const key = await readKey();

      if (key.ctrl && key.name === 'c') {
        action = 'quit';
        break;
      }

      const normalized = normalizeKey(key);

      // While a history entry is highlighted, ↑/↓/Enter/Esc drive the
      // browser and everything else (k, r, space, ...) is ignored — they'd
      // otherwise silently apply to the *current*, not-yet-decided track.
      if (historyCursor !== null) {
        switch (normalized) {
          case 'up':
            historyCursor = Math.max(0, historyCursor - 1);
            render();
            break;
          case 'down':
            historyCursor = historyCursor + 1 >= history.length ? null : historyCursor + 1;
            render();
            break;
          case 'escape':
            historyCursor = null;
            render();
            break;
          case 'enter': {
            const target = history[historyCursor]!;
            historyCursor = null;
            const quitRequested = await editHistoryEntry(target.index, target.track);
            if (quitRequested) {
              quitEarly = true;
              return true;
            }
            await startPlayback(track); // resume the original track after the detour
            break;
          }
          default:
            break;
        }
        continue;
      }

      switch (normalized) {
        case 'enter':
        case 'k':
          action = 'kept';
          break;
        case 'r':
        case 'backspace':
          action = 'removed';
          break;
        case 'q':
          action = 'quit';
          break;
        case 'u':
          action = 'undo';
          break;
        case 'up':
          if (history.length > 0) {
            historyCursor = history.length - 1;
            render();
          }
          break;
        default:
          await handlePlaybackOrOpenKey(normalized, track);
          break;
      }
    }

    if (action === 'quit') {
      quitEarly = true;
      return true;
    }

    if (action === 'undo') {
      if (history.length === 0) {
        setStatus('Nichts zum Zurücknehmen.', pc.dim);
        return false;
      }
      await undoOne();
      return false;
    }

    decisions.set(view.index, action);
    history.push({ index: view.index, decision: action, track });

    if (action === 'removed') {
      setStatus(`Entferne: ${track.name}…`, pc.dim);
      try {
        await removeTrack(source, track);
        setStatus(`✗ Entfernt: ${track.name}`, pc.red);
      } catch (error) {
        setStatus(`Entfernen fehlgeschlagen (${track.name}): ${(error as Error).message}`, pc.red);
      }
    } else {
      setStatus(`✓ Behalten: ${track.name}`, pc.green);
    }

    view.index += 1;
    await saveResumeOffset(source, view.index, tracks.length);
    return false;
  }

  try {
    await withRawMode(async () => {
      while (view.index < tracks.length) {
        // Last-resort safety net: reviewOneTrack() already handles its own
        // known failure modes (a failed removal, a playback hiccup, ...)
        // without returning abnormally. This catches anything unforeseen so
        // a single bad track can't take the whole session down with it.
        try {
          const shouldQuit = await reviewOneTrack();
          if (shouldQuit) break;
        } catch (error) {
          setStatus(`Unerwarteter Fehler: ${(error as Error).message} — springe zum nächsten Song.`, pc.red);
          view.index += 1;
          await saveResumeOffset(source, view.index, tracks.length).catch(() => undefined);
        }
      }

      if (hasDevice) {
        await safePlayback(() => pausePlayback(deviceId), () => undefined);
      }
    });
  } finally {
    process.stdout.off('resize', onResize);
    exitAltScreen();
  }

  const removed = [...decisions.entries()]
    .filter(([, decision]) => decision === 'removed')
    .map(([i]) => tracks[i]!.track);
  const kept = [...decisions.values()].filter((d) => d === 'kept').length;

  return { kept, removed, reviewedCount: decisions.size, total: tracks.length, quitEarly };
}

import * as p from '@clack/prompts';
import pc from 'picocolors';
import open from 'open';

import { loadConfig, updateConfig, type ResumeState } from '../config.js';
import { t } from '../i18n/index.js';
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

/**
 * Finds where to resume by locating the saved cursor's *track* in the
 * freshly-fetched list, not by trusting a raw position — indices from an
 * earlier session don't survive songs that were since removed (a preceding
 * removal shifts everything after it one slot earlier, but a URI still
 * identifies the right track wherever it now sits). Doesn't disambiguate
 * duplicate tracks in the same source; a rare enough case not to bother.
 * Pure and exported (unlike the two functions below it) so this — the part
 * that actually had the bug — is unit-testable without driving a clack
 * prompt or touching the config file.
 */
export function findResumeIndex(tracks: TrackItem[], saved: ResumeState | undefined): number {
  if (!saved) return 0;
  const foundIndex = tracks.findIndex((item) => item.track.uri === saved.nextTrackUri);
  // Not just "not found" (that track's gone missing some other way) but also
  // "found at 0" (nothing before it to actually skip) both mean there's
  // nothing worth resuming to — starting over would do the exact same thing.
  return foundIndex > 0 ? foundIndex : 0;
}

/** What `resume[key]` should become after this decision — or undefined to clear it, once every track has one. Pure for the same reason as `findResumeIndex`. */
export function nextResumeState(tracks: TrackItem[], nextIndex: number): ResumeState | undefined {
  const next = tracks[nextIndex];
  return next ? { nextTrackUri: next.track.uri, updatedAt: new Date().toISOString() } : undefined;
}

async function loadResumeOffset(source: TrackSource, tracks: TrackItem[]): Promise<number> {
  const config = await loadConfig();
  const foundIndex = findResumeIndex(tracks, config.resume?.[resumeKeyFor(source)]);
  if (foundIndex <= 0) return 0;

  const choice = await p.select({
    message: t('review.resume.question', { current: foundIndex + 1, total: tracks.length }),
    options: [
      { value: foundIndex, label: t('review.resume.continueOption') },
      { value: 0, label: t('review.resume.startOverOption') },
    ],
  });

  return p.isCancel(choice) ? 0 : choice;
}

async function saveResumeOffset(source: TrackSource, tracks: TrackItem[], nextIndex: number): Promise<void> {
  const state = nextResumeState(tracks, nextIndex);
  await updateConfig((c) => {
    c.resume ??= {};
    if (state) {
      c.resume[resumeKeyFor(source)] = state;
    } else {
      delete c.resume[resumeKeyFor(source)];
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
    throw new Error(t('common.needsTty'));
  }

  // Loading + resume choice still happen in the normal scrollback via clack —
  // only the review loop itself takes over the full screen. Not covered by
  // the per-track safety net further down (that only wraps the review loop
  // itself), so it needs its own: otherwise a failure here is an unhandled
  // rejection with a bare, contextless message ("Forbidden") instead of a
  // clear "loading X failed" one.
  const spinner = p.spinner();
  spinner.start(t('review.loading', { name: source.name }));
  let tracks: TrackItem[];
  try {
    tracks = await fetchAllTracks(source, (loaded, loadedTotal) => {
      spinner.message(t('review.loadingProgress', { name: source.name, loaded, total: loadedTotal }));
    });
  } catch (error) {
    spinner.stop(t('review.loadFailed', { name: source.name }), 1);
    throw new Error(t('review.loadError', { name: source.name, message: (error as Error).message }));
  }
  spinner.stop(t('review.loaded', { count: tracks.length }));

  const startOffset = await loadResumeOffset(source, tracks);

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
      stopTicking();
      setStatus(
        t(reason === 'PREMIUM_REQUIRED' ? 'review.playback.premiumRequired' : 'review.playback.noDevice'),
        pc.yellow
      );
      return;
    }

    const detail = reason ? ` (${reason})` : '';
    setStatus(t('review.playback.actionFailed', { detail, message: (error as Error).message }), pc.yellow);
  };

  const onResize = () => render();

  enterAltScreen();
  process.stdout.on('resize', onResize);

  // view.positionMs otherwise only ever moved on an explicit action (seek,
  // pause, a new track starting) — it went stale the moment you just sat and
  // listened, so the position line/progress bar appeared frozen, and a later
  // seek would then jump from that stale spot instead of roughly where
  // playback actually was. This ticks it forward once a second instead,
  // while a track is actually playing.
  let tickTimer: NodeJS.Timeout | undefined;

  function stopTicking(): void {
    if (tickTimer) {
      clearInterval(tickTimer);
      tickTimer = undefined;
    }
  }

  function startTicking(durationMs: number): void {
    stopTicking();
    tickTimer = setInterval(() => {
      if (view.isPaused) return;
      view.positionMs = Math.min(durationMs, view.positionMs + 1000);
      render();
    }, 1000);
  }

  // Starts (or restarts) chorus-first playback for `track`, currently shown
  // at view.index, and renders. Shared between entering a track normally and
  // resuming the original track after a history-browser detour. Also clears
  // any leftover status message — otherwise the previous track's "✓ Behalten:
  // …"/"✗ Entfernt: …" keeps showing while you're already reviewing (or
  // playing back) a different one, which reads as if it were about *this*
  // track.
  async function startPlayback(track: SpotifyTrack): Promise<void> {
    status = undefined;
    view.positionMs = estimateChorusPositionMs(track.duration_ms);
    view.isPaused = false;
    render();

    if (hasDevice && !track.is_local) {
      startTicking(track.duration_ms);
      // Awaited (not fire-and-forget): a pause/seek pressed while this is
      // still in flight would race it and produce spurious errors.
      await safePlayback(() => playTrackAt(track.uri, view.positionMs, deviceId), onPlaybackError);
      render();
    } else {
      stopTicking();
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
        setStatus(t('review.openedInSpotify', { name: track.name }), pc.dim);
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
      case 'right':
        if (hasDevice) {
          view.positionMs += SEEK_STEP_MS;
          await safePlayback(() => seek(view.positionMs, deviceId), onPlaybackError);
          render();
        }
        return true;
      case 'left':
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
        : key.name === 'up' || key.name === 'down' || key.name === 'left' || key.name === 'right' || key.name === 'escape'
          ? key.name
          : key.char?.toLowerCase();
  }

  // Re-decides exactly one past track picked in the history browser, then
  // returns to wherever the session actually was — everything reviewed
  // since stays as it was. Only this track's own decision changes (and only
  // if it actually changed); nothing after it gets rewound or re-reviewed.
  // `historyPosition` is this entry's position in the `history` array —
  // the same space `historyCursor` and the list's rendering use, which
  // only matches the track's absolute `.index` when the session didn't
  // resume partway through (that mismatch was exactly the bug: the edited
  // row failed to highlight at all after resuming, since `editingIndex` was
  // being compared against the array-position space while holding an
  // absolute index).
  // Returns true if the user asked to quit while doing this.
  async function editHistoryEntry(historyPosition: number): Promise<boolean> {
    const { index: targetIndex, track } = history[historyPosition]!;
    const originalIndex = view.index;
    const originalPositionMs = view.positionMs;
    const originalIsPaused = view.isPaused;

    const previousDecision = decisions.get(targetIndex);

    view.index = targetIndex;
    isEditing = true;
    editingIndex = historyPosition;
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
        setStatus(t('review.removing', { name: track.name }), pc.dim);
        try {
          await removeTrack(source, track);
          setStatus(`✗ ${t('review.removed', { name: track.name })}`, pc.red);
        } catch (error) {
          setStatus(t('review.removeFailed', { name: track.name, message: (error as Error).message }), pc.red);
        }
      } else {
        setStatus(t('review.restoring', { name: track.name }), pc.dim);
        try {
          await restoreTrack(source, track);
          setStatus(`↺ ${t('review.restored', { name: track.name })}`, pc.dim);
        } catch (error) {
          setStatus(t('review.restoreFailed', { message: (error as Error).message }), pc.red);
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

    let action: Decision | 'quit' | undefined;

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
            const position = historyCursor;
            historyCursor = null;
            const quitRequested = await editHistoryEntry(position);
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
        case 'u': {
          // Fast shortcut for the most common case — correcting the very last
          // decision — reusing editHistoryEntry() rather than a separate
          // pop/rewind path, so there's exactly one way this behaves.
          if (history.length === 0) {
            setStatus(t('review.nothingToCorrect'), pc.dim);
            break;
          }
          const quitRequested = await editHistoryEntry(history.length - 1);
          if (quitRequested) {
            quitEarly = true;
            return true;
          }
          await startPlayback(track); // resume the original track after the detour
          break;
        }
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

    decisions.set(view.index, action);
    history.push({ index: view.index, decision: action, track });

    if (action === 'removed') {
      setStatus(t('review.removing', { name: track.name }), pc.dim);
      try {
        await removeTrack(source, track);
        setStatus(`✗ ${t('review.removed', { name: track.name })}`, pc.red);
      } catch (error) {
        setStatus(t('review.removeFailed', { name: track.name, message: (error as Error).message }), pc.red);
      }
    } else {
      setStatus(`✓ ${t('review.kept', { name: track.name })}`, pc.green);
    }

    view.index += 1;
    await saveResumeOffset(source, tracks, view.index);
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
          setStatus(t('review.unexpectedError', { message: (error as Error).message }), pc.red);
          view.index += 1;
          await saveResumeOffset(source, tracks, view.index).catch(() => undefined);
        }
      }

      if (hasDevice) {
        await safePlayback(() => pausePlayback(deviceId), () => undefined);
      }
    });
  } finally {
    stopTicking();
    process.stdout.off('resize', onResize);
    exitAltScreen();
  }

  const removed = [...decisions.entries()]
    .filter(([, decision]) => decision === 'removed')
    .map(([i]) => tracks[i]!.track);
  const kept = [...decisions.values()].filter((d) => d === 'kept').length;

  return { kept, removed, reviewedCount: decisions.size, total: tracks.length, quitEarly };
}

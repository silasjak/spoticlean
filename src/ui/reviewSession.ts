import * as p from '@clack/prompts';
import pc from 'picocolors';
import open from 'open';

import { loadConfig, updateConfig } from '../config.js';
import { SpotifyApiError } from '../spotify/client.js';
import { estimateChorusPositionMs, pausePlayback, playTrackAt, resumePlayback, seek } from '../spotify/playback.js';
import { fetchAllTracks, removeTrack, restoreTrack, type TrackSource } from '../spotify/tracks.js';
import type { SpotifyTrack } from '../spotify/types.js';
import { isInteractiveTerminal, readKey, withRawMode } from './keypress.js';
import { buildReviewFrame, type LogLine } from './reviewFrame.js';
import { enterAltScreen, exitAltScreen, paintFrame, terminalHeight, terminalWidth } from './terminal.js';

const SEEK_STEP_MS = 10_000;

type Decision = 'kept' | 'removed';
type HistoryEntry = { index: number; action: Decision; track: SpotifyTrack };

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
  // only the review loop itself takes over the full screen.
  const spinner = p.spinner();
  spinner.start(`Lade Songs aus "${source.name}"…`);
  const tracks = await fetchAllTracks(source, (loaded, loadedTotal) => {
    spinner.message(`Lade Songs aus "${source.name}"… (${loaded}/${loadedTotal})`);
  });
  spinner.stop(`${tracks.length} Songs geladen.`);

  const startOffset = await loadResumeOffset(source, tracks.length);

  const decisions = new Map<number, Decision>();
  const history: HistoryEntry[] = [];
  const log: LogLine[] = [];
  let hasDevice = Boolean(deviceId);
  let quitEarly = false;

  // Mutable "what's on screen right now" state, read live by render() — a
  // shared object rather than per-iteration `let`s, so render() (called
  // from key handlers closed over the loop below) always sees the current
  // track/position, not a stale snapshot from when it was defined.
  const view = { index: startOffset, positionMs: 0, isPaused: false };

  function pushLog(text: string, color?: (t: string) => string): void {
    log.push({ text, color });
    render();
  }

  function replaceLastLog(text: string, color?: (t: string) => string): void {
    const entry: LogLine = { text, color };
    if (log.length > 0) log[log.length - 1] = entry;
    else log.push(entry);
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
        log,
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
      pushLog(
        reason === 'PREMIUM_REQUIRED'
          ? 'Automatisches Abspielen benötigt Spotify Premium — nur noch Metadaten.'
          : 'Kein aktives Wiedergabegerät mehr gefunden — nur noch Metadaten.',
        pc.yellow
      );
      return;
    }

    const detail = reason ? ` (${reason})` : '';
    pushLog(`Wiedergabe-Aktion fehlgeschlagen${detail}: ${(error as Error).message}`, pc.yellow);
  };

  const onResize = () => render();

  enterAltScreen();
  process.stdout.on('resize', onResize);

  try {
    await withRawMode(async () => {
      while (view.index < tracks.length) {
        const item = tracks[view.index]!;
        const track = item.track;

        view.positionMs = estimateChorusPositionMs(track.duration_ms);
        view.isPaused = false;
        render();

        if (hasDevice && !track.is_local) {
          // Awaited (not fire-and-forget): a pause/seek pressed while this
          // is still in flight would race it and produce spurious errors.
          await safePlayback(() => playTrackAt(track.uri, view.positionMs, deviceId), onPlaybackError);
          render();
        }

        let action: Decision | 'undo' | 'quit' | undefined;

        while (!action) {
          const key = await readKey();

          if (key.ctrl && key.name === 'c') {
            action = 'quit';
            break;
          }

          const normalized =
            key.name === 'return'
              ? 'enter'
              : key.name === 'backspace' || key.name === 'delete' || key.char === '\u007f'
                ? 'backspace'
                : key.char?.toLowerCase();

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
            case 'o':
              openInSpotify(track);
              pushLog(`In Spotify geöffnet: ${track.name}`, pc.dim);
              break;
            case ' ':
              if (hasDevice) {
                const ok = view.isPaused
                  ? await safePlayback(() => resumePlayback(deviceId), onPlaybackError)
                  : await safePlayback(() => pausePlayback(deviceId), onPlaybackError);
                if (ok) view.isPaused = !view.isPaused;
                render();
              }
              break;
            case '.':
            case 'l':
              if (hasDevice) {
                view.positionMs += SEEK_STEP_MS;
                await safePlayback(() => seek(view.positionMs, deviceId), onPlaybackError);
                render();
              }
              break;
            case ',':
            case 'h':
              if (hasDevice) {
                view.positionMs = Math.max(0, view.positionMs - SEEK_STEP_MS);
                await safePlayback(() => seek(view.positionMs, deviceId), onPlaybackError);
                render();
              }
              break;
            case 'b':
              if (hasDevice) {
                view.positionMs = estimateChorusPositionMs(track.duration_ms);
                await safePlayback(() => seek(view.positionMs, deviceId), onPlaybackError);
                render();
              }
              break;
            default:
              break;
          }
        }

        if (action === 'quit') {
          quitEarly = true;
          break;
        }

        if (action === 'undo') {
          const last = history.pop();
          if (!last) {
            pushLog('Nichts zum Zurücknehmen.', pc.dim);
            continue;
          }

          decisions.delete(last.index);
          view.index = last.index;

          if (last.action === 'removed') {
            pushLog(`Wiederherstellen: ${last.track.name}…`, pc.dim);
            try {
              await restoreTrack(source, last.track);
              replaceLastLog(`↺ Wiederhergestellt: ${last.track.name}`, pc.dim);
            } catch (error) {
              replaceLastLog(`Wiederherstellen fehlgeschlagen: ${(error as Error).message}`, pc.red);
            }
          } else {
            pushLog(`↺ Zurückgenommen: ${last.track.name}`, pc.dim);
          }
          continue;
        }

        decisions.set(view.index, action);
        history.push({ index: view.index, action, track });

        if (action === 'removed') {
          pushLog(`Entferne: ${track.name}…`, pc.dim);
          try {
            await removeTrack(source, track);
            replaceLastLog(`✗ Entfernt: ${track.name}`, pc.red);
          } catch (error) {
            replaceLastLog(`Entfernen fehlgeschlagen (${track.name}): ${(error as Error).message}`, pc.red);
          }
        } else {
          pushLog(`✓ Behalten: ${track.name}`, pc.green);
        }

        view.index += 1;
        await saveResumeOffset(source, view.index, tracks.length);
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

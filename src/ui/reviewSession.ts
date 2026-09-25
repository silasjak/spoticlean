import * as p from '@clack/prompts';
import pc from 'picocolors';
import open from 'open';

import { loadConfig, updateConfig } from '../config.js';
import { estimateChorusPositionMs, pausePlayback, playTrackAt, resumePlayback, seek } from '../spotify/playback.js';
import { SpotifyApiError } from '../spotify/client.js';
import { fetchAllTracks, removeTrack, restoreTrack, type TrackSource } from '../spotify/tracks.js';
import type { SpotifyTrack, TrackItem } from '../spotify/types.js';
import { formatAddedAt, formatArtists, formatDuration } from './format.js';
import { isInteractiveTerminal, readKey, withRawMode } from './keypress.js';

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

function printHelp(hasDevice: boolean): void {
  const lines = [
    `${pc.green('Enter / k')}  Keep — Song bleibt`,
    `${pc.red('⌫ / r')}       Remove — Song wird entfernt`,
    `${pc.dim('u')}            Undo — letzte Entscheidung zurücknehmen`,
    hasDevice ? `${pc.dim('Leertaste')}    Pause / Weiter` : undefined,
    hasDevice ? `${pc.dim(', / .')}      10s zurück / vor` : undefined,
    hasDevice ? `${pc.dim('b')}            Zurück zum Refrain-Einstieg` : undefined,
    `${pc.dim('o')}            In Spotify öffnen`,
    `${pc.dim('q')}            Beenden (Fortschritt wird gespeichert)`,
    `${pc.dim('?')}            Diese Hilfe`,
  ].filter(Boolean);
  p.note(lines.join('\n'), 'Tasten');
}

function renderTrackCard(item: TrackItem, index: number, total: number): void {
  const track = item.track;
  const lines = [
    `${pc.bold(track.name)}`,
    `${pc.dim(formatArtists(track))} · ${track.album.name}`,
    `${pc.dim(`${formatDuration(track.duration_ms)} · hinzugefügt am ${formatAddedAt(item.added_at)}`)}`,
  ];
  p.note(lines.join('\n'), `Track ${index + 1} / ${total}`);
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

  const spinner = p.spinner();
  spinner.start(`Lade Songs aus "${source.name}"…`);
  const tracks = await fetchAllTracks(source, (loaded, loadedTotal) => {
    spinner.message(`Lade Songs aus "${source.name}"… (${loaded}/${loadedTotal})`);
  });
  spinner.stop(`${tracks.length} Songs geladen.`);

  const startOffset = await loadResumeOffset(source, tracks.length);
  printHelp(Boolean(deviceId));

  const decisions = new Map<number, Decision>();
  const history: HistoryEntry[] = [];
  let hasDevice = Boolean(deviceId);
  let index = startOffset;
  let quitEarly = false;

  // Only these Spotify error reasons mean auto-play genuinely can't work any
  // more this session. Everything else (e.g. ALREADY_PAUSED from a stray key
  // press while a call is still in flight, a transient 5xx, ...) is just
  // noted and retried on the next action instead of disabling playback.
  const SESSION_ENDING_REASONS = new Set(['PREMIUM_REQUIRED', 'NO_ACTIVE_DEVICE']);

  const onPlaybackError = (error: unknown) => {
    const reason = error instanceof SpotifyApiError ? error.reason : undefined;

    if (hasDevice && reason && SESSION_ENDING_REASONS.has(reason)) {
      hasDevice = false;
      p.log.warn(
        reason === 'PREMIUM_REQUIRED'
          ? 'Automatisches Abspielen benötigt Spotify Premium — verwende ab jetzt nur noch Metadaten.'
          : 'Kein aktives Wiedergabegerät mehr gefunden — verwende ab jetzt nur noch Metadaten.'
      );
      return;
    }

    const detail = reason ? ` (${reason})` : '';
    p.log.warn(`Wiedergabe-Aktion fehlgeschlagen${detail}: ${(error as Error).message}`);
  };

  await withRawMode(async () => {
    while (index < tracks.length) {
      const item = tracks[index]!;
      const track = item.track;
      renderTrackCard(item, index, tracks.length);

      let positionMs = estimateChorusPositionMs(track.duration_ms);
      let isPaused = false;

      if (hasDevice && !track.is_local) {
        // Awaited (not fire-and-forget): a pause/seek pressed while this is
        // still in flight raced it and produced confusing, spurious errors.
        await safePlayback(() => playTrackAt(track.uri, positionMs, deviceId), onPlaybackError);
      } else if (track.is_local) {
        p.log.message(pc.dim('Lokale Datei — kann nicht über Spotify Connect abgespielt werden.'));
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
          case '?':
            printHelp(hasDevice);
            break;
          case 'o':
            openInSpotify(track);
            p.log.message(pc.dim('In Spotify geöffnet.'));
            break;
          case ' ':
            if (hasDevice) {
              const ok = isPaused
                ? await safePlayback(() => resumePlayback(deviceId), onPlaybackError)
                : await safePlayback(() => pausePlayback(deviceId), onPlaybackError);
              if (ok) isPaused = !isPaused;
            }
            break;
          case '.':
          case 'l':
            if (hasDevice) {
              positionMs += SEEK_STEP_MS;
              await safePlayback(() => seek(positionMs, deviceId), onPlaybackError);
            }
            break;
          case ',':
          case 'h':
            if (hasDevice) {
              positionMs = Math.max(0, positionMs - SEEK_STEP_MS);
              await safePlayback(() => seek(positionMs, deviceId), onPlaybackError);
            }
            break;
          case 'b':
            if (hasDevice) {
              positionMs = estimateChorusPositionMs(track.duration_ms);
              await safePlayback(() => seek(positionMs, deviceId), onPlaybackError);
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
          p.log.message(pc.dim('Nichts zum Zurücknehmen.'));
          continue;
        }

        decisions.delete(last.index);
        index = last.index;

        if (last.action === 'removed') {
          const spin = p.spinner();
          spin.start('Mache Entfernen rückgängig…');
          try {
            await restoreTrack(source, last.track);
            spin.stop(`↺ Wiederhergestellt: ${last.track.name}`);
          } catch (error) {
            spin.stop(pc.red(`Wiederherstellen fehlgeschlagen: ${(error as Error).message}`));
          }
        } else {
          p.log.message(pc.dim(`↺ Zurückgenommen: ${last.track.name}`));
        }
        continue;
      }

      decisions.set(index, action);
      history.push({ index, action, track });

      if (action === 'removed') {
        const spin = p.spinner();
        spin.start('Entferne…');
        try {
          await removeTrack(source, track);
          spin.stop(pc.red(`✗ Entfernt: ${track.name}`));
        } catch (error) {
          spin.stop(pc.red(`Entfernen fehlgeschlagen: ${(error as Error).message}`));
        }
      } else {
        p.log.message(pc.green(`✓ Behalten: ${track.name}`));
      }

      index += 1;
      await saveResumeOffset(source, index, tracks.length);
    }

    if (hasDevice) {
      await safePlayback(() => pausePlayback(deviceId), () => undefined);
    }
  });

  const removed = [...decisions.entries()]
    .filter(([, decision]) => decision === 'removed')
    .map(([i]) => tracks[i]!.track);
  const kept = [...decisions.values()].filter((d) => d === 'kept').length;

  return { kept, removed, reviewedCount: decisions.size, total: tracks.length, quitEarly };
}

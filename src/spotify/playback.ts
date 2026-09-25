import { spotify } from './client.js';
import type { Device, PlaybackState } from './types.js';

export function getDevices(): Promise<{ devices: Device[] }> {
  return spotify.get<{ devices: Device[] }>('/me/player/devices') as Promise<{ devices: Device[] }>;
}

export async function getPlaybackState(): Promise<PlaybackState> {
  const state = await spotify.get<PlaybackState>('/me/player');
  return state ?? null;
}

export async function transferPlayback(deviceId: string): Promise<void> {
  await spotify.put('/me/player', { device_ids: [deviceId], play: false });
}

export async function playTrackAt(uri: string, positionMs: number, deviceId?: string): Promise<void> {
  await spotify.put(
    '/me/player/play',
    { uris: [uri], position_ms: Math.max(0, Math.floor(positionMs)) },
    deviceId ? { device_id: deviceId } : undefined
  );
}

export async function pausePlayback(deviceId?: string): Promise<void> {
  await spotify.put('/me/player/pause', undefined, deviceId ? { device_id: deviceId } : undefined);
}

export async function resumePlayback(deviceId?: string): Promise<void> {
  await spotify.put('/me/player/play', undefined, deviceId ? { device_id: deviceId } : undefined);
}

export async function seek(positionMs: number, deviceId?: string): Promise<void> {
  await spotify.put(
    '/me/player/seek',
    undefined,
    { position_ms: Math.max(0, Math.floor(positionMs)), device_id: deviceId }
  );
}

/**
 * Rough heuristic for "where the chorus probably starts": most pop/rock
 * songs land their first chorus somewhere around 35-45% in, after an
 * intro + verse + pre-chorus. Not musicologically rigorous, just good
 * enough to skip past the intro instead of starting at 0:00. Short tracks
 * (intros, interludes) just start from the beginning.
 */
export function estimateChorusPositionMs(durationMs: number): number {
  if (durationMs < 60_000) return 0;
  return Math.floor(durationMs * 0.4);
}

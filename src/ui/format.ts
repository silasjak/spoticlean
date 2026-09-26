import { localeTag } from '../i18n/index.js';
import type { SpotifyTrack } from '../spotify/types.js';

export function formatDuration(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function formatArtists(track: SpotifyTrack): string {
  return track.artists.map((artist) => artist.name).join(', ');
}

export function formatAddedAt(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(localeTag(), { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return iso;
  }
}

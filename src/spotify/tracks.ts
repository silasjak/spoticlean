import { spotify } from './client.js';
import type { Paging, SpotifyTrack, TrackItem } from './types.js';

export type TrackSource =
  | { kind: 'playlist'; id: string; name: string }
  | { kind: 'liked'; name: string };

const PAGE_SIZE = 50;

const PLAYLIST_FIELDS =
  'items(added_at,track(id,uri,name,duration_ms,is_local,preview_url,artists(name),album(name,images))),total,next';
const LIKED_FIELDS = PLAYLIST_FIELDS; // identical shape ("SavedTrackObject")

export async function fetchTracksPage(
  source: TrackSource,
  offset: number,
  limit = PAGE_SIZE
): Promise<Paging<TrackItem>> {
  if (source.kind === 'playlist') {
    return (await spotify.get<Paging<TrackItem>>(`/playlists/${source.id}/tracks`, {
      limit,
      offset,
      fields: PLAYLIST_FIELDS,
    })) as Paging<TrackItem>;
  }

  return (await spotify.get<Paging<TrackItem>>('/me/tracks', {
    limit,
    offset,
    fields: LIKED_FIELDS,
  })) as Paging<TrackItem>;
}

/** Fetches every track in the source, in order. Simple approach: this app is meant for playlists of a personal, not gigantic, size. */
export async function fetchAllTracks(
  source: TrackSource,
  onProgress?: (loaded: number, total: number) => void
): Promise<TrackItem[]> {
  const all: TrackItem[] = [];
  let offset = 0;
  let total = Infinity;

  while (offset < total) {
    const page = await fetchTracksPage(source, offset);
    total = page.total;
    all.push(...page.items);
    offset += page.items.length || PAGE_SIZE;
    onProgress?.(all.length, total);
    if (page.items.length === 0) break; // safety net against an infinite loop
  }

  return all;
}

export async function removeTrack(source: TrackSource, track: SpotifyTrack): Promise<void> {
  if (source.kind === 'playlist') {
    // Removing by URI drops every occurrence of this track in the playlist —
    // fine (and arguably desirable) for a cleanup tool, but worth knowing.
    await spotify.delete(`/playlists/${source.id}/tracks`, { tracks: [{ uri: track.uri }] });
    return;
  }

  // /me/tracks addresses tracks by id, which local files don't have — fail
  // with a clear message instead of sending {ids:[null]} to the API.
  if (!track.id) {
    throw new Error('Lokale Dateien können nicht aus Liked Songs entfernt werden.');
  }
  await spotify.delete('/me/tracks', { ids: [track.id] });
}

/** Re-adds a track that was just removed. Used for the "undo" action. */
export async function restoreTrack(source: TrackSource, track: SpotifyTrack): Promise<void> {
  if (source.kind === 'playlist') {
    await spotify.post(`/playlists/${source.id}/tracks`, { uris: [track.uri] });
    return;
  }

  if (!track.id) {
    throw new Error('Lokale Dateien können nicht zu Liked Songs hinzugefügt werden.');
  }
  await spotify.put('/me/tracks', { ids: [track.id] });
}

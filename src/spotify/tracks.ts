import { spotify } from './client.js';
import type { Paging, SpotifyTrack, TrackItem } from './types.js';

export type TrackSource =
  | { kind: 'playlist'; id: string; name: string }
  | { kind: 'liked'; name: string };

const PAGE_SIZE = 50;

// Since Spotify's February 2026 Development Mode changes, a playlist's
// paginated entries nest the track under "item" (GET /playlists/{id}/items),
// while Liked Songs (GET /me/tracks — reading it was not affected, only
// saving/removing) still nests it under "track". Two field-filters, two
// raw shapes, normalized below so the rest of the app only ever sees "track".
const PLAYLIST_FIELDS =
  'items(added_at,item(id,uri,name,duration_ms,is_local,preview_url,artists(name),album(name,images))),total,next';
const LIKED_FIELDS =
  'items(added_at,track(id,uri,name,duration_ms,is_local,preview_url,artists(name),album(name,images))),total,next';

type RawEntry = { added_at: string; track?: SpotifyTrack; item?: SpotifyTrack };

function normalize(raw: RawEntry): TrackItem {
  const track = raw.item ?? raw.track;
  if (!track) {
    throw new Error('Unerwartete Antwort von Spotify: weder "track" noch "item" im Eintrag vorhanden.');
  }
  return { added_at: raw.added_at, track };
}

export async function fetchTracksPage(
  source: TrackSource,
  offset: number,
  limit = PAGE_SIZE
): Promise<Paging<TrackItem>> {
  if (source.kind === 'playlist') {
    const page = (await spotify.get<Paging<RawEntry>>(`/playlists/${source.id}/items`, {
      limit,
      offset,
      fields: PLAYLIST_FIELDS,
    })) as Paging<RawEntry>;
    return { ...page, items: page.items.map(normalize) };
  }

  const page = (await spotify.get<Paging<RawEntry>>('/me/tracks', {
    limit,
    offset,
    fields: LIKED_FIELDS,
  })) as Paging<RawEntry>;
  return { ...page, items: page.items.map(normalize) };
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
    // DELETE /playlists/{id}/items (Feb 2026: renamed from .../tracks, and
    // the body's array field renamed tracks -> items).
    await spotify.delete(`/playlists/${source.id}/items`, { items: [{ uri: track.uri }] });
    return;
  }

  // Local files aren't real catalog items — Spotify's library endpoints
  // don't support them. Fail clearly instead of sending a spotify:local:
  // URI and getting back some other opaque error.
  if (track.is_local) {
    throw new Error('Lokale Dateien können nicht aus Liked Songs entfernt werden.');
  }
  // DELETE /me/library (Feb 2026: replaces the entity-specific /me/tracks,
  // /me/albums, etc. — addresses everything by URI via a query param).
  await spotify.delete('/me/library', undefined, { uris: track.uri });
}

/** Re-adds a track that was just removed. Used for the "undo" action. */
export async function restoreTrack(source: TrackSource, track: SpotifyTrack): Promise<void> {
  if (source.kind === 'playlist') {
    // POST /playlists/{id}/items (Feb 2026: renamed from .../tracks; the
    // body shape itself — {uris: [...]} — was already unchanged).
    await spotify.post(`/playlists/${source.id}/items`, { uris: [track.uri] });
    return;
  }

  if (track.is_local) {
    throw new Error('Lokale Dateien können nicht zu Liked Songs hinzugefügt werden.');
  }
  await spotify.put('/me/library', undefined, { uris: track.uri });
}

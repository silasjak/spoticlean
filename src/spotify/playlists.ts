import { spotify } from './client.js';
import type { Me, Paging, SimplifiedPlaylist } from './types.js';

const PAGE_SIZE = 50;

export function getMe(): Promise<Me> {
  return spotify.get<Me>('/me') as Promise<Me>;
}

/** All playlists owned by `me` (excludes ones the user only follows). */
export async function listOwnedPlaylists(me: Me): Promise<SimplifiedPlaylist[]> {
  const owned: SimplifiedPlaylist[] = [];
  let offset = 0;

  for (;;) {
    const page = (await spotify.get<Paging<SimplifiedPlaylist>>('/me/playlists', {
      limit: PAGE_SIZE,
      offset,
    })) as Paging<SimplifiedPlaylist>;

    // Spotify occasionally returns a `null` item (e.g. a playlist that was
    // deleted right after being listed) — skip those rather than crash.
    owned.push(...page.items.filter((playlist) => playlist?.owner?.id === me.id));

    if (!page.next) break;
    offset += PAGE_SIZE;
  }

  return owned;
}

export async function getLikedSongsTotal(): Promise<number> {
  const page = (await spotify.get<Paging<unknown>>('/me/tracks', { limit: 1 })) as Paging<unknown>;
  return page.total;
}

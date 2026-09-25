import * as p from '@clack/prompts';

import { AuthCancelled } from '../errors.js';
import { getLikedSongsTotal, getMe, listOwnedPlaylists } from '../spotify/playlists.js';
import type { TrackSource } from '../spotify/tracks.js';

export async function selectSource(): Promise<{ source: TrackSource; total: number }> {
  const spinner = p.spinner();
  spinner.start('Lade deine Playlisten…');

  const me = await getMe();
  const [playlists, likedTotal] = await Promise.all([listOwnedPlaylists(me), getLikedSongsTotal()]);

  spinner.stop(`${playlists.length} eigene Playlist(en) gefunden.`);

  const options: { value: { source: TrackSource; total: number }; label: string; hint: string }[] = [
    {
      value: { source: { kind: 'liked', name: 'Liked Songs' }, total: likedTotal },
      label: `💚 Liked Songs`,
      hint: `${likedTotal} Songs`,
    },
    ...playlists.map((playlist) => ({
      value: {
        source: { kind: 'playlist' as const, id: playlist.id, name: playlist.name },
        total: playlist.tracks.total,
      },
      label: playlist.name,
      hint: `${playlist.tracks.total} Songs`,
    })),
  ];

  const choice = await p.select({
    message: 'Welche Playlist möchtest du aufräumen?',
    options,
  });

  if (p.isCancel(choice)) throw new AuthCancelled();
  return choice;
}

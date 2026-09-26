import * as p from '@clack/prompts';

import { AuthCancelled } from '../errors.js';
import { t } from '../i18n/index.js';
import { getLikedSongsTotal, getMe, listOwnedPlaylists } from '../spotify/playlists.js';
import type { TrackSource } from '../spotify/tracks.js';

export async function selectSource(): Promise<{ source: TrackSource; total: number }> {
  const spinner = p.spinner();
  spinner.start(t('source.loading'));

  const me = await getMe();
  const [playlists, likedTotal] = await Promise.all([listOwnedPlaylists(me), getLikedSongsTotal()]);

  spinner.stop(t('source.loaded', { count: playlists.length }));

  const unknownCountPlaylists = playlists.filter((playlist) => playlist.items?.total == null);
  if (unknownCountPlaylists.length > 0) {
    p.log.warn(
      t('source.unknownCountWarning', {
        count: unknownCountPlaylists.length,
        names: unknownCountPlaylists.map((playlist) => `"${playlist.name}"`).join(', '),
      })
    );
  }

  const options: { value: { source: TrackSource; total: number }; label: string; hint: string }[] = [
    {
      value: { source: { kind: 'liked', name: t('source.likedSongsName') }, total: likedTotal },
      label: `💚 ${t('source.likedSongsName')}`,
      hint: t('source.songsCount', { count: likedTotal }),
    },
    ...playlists.map((playlist) => {
      const total = playlist.items?.total;
      return {
        value: {
          source: { kind: 'playlist' as const, id: playlist.id, name: playlist.name },
          total: total ?? 0,
        },
        label: playlist.name,
        hint: total == null ? t('source.unknownSongCount') : t('source.songsCount', { count: total }),
      };
    }),
  ];

  const choice = await p.select({
    message: t('source.selectQuestion'),
    options,
  });

  if (p.isCancel(choice)) throw new AuthCancelled();
  return choice;
}

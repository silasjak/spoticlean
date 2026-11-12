import pc from 'picocolors';

import { t } from '../i18n/index.js';
import { estimateChorusPositionMs } from '../spotify/playback.js';
import type { SpotifyTrack, TrackItem } from '../spotify/types.js';
import { spotifyGreen } from './brand.js';
import { boxBlank, boxBottom, boxDivider, boxLine, boxTop, fitWidth, innerWidth } from './box.js';
import { formatAddedAt, formatArtists, formatDuration } from './format.js';
import { packKeyHints } from './hintLine.js';
import { alertLabel, buildStatusRow, type Decision, type StatusLine } from './reviewFrame.js';
import { truncate } from './terminal.js';

/** The cover as rendered lines, or why there's none (yet). */
export type CoverState = string[] | 'loading' | 'none';

export type InfoFrameState = {
  sourceName: string;
  item: TrackItem;
  /** 1-based position of the shown track in the source. */
  trackNumber: number;
  totalTracks: number;
  /** 1-based position the review itself is at — the header stays the review's, with "› Song info" appended. */
  reviewTrackNumber: number;
  /** What's playing underneath (not necessarily the shown track), for the status/progress row above the key legend. */
  nowPlaying: {
    track: SpotifyTrack | undefined;
    hasDevice: boolean;
    isPaused: boolean;
    positionMs: number;
    status?: StatusLine;
    /** Spinner glyph while an action is waiting on Spotify — replaces the play/pause icon. */
    spinner?: string;
  };
  /** Set for already-decided tracks (opened from the history list); undefined = not decided yet. */
  decision?: Decision;
  cover: CoverState;
  /** Shown in the bottom border for as long as it's set, see `boxBottom`. */
  alert?: string;
  width: number;
  height: number;
};

const GAP = 3;
const MAX_COVER_COLUMNS = 40;
/** Narrower than this, the details go below the cover instead of next to it. */
const SIDE_BY_SIDE_MIN_WIDTH = 72;

// Box chrome around the body: top border, blank, blank, status row, divider, one hint line, bottom border.
const CHROME_ROWS = 7;
// Roughly how many detail lines there are, reserved under a stacked cover.
const DETAIL_ROWS_STACKED = 12;

/**
 * How wide (in terminal columns) the cover is drawn — and so how many
 * columns to render it at, which the session needs to know before the
 * frame itself is built. Rows are always half of that (see renderCover()).
 */
export function coverColumnsFor(width: number, height: number): number {
  const inner = innerWidth(width);
  const bodyRows = Math.max(0, height - CHROME_ROWS);
  const columns =
    width >= SIDE_BY_SIDE_MIN_WIDTH
      ? Math.min(MAX_COVER_COLUMNS, Math.floor(inner * 0.45), bodyRows * 2)
      : // Stacked: leave room for the details below.
        Math.min(MAX_COVER_COLUMNS, inner, (bodyRows - DETAIL_ROWS_STACKED) * 2);
  // Below ~12 columns a cover is just colored noise — skip it.
  return columns >= 12 ? columns : 0;
}

/** Placeholder of the cover's size while it loads (or when there is none), with a short centered label. */
function placeholder(columns: number, label: string): string[] {
  const rows = Math.max(1, Math.round(columns / 2));
  const fill = '░'.repeat(columns);
  const text = truncate(label, columns);
  const left = Math.floor((columns - text.length) / 2);
  const middle = '░'.repeat(left) + text + '░'.repeat(columns - left - text.length);
  return Array.from({ length: rows }, (_, row) => pc.dim(row === Math.floor((rows - 1) / 2) ? middle : fill));
}

function albumTypeLabel(type: string | undefined): string | undefined {
  if (type === 'album' || type === 'single' || type === 'compilation') return t(`review.info.albumTypes.${type}`);
  return type;
}

/** Label/value rows for the details column; values are plain text (colored here, after truncation by the caller). */
function detailRows(state: InfoFrameState): { label: string; value: string; color?: (text: string) => string }[] {
  const { item, decision, trackNumber, totalTracks, sourceName } = state;
  const track = item.track;
  const album = track.album;
  const year = album.release_date?.slice(0, 4);
  const release = [albumTypeLabel(album.album_type), year].filter(Boolean).join(' · ');

  const rows: { label: string; value: string; color?: (text: string) => string }[] = [
    { label: t('review.info.album'), value: album.name },
  ];
  if (release) rows.push({ label: t('review.info.release'), value: release });
  if (track.track_number && album.total_tracks) {
    rows.push({
      label: t('review.info.trackOnAlbum'),
      value: t('review.info.ofTotal', { current: track.track_number, total: album.total_tracks }),
    });
  }
  rows.push({
    label: t('review.info.duration'),
    value: `${formatDuration(track.duration_ms)}${track.explicit ? ` · ${t('review.info.explicit')}` : ''}`,
  });
  if (!track.is_local && track.duration_ms >= 60_000) {
    rows.push({ label: t('review.info.chorus'), value: formatDuration(estimateChorusPositionMs(track.duration_ms)) });
  }
  rows.push({ label: t('review.info.added'), value: formatAddedAt(item.added_at) });
  rows.push({
    label: t('review.info.position'),
    value: t('review.info.positionValue', { current: trackNumber, total: totalTracks, source: sourceName }),
  });
  rows.push(
    decision === 'kept'
      ? { label: t('review.info.decision'), value: `✓ ${t('review.info.kept')}`, color: pc.green }
      : decision === 'removed'
        ? { label: t('review.info.decision'), value: `✗ ${t('review.info.removed')}`, color: pc.red }
        : { label: t('review.info.decision'), value: t('review.info.undecided'), color: pc.dim }
  );
  if (track.is_local) {
    rows.push({ label: '', value: t('review.frame.localFile'), color: pc.dim });
  } else if (track.id) {
    rows.push({ label: t('review.info.link'), value: `open.spotify.com/track/${track.id}`, color: pc.dim });
  }
  return rows;
}

/**
 * Pure frame builder for the song info view (`i`): the cover drawn with
 * half blocks on the left, title/artists and a label–value list of details
 * on the right (or below, on a narrow terminal), and a one-line key legend.
 * Same box style as the review frame, so it reads as a different view of
 * the same screen rather than a separate app.
 */
export function buildInfoFrame(state: InfoFrameState): string[] {
  const { width, height, item, cover } = state;
  const track = item.track;
  const inner = innerWidth(width);
  const coverColumns = coverColumnsFor(width, height);
  const coverLines =
    coverColumns === 0
      ? []
      : cover === 'loading'
        ? placeholder(coverColumns, t('review.info.coverLoading'))
        : cover === 'none'
          ? placeholder(coverColumns, t('review.info.noCover'))
          : cover;

  const sideBySide = width >= SIDE_BY_SIDE_MIN_WIDTH && coverColumns > 0;
  const detailWidth = sideBySide ? inner - coverColumns - GAP : inner;

  const rows = detailRows(state);
  const labelWidth = Math.max(...rows.map((row) => row.label.length));
  const details: string[] = [
    spotifyGreen(pc.bold(truncate(track.name, detailWidth))),
    truncate(formatArtists(track), detailWidth),
    '',
    ...rows.map(({ label, value, color }) => {
      const paddedLabel = label.padEnd(labelWidth);
      const fittedValue = truncate(value, Math.max(0, detailWidth - labelWidth - 2));
      return `${pc.dim(paddedLabel)}  ${(color ?? ((text: string) => text))(fittedValue)}`;
    }),
  ];

  const body: string[] = [];
  if (sideBySide) {
    const count = Math.max(coverLines.length, details.length);
    for (let row = 0; row < count; row++) {
      const left = coverLines[row] ?? ' '.repeat(coverColumns);
      body.push(boxLine(`${left}${' '.repeat(GAP)}${details[row] ?? ''}`, width));
    }
  } else {
    for (const line of coverLines) body.push(boxLine(line, width));
    if (coverLines.length > 0) body.push(boxBlank(width));
    for (const line of details) body.push(boxLine(line, width));
  }

  const { nowPlaying } = state;
  const hints = packKeyHints(
    [
      { key: 'i/Esc', desc: t('review.hints.closeInfo') },
      ...(nowPlaying.hasDevice
        ? [
            { key: '␣', desc: t('review.hints.pause') },
            { key: '←/→', desc: t('review.hints.seek') },
          ]
        : []),
      { key: 'o', desc: t('review.hints.open') },
    ],
    inner
  );

  // Same header as the review screen plus where you are, so this reads as a
  // level below it rather than a separate screen.
  const reviewTitle = t('review.frame.title', {
    source: state.sourceName,
    current: state.reviewTrackNumber,
    total: state.totalTracks,
  });
  const title = fitWidth(`${reviewTitle} › ${t('review.info.title')}`, width, 3);
  // The playing track is named in front of its progress bar only when the
  // view shows a different one — otherwise the title right above says it.
  const playingOther = nowPlaying.track && nowPlaying.track.uri !== track.uri;
  const statusRow = buildStatusRow({ ...nowPlaying, label: playingOther ? nowPlaying.track!.name : undefined }, inner);

  const fixed = CHROME_ROWS - 1 + hints.length;
  const visibleBody = body.slice(0, Math.max(0, height - fixed));
  return [
    boxTop(width, title),
    boxBlank(width),
    ...visibleBody,
    boxBlank(width),
    boxLine(statusRow, width),
    boxDivider(width),
    ...hints.map((line) => boxLine(line, width)),
    boxBottom(width, alertLabel(state.alert, width)),
  ];
}

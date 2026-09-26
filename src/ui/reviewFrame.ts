import pc from 'picocolors';

import type { SpotifyTrack, TrackItem } from '../spotify/types.js';
import { boxBlank, boxBottom, boxDivider, boxLine, boxTop, fitWidth, innerWidth } from './box.js';
import { formatAddedAt, formatArtists, formatDuration } from './format.js';
import { buildKeyHintLines } from './keyHints.js';

export type Decision = 'kept' | 'removed';
export type HistoryEntry = { track: SpotifyTrack; decision: Decision };
export type StatusLine = { text: string; color?: (text: string) => string };

export type ReviewFrameState = {
  sourceName: string;
  /** 1-based. */
  trackNumber: number;
  totalTracks: number;
  item: TrackItem | undefined;
  hasDevice: boolean;
  positionMs: number;
  isPaused: boolean;
  /** Every already-decided track, in review order (index 0 = first reviewed). */
  history: HistoryEntry[];
  /** Index (array position, *not* the track's absolute review index) into `history` that's highlighted for jump-back, or null when not browsing. */
  historyCursor: number | null;
  /** True while re-deciding one specific past track opened from the history browser. */
  editing?: boolean;
  /** Same array-position space as `historyCursor` — that entry is highlighted (with a note) while editing. */
  editingIndex?: number;
  status?: StatusLine;
  width: number;
  height: number;
};

const identity = (text: string) => text;

/** Keeps `cursor` inside the visible window, centering on it once the list no longer fits. */
function computeHistoryWindow(total: number, capacity: number, cursor: number | null): { start: number; end: number } {
  if (capacity <= 0 || total === 0) return { start: 0, end: 0 };
  if (total <= capacity) return { start: 0, end: total };
  if (cursor === null) return { start: total - capacity, end: total }; // tail view, matches the non-browsing default

  const start = Math.max(0, Math.min(cursor - Math.floor((capacity - 1) / 2), total - capacity));
  return { start, end: start + capacity };
}

/**
 * Pure frame builder for the full-screen review UI: one continuous box with
 * a header, the current track, a "Verlauf" history list (browsable with
 * ↑/↓, sized to whatever vertical space is left), and a sticky key-hint
 * footer. Kept separate from terminal I/O so the layout arithmetic can be
 * unit tested directly.
 */
export function buildReviewFrame(state: ReviewFrameState): string[] {
  const {
    width,
    height,
    item,
    hasDevice,
    positionMs,
    isPaused,
    history,
    historyCursor,
    editing = false,
    editingIndex,
    status,
    sourceName,
    trackNumber,
    totalTracks,
  } = state;
  const track = item?.track;
  const browsing = historyCursor !== null;
  const hintMode = editing ? 'edit' : browsing ? 'browse' : 'review';

  const title = `spoticlean · ${sourceName} · Track ${trackNumber}/${totalTracks}`;
  const header = [boxTop(width, fitWidth(title, width, 3))];

  const card: string[] = [boxBlank(width)];
  if (track && item) {
    card.push(boxLine(pc.bold(fitWidth(track.name, width)), width));
    card.push(boxLine(pc.dim(fitWidth(`${formatArtists(track)} · ${track.album.name}`, width)), width));
    card.push(
      boxLine(
        pc.dim(
          fitWidth(`${formatDuration(track.duration_ms)} · hinzugefügt am ${formatAddedAt(item.added_at)}`, width)
        ),
        width
      )
    );
    if (track.is_local) {
      card.push(boxLine(pc.dim('Lokale Datei — kein Abspielen über Spotify Connect möglich.'), width));
    } else if (hasDevice) {
      card.push(boxLine(pc.dim(`${isPaused ? '⏸' : '▶'} ab ${formatDuration(positionMs)}`), width));
    }
  }
  // Always exactly one status row (blank when there's nothing to say) so the
  // card doesn't change height depending on whether a message is showing.
  card.push(boxLine(status ? (status.color ?? identity)(fitWidth(status.text, width)) : '', width));
  card.push(boxBlank(width));

  const footerHintLines = buildKeyHintLines(hasDevice, innerWidth(width), hintMode).map((line) => boxLine(line, width));
  const footer = [boxDivider(width), ...footerHintLines, boxBottom(width)];

  // Header, card and footer (the sticky key legend) always take priority —
  // the "Verlauf" section (its divider included) only appears at all once
  // there's room left for at least that divider row, and otherwise shrinks
  // first on a short terminal rather than pushing the footer off-screen.
  const fixedRows = header.length + card.length + footer.length;
  const historyCapacity = Math.max(0, height - fixedRows - 1);
  const hasRoomForHistorySection = height - fixedRows >= 1;

  let historySection: string[] = [];
  if (hasRoomForHistorySection) {
    // The not-yet-decided track still pending in the normal flow gets its own
    // trailing row, right after the decided ones — grayed out, so the list
    // doesn't make it look like review is one song behind. Suppressed while
    // editing: `track` there is the past entry being re-decided, not the one
    // actually still pending, which stays paused off-screen meanwhile.
    const showCurrentRow = !editing && Boolean(track);
    const combinedTotal = history.length + (showCurrentRow ? 1 : 0);

    // Whichever row needs to stay in view: the browse cursor, or (mutually
    // exclusive with browsing) the entry currently being re-decided.
    const focusIndex = historyCursor ?? editingIndex ?? null;
    const { start, end } = computeHistoryWindow(combinedTotal, historyCapacity, focusIndex);

    const historyLines: string[] = [];
    for (let globalIndex = start; globalIndex < end; globalIndex++) {
      if (globalIndex >= history.length) {
        historyLines.push(boxLine(fitWidth(`→ ${track!.name}`, width), width, 1, 'current'));
        continue;
      }
      const entry = history[globalIndex]!;
      const symbol = entry.decision === 'removed' ? '✗' : '✓';
      const isBeingEdited = globalIndex === editingIndex;
      const label = `${symbol} ${entry.track.name}${isBeingEdited ? ' (wird korrigiert)' : ''}`;
      const fitted = fitWidth(label, width);
      // Being-edited and browse-cursor are mutually exclusive (see above), but
      // check editing first anyway so its more subdued style always wins.
      if (isBeingEdited) {
        historyLines.push(boxLine(fitted, width, 1, 'editing'));
      } else if (globalIndex === historyCursor) {
        historyLines.push(boxLine(fitted, width, 1, 'cursor')); // inverted, no color — the highlight *is* the signal
      } else {
        const colorFn = entry.decision === 'removed' ? pc.red : pc.green;
        historyLines.push(boxLine(colorFn(fitted), width, 1));
      }
    }
    const lines =
      historyLines.length > 0
        ? historyLines
        : historyCapacity > 0
          ? [boxLine(pc.dim('Noch keine Entscheidungen.'), width)]
          : [];
    historySection = [boxDivider(width, 'Verlauf'), ...lines];
  }

  return [...header, ...card, ...historySection, ...footer];
}

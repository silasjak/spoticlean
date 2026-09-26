import pc from 'picocolors';

import { visibleLength } from './terminal.js';

type KeyHint = { key: string; desc: string; requiresDevice?: boolean };
export type HintMode = 'review' | 'browse' | 'edit';

const REVIEW_HINTS: KeyHint[] = [
  { key: '⏎/k', desc: 'keep' },
  { key: '⌫/r', desc: 'remove' },
  { key: '↑/↓', desc: 'Verlauf' },
  { key: 'u', desc: 'undo' },
  { key: '␣', desc: 'pause', requiresDevice: true },
  { key: ',/.', desc: 'seek', requiresDevice: true },
  { key: 'b', desc: 'refrain', requiresDevice: true },
  { key: 'o', desc: 'open' },
  { key: 'q', desc: 'quit' },
];

/** Shown instead of REVIEW_HINTS while a history entry is highlighted (browsing mode, not yet committed to reopening it). */
const BROWSE_HINTS: KeyHint[] = [
  { key: '↑/↓', desc: 'auswählen' },
  { key: '⏎', desc: 'dorthin springen & neu entscheiden' },
  { key: 'Esc', desc: 'abbrechen' },
];

/**
 * Shown while re-deciding one specific past track from the history browser.
 * No undo/history-browsing here — only this one track's decision (and
 * playback) is in play; everything else keeps its original decision and the
 * session returns to where it was once this is confirmed or cancelled.
 */
const EDIT_HINTS: KeyHint[] = [
  { key: '⏎/k', desc: 'keep' },
  { key: '⌫/r', desc: 'remove' },
  { key: '␣', desc: 'pause', requiresDevice: true },
  { key: ',/.', desc: 'seek', requiresDevice: true },
  { key: 'b', desc: 'refrain', requiresDevice: true },
  { key: 'o', desc: 'open' },
  { key: 'Esc', desc: 'abbrechen' },
];

const SEPARATOR = '   ';

function renderHint(hint: KeyHint): string {
  return `${pc.bold(pc.cyan(hint.key))} ${pc.dim(hint.desc)}`;
}

/**
 * Packs the key legend into as few lines as fit `maxWidth`, wrapping to a
 * second (or third) line on a narrow terminal instead of overflowing.
 */
export function buildKeyHintLines(hasDevice: boolean, maxWidth: number, mode: HintMode = 'review'): string[] {
  const source = mode === 'browse' ? BROWSE_HINTS : mode === 'edit' ? EDIT_HINTS : REVIEW_HINTS;
  const hints = source.filter((hint) => hasDevice || !hint.requiresDevice);
  const lines: string[] = [];
  let current = '';

  for (const hint of hints) {
    const rendered = renderHint(hint);
    const candidate = current ? `${current}${SEPARATOR}${rendered}` : rendered;
    if (current && visibleLength(candidate) > maxWidth) {
      lines.push(current);
      current = rendered;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [''];
}

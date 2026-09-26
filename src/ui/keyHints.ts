import pc from 'picocolors';

import { t } from '../i18n/index.js';
import { visibleLength } from './terminal.js';

type KeyHint = { key: string; desc: string; requiresDevice?: boolean };
export type HintMode = 'review' | 'browse' | 'edit';

// Built as functions (not module-level constants) so `desc` picks up the
// active language at render time — i18n only initializes once cli.ts's
// main() runs, which is after this module is first imported.

function reviewHints(): KeyHint[] {
  return [
    { key: '⏎/k', desc: t('review.hints.keep') },
    { key: '⌫/r', desc: t('review.hints.remove') },
    { key: '↑/↓', desc: t('review.hints.history') },
    { key: 'u', desc: t('review.hints.correctLast') },
    { key: '␣', desc: t('review.hints.pause'), requiresDevice: true },
    { key: '←/→', desc: t('review.hints.seek'), requiresDevice: true },
    { key: 'b', desc: t('review.hints.chorus'), requiresDevice: true },
    { key: 'o', desc: t('review.hints.open') },
    { key: 'q', desc: t('review.hints.quit') },
  ];
}

/** Shown instead of reviewHints() while a history entry is highlighted (browsing mode, not yet committed to reopening it). */
function browseHints(): KeyHint[] {
  return [
    { key: '↑/↓', desc: t('review.hints.select') },
    { key: '⏎', desc: t('review.hints.openAndCorrect') },
    { key: 'Esc', desc: t('review.hints.cancel') },
  ];
}

/**
 * Shown while re-deciding one specific past track from the history browser.
 * No undo/history-browsing here — only this one track's decision (and
 * playback) is in play; everything else keeps its original decision and the
 * session returns to where it was once this is confirmed or cancelled.
 */
function editHints(): KeyHint[] {
  return [
    { key: '⏎/k', desc: t('review.hints.keep') },
    { key: '⌫/r', desc: t('review.hints.remove') },
    { key: '␣', desc: t('review.hints.pause'), requiresDevice: true },
    { key: '←/→', desc: t('review.hints.seek'), requiresDevice: true },
    { key: 'b', desc: t('review.hints.chorus'), requiresDevice: true },
    { key: 'o', desc: t('review.hints.open') },
    { key: 'Esc', desc: t('review.hints.cancel') },
  ];
}

const SEPARATOR = '   ';

function renderHint(hint: KeyHint): string {
  return `${pc.bold(pc.cyan(hint.key))} ${pc.dim(hint.desc)}`;
}

/**
 * Packs the key legend into as few lines as fit `maxWidth`, wrapping to a
 * second (or third) line on a narrow terminal instead of overflowing.
 */
export function buildKeyHintLines(hasDevice: boolean, maxWidth: number, mode: HintMode = 'review'): string[] {
  const source = mode === 'browse' ? browseHints() : mode === 'edit' ? editHints() : reviewHints();
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

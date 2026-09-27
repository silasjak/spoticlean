import pc from 'picocolors';

import { visibleLength } from './terminal.js';

export type KeyHint = { key: string; desc: string };

const SEPARATOR = '   ';

function renderHint(hint: KeyHint): string {
  return `${pc.bold(pc.cyan(hint.key))} ${pc.dim(hint.desc)}`;
}

/**
 * Packs a key legend into as few lines as fit `maxWidth`, wrapping to a
 * second (or third) line on a narrow terminal instead of overflowing.
 * Shared between keyHints.ts (the review screen) and settingsFrame.ts.
 */
export function packKeyHints(hints: KeyHint[], maxWidth: number): string[] {
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

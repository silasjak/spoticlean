import pc from 'picocolors';

import { visibleLength } from './terminal.js';

type KeyHint = { key: string; desc: string; requiresDevice?: boolean };

const KEY_HINTS: KeyHint[] = [
  { key: '⏎/k', desc: 'keep' },
  { key: '⌫/r', desc: 'remove' },
  { key: 'u', desc: 'undo' },
  { key: '␣', desc: 'pause', requiresDevice: true },
  { key: ',/.', desc: 'seek', requiresDevice: true },
  { key: 'b', desc: 'refrain', requiresDevice: true },
  { key: 'o', desc: 'open' },
  { key: 'q', desc: 'quit' },
];

const SEPARATOR = '   ';

function renderHint(hint: KeyHint): string {
  return `${pc.bold(pc.cyan(hint.key))} ${pc.dim(hint.desc)}`;
}

/**
 * Packs the key legend into as few lines as fit `maxWidth`, wrapping to a
 * second (or third) line on a narrow terminal instead of overflowing.
 */
export function buildKeyHintLines(hasDevice: boolean, maxWidth: number): string[] {
  const hints = KEY_HINTS.filter((hint) => hasDevice || !hint.requiresDevice);
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

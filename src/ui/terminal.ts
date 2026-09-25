/**
 * Minimal raw-terminal primitives for the full-screen review UI: switching
 * to the alternate screen buffer (like vim/htop/less — leaves the user's
 * normal scrollback untouched and restores it on exit), and painting a
 * frame of lines with absolute cursor positioning so redraws never leave
 * stray characters behind.
 */

// eslint-disable-next-line no-control-regex -- deliberately matching the ESC control character to strip ANSI color codes
const ANSI_PATTERN = /\x1b\[[0-9;]*m/g;

let altScreenActive = false;

export function enterAltScreen(): void {
  process.stdout.write('\x1b[?1049h\x1b[?25l'); // switch buffer, hide cursor
  altScreenActive = true;
}

export function exitAltScreen(): void {
  // Safe to call even if we never entered — terminals just ignore it.
  process.stdout.write('\x1b[?25h\x1b[?1049l'); // show cursor, restore buffer
  altScreenActive = false;
}

export function isAltScreenActive(): boolean {
  return altScreenActive;
}

export function terminalWidth(): number {
  return process.stdout.columns || 80;
}

export function terminalHeight(): number {
  return process.stdout.rows || 24;
}

/** Length of a string as it appears on screen, ignoring ANSI color codes. */
export function visibleLength(text: string): number {
  return text.replace(ANSI_PATTERN, '').length;
}

/** Truncates plain text (apply coloring after) to fit, adding an ellipsis if cut. */
export function truncate(text: string, maxWidth: number): string {
  if (maxWidth <= 0) return '';
  if (text.length <= maxWidth) return text;
  if (maxWidth === 1) return '…';
  return text.slice(0, maxWidth - 1) + '…';
}

/**
 * Pads a (possibly colored) line with spaces so it fills exactly `width`
 * columns. Callers are expected to size their content to fit — as a last
 * resort for a miscalculated line, an oversized one is stripped of color
 * and hard-clipped (slicing colored text directly could cut an escape
 * sequence in half and bleed color onto the rest of the frame).
 */
function padLine(line: string, width: number): string {
  const len = visibleLength(line);
  if (len === width) return line;
  if (len < width) return line + ' '.repeat(width - len);
  return line.replace(ANSI_PATTERN, '').slice(0, width);
}

/**
 * Repaints the whole screen with `lines`, clearing first so a shorter frame
 * never leaves remnants of a longer previous one. Lines beyond the terminal
 * height are dropped (callers size their layout to fit).
 */
export function paintFrame(lines: string[]): void {
  const width = terminalWidth();
  const height = terminalHeight();
  const body = lines
    .slice(0, height)
    .map((line) => padLine(line, width))
    .join('\r\n');
  // Raw mode can disable output post-processing (no \n -> \r\n translation),
  // so every line break above is an explicit \r\n.
  process.stdout.write('\x1b[2J\x1b[H' + body);
}

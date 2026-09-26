import pc from 'picocolors';

import { truncate, visibleLength } from './terminal.js';

/** Draws a single continuous bordered box (top/dividers/bottom + content lines), full width. */

function horizontal(width: number): string {
  return '─'.repeat(Math.max(0, width));
}

function withTitle(left: string, right: string, title: string, width: number): string {
  const label = title ? ` ${title} ` : '';
  // `left` is 2 chars ('┌─'/'├─'), `right` is 1 ('┐'/'┤') — subtract their
  // real lengths rather than assuming 1+1, or the line ends up 1 too wide.
  const dashes = Math.max(0, width - left.length - right.length - visibleLength(label));
  return pc.dim(left + label + horizontal(dashes) + right);
}

export function boxTop(width: number, title = ''): string {
  return withTitle('┌─', '┐', title, width);
}

export function boxDivider(width: number, title = ''): string {
  return withTitle('├─', '┤', title, width);
}

export function boxBottom(width: number): string {
  return pc.dim('└' + horizontal(width - 2) + '┘');
}

/** Background styles a content line can be rendered in, see `boxLine`. */
export type LineHighlight = 'none' | 'cursor' | 'editing' | 'current';

/**
 * A content line, padded to fit inside the border. `content` should
 * already fit within `innerWidth(width, indent)` — truncate the *plain*
 * text with `fitWidth()` before applying color, since slicing already-
 * colored text can cut an escape sequence in half and bleed color onto
 * everything after it. `highlight` shades the padded content (padding
 * included, borders excluded) without needing its own foreground color:
 * `'cursor'` is full inverse video, for the row the browse cursor sits
 * on; `'editing'` is a dimmer yellow tint, for the row currently being
 * re-decided; `'current'` is a plain gray tint, for the not-yet-decided
 * row still pending in the normal flow — all deliberately less loud than
 * the cursor's inverse.
 */
export function boxLine(content: string, width: number, indent = 1, highlight: LineHighlight = 'none'): string {
  const pad = ' '.repeat(Math.max(0, innerWidth(width, indent) - visibleLength(content)));
  const body = ' '.repeat(indent) + content + pad;
  const styled =
    highlight === 'cursor'
      ? pc.inverse(body)
      : highlight === 'editing'
        ? pc.bgYellow(pc.black(body))
        : highlight === 'current'
          ? pc.bgBlackBright(body)
          : body;
  return pc.dim('│') + styled + pc.dim('│');
}

export function innerWidth(width: number, indent = 1): number {
  return Math.max(0, width - 2 - indent);
}

/** Truncates plain (not yet colored) text to fit a content line of this width. */
export function fitWidth(text: string, width: number, indent = 1): string {
  return truncate(text, innerWidth(width, indent));
}

export function boxBlank(width: number): string {
  return boxLine('', width, 0);
}

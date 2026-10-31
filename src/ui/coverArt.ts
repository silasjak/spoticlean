import jpeg from 'jpeg-js';
import pc from 'picocolors';

import { debugLog } from '../debug.js';
import type { SpotifyImage } from '../spotify/types.js';

/** Decoded RGBA pixels, row by row (4 bytes per pixel). */
export type RgbaImage = { width: number; height: number; data: Uint8Array };

/**
 * How colorful the terminal can draw: 24-bit ("truecolor": iTerm2, kitty,
 * WezTerm, VS Code, …), the 256-color palette (macOS Terminal.app — which
 * shows 24-bit escapes as garbage instead), or no color at all.
 */
export type ColorMode = 'truecolor' | '256' | 'ascii';

export function detectColorMode(env: NodeJS.ProcessEnv = process.env): ColorMode {
  if (!pc.isColorSupported) return 'ascii';
  const colorterm = (env.COLORTERM ?? '').toLowerCase();
  if (colorterm.includes('truecolor') || colorterm.includes('24bit')) return 'truecolor';
  return '256';
}

/**
 * Picks the smallest cover at least `minSize` px wide — Spotify usually
 * offers 640/300/64; 300 is plenty for a few dozen terminal columns and
 * decodes a lot faster than 640.
 */
export function pickCoverImage(images: SpotifyImage[], minSize = 120): SpotifyImage | undefined {
  const sized = images.filter((image) => image.url);
  const big = sized
    .filter((image) => (image.width ?? 0) >= minSize)
    .sort((a, b) => (a.width ?? 0) - (b.width ?? 0));
  return big[0] ?? sized[0];
}

const cache = new Map<string, Promise<RgbaImage | null>>();

/**
 * Downloads and decodes a cover (Spotify's image CDN serves JPEGs, no auth
 * needed), cached per URL for the session so flipping the info view open
 * and closed doesn't re-download. Resolves to null when it can't be shown
 * — offline, not a JPEG, … — the info view then just goes without.
 */
export function loadCover(url: string): Promise<RgbaImage | null> {
  let pending = cache.get(url);
  if (!pending) {
    pending = (async () => {
      try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const bytes = new Uint8Array(await response.arrayBuffer());
        const { width, height, data } = jpeg.decode(bytes, { useTArray: true, formatAsRGBA: true });
        return { width, height, data };
      } catch (error) {
        debugLog(`cover ${url} could not be loaded: ${(error as Error).message}`);
        return null;
      }
    })();
    cache.set(url, pending);
  }
  return pending;
}

type Rgb = [number, number, number];

/** Average color of the source pixels that fall into one target pixel — a box filter, so detail averages out instead of aliasing. */
function sampleArea(image: RgbaImage, x0: number, y0: number, x1: number, y1: number): Rgb {
  let r = 0;
  let g = 0;
  let b = 0;
  let count = 0;
  const xs = Math.floor(x0);
  const ys = Math.floor(y0);
  const xe = Math.max(xs + 1, Math.ceil(x1));
  const ye = Math.max(ys + 1, Math.ceil(y1));
  for (let y = ys; y < Math.min(ye, image.height); y++) {
    for (let x = xs; x < Math.min(xe, image.width); x++) {
      const i = (y * image.width + x) * 4;
      r += image.data[i]!;
      g += image.data[i + 1]!;
      b += image.data[i + 2]!;
      count++;
    }
  }
  return count ? [Math.round(r / count), Math.round(g / count), Math.round(b / count)] : [0, 0, 0];
}

/** Nearest color of xterm's 256-color palette (6×6×6 cube or the 24-step gray ramp, whichever is closer). */
export function toAnsi256([r, g, b]: Rgb): number {
  // Cube steps are 0, 95, 135, 175, 215, 255 — thresholds halfway between them.
  const level = (value: number) => (value < 48 ? 0 : value < 115 ? 1 : Math.min(5, Math.round((value - 55) / 40)));
  const steps = [0, 95, 135, 175, 215, 255];
  const [ri, gi, bi] = [level(r), level(g), level(b)];
  const cube = 16 + 36 * ri + 6 * gi + bi;
  const cubeDistance = (steps[ri]! - r) ** 2 + (steps[gi]! - g) ** 2 + (steps[bi]! - b) ** 2;

  const average = (r + g + b) / 3;
  const grayIndex = Math.max(0, Math.min(23, Math.round((average - 8) / 10)));
  const grayValue = 8 + grayIndex * 10;
  const grayDistance = (grayValue - r) ** 2 + (grayValue - g) ** 2 + (grayValue - b) ** 2;

  return grayDistance < cubeDistance ? 232 + grayIndex : cube;
}

const ASCII_RAMP = ' .:-=+*#%@';

/**
 * Renders `image` as `columns` terminal cells wide. With color, each cell
 * is an upper half block "▀" — foreground = top pixel, background = bottom
 * pixel — so one row of text shows two rows of pixels; with terminal cells
 * roughly twice as tall as wide, a square cover then needs columns/2 rows
 * and still looks square. Without color it falls back to an ASCII
 * brightness ramp at one pixel per cell (same proportions).
 */
export function renderCover(image: RgbaImage, columns: number, mode: ColorMode): string[] {
  const rows = Math.max(1, Math.round(columns / 2));
  const cellWidth = image.width / columns;
  const lines: string[] = [];

  if (mode === 'ascii') {
    const cellHeight = image.height / rows;
    for (let row = 0; row < rows; row++) {
      let line = '';
      for (let col = 0; col < columns; col++) {
        const [r, g, b] = sampleArea(image, col * cellWidth, row * cellHeight, (col + 1) * cellWidth, (row + 1) * cellHeight);
        const brightness = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        line += ASCII_RAMP[Math.min(ASCII_RAMP.length - 1, Math.floor(brightness * ASCII_RAMP.length))];
      }
      lines.push(line);
    }
    return lines;
  }

  const pixelHeight = image.height / (rows * 2);
  const fg = (color: Rgb) => (mode === 'truecolor' ? `38;2;${color.join(';')}` : `38;5;${toAnsi256(color)}`);
  const bg = (color: Rgb) => (mode === 'truecolor' ? `48;2;${color.join(';')}` : `48;5;${toAnsi256(color)}`);
  for (let row = 0; row < rows; row++) {
    let line = '';
    for (let col = 0; col < columns; col++) {
      const x0 = col * cellWidth;
      const x1 = x0 + cellWidth;
      const top = sampleArea(image, x0, row * 2 * pixelHeight, x1, (row * 2 + 1) * pixelHeight);
      const bottom = sampleArea(image, x0, (row * 2 + 1) * pixelHeight, x1, (row * 2 + 2) * pixelHeight);
      line += `\x1b[${fg(top)};${bg(bottom)}m▀`;
    }
    lines.push(`${line}\x1b[0m`);
  }
  return lines;
}

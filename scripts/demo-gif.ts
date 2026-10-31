// Generates media/demo.gif for the README — NOT part of the app. Replays a
// short review session (keep, remove, browsing the history, the song info
// view, keep) through the real, pure frame builders (buildReviewFrame,
// buildInfoFrame) with sample data — well-known 80s/90s songs, their covers
// fetched from Apple's artwork CDN (needs network) — so no Spotify login is
// needed and the GIF always matches the current UI. Each frame's ANSI
// output is converted to HTML, screenshotted in headless Chromium, and
// encoded into one looping GIF.
//
// One-time setup: npx playwright-core install chromium-headless-shell
//                 (or point CHROMIUM_PATH at a Chromium you already have)
// Then:           npm run demo:gif
// gifenc and playwright-core are devDependencies — `npm i spoticlean` never
// installs them, and the published package only contains dist/ anyway.
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import gifenc from 'gifenc';
import pc from 'picocolors';
import { chromium } from 'playwright-core';

import { initI18n } from '../src/i18n/index.js';
import { estimateChorusPositionMs } from '../src/spotify/playback.js';
import type { SpotifyTrack, TrackItem } from '../src/spotify/types.js';
import { loadCover, renderCover, type RgbaImage } from '../src/ui/coverArt.js';
import { buildInfoFrame } from '../src/ui/infoFrame.js';
import { buildReviewFrame, THUMBNAIL_COLUMNS, type HistoryEntry } from '../src/ui/reviewFrame.js';

// gifenc only ships CommonJS without an exports map, so named imports don't resolve under ESM.
const { applyPalette, GIFEncoder, quantize } = gifenc;

const OUT_FILE = path.resolve(import.meta.dirname, '..', 'media', 'demo.gif');
const COLS = 80;
const ROWS = 24;
const OUTPUT_WIDTH = 960;
const RENDER_SCALE = 1.5; // rendered larger, then scaled down to OUTPUT_WIDTH for smoother glyphs

// picocolors decides once at import time whether to emit colors; the frames
// are only ever fed to our own ANSI parser, so always force them on.
if (!pc.isColorSupported) {
  console.error('Run with FORCE_COLOR=1 (npm run demo:gif does this).');
  process.exit(1);
}

await initI18n('en');

// --- Sample data ---------------------------------------------------------

function track(name: string, artist: string, album: string, year: string, ms: number): SpotifyTrack {
  return {
    id: name.replace(/\W/g, ''),
    uri: `spotify:track:${name}`,
    name,
    duration_ms: ms,
    artists: [{ name: artist }],
    album: { name: album, images: [], album_type: 'album', release_date: year },
    preview_url: null,
    is_local: false,
  };
}

// 80s/90s classics; the last element is the album's artwork on Apple's
// image CDN (looked up once via the public iTunes Search API), fetched in
// whatever size the frame needs — so no cover images live in this repo.
const SONGS: [string, string, string, string, number, string][] = [
  ['Take On Me', 'a-ha', 'Hunting High and Low', '1985', 228_520, 'https://is1-ssl.mzstatic.com/image/thumb/Music/c6/e1/c8/mzi.ixgzfcmc.jpg'],
  ['Like a Prayer', 'Madonna', 'Like a Prayer', '1989', 340_867, 'https://is1-ssl.mzstatic.com/image/thumb/Music114/v4/20/3c/f5/203cf53d-689e-528f-29d7-ba33758254aa/mzi.rotbotfl.jpg'],
  ['Wonderwall', 'Oasis', '(What\'s the Story) Morning Glory?', '1995', 258_907, 'https://is1-ssl.mzstatic.com/image/thumb/Music113/v4/04/92/e0/0492e08b-cbcc-9969-9ad6-8f5a0888068c/5051961007107.jpg'],
  ['Girls Just Want to Have Fun', 'Cyndi Lauper', 'She\'s So Unusual', '1983', 238_120, 'https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/8a/8c/13/8a8c13e0-06af-1710-7b7d-ebec65fb8361/074643893022.jpg'],
  ['Zombie', 'The Cranberries', 'No Need to Argue', '1994', 305_627, 'https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/a3/77/a3/a377a309-8e52-f787-2250-2b34d320bf7b/25UMGIM64146.rgb.jpg'],
  ['No Scrubs', 'TLC', 'FanMail', '1999', 214_440, 'https://is1-ssl.mzstatic.com/image/thumb/Music124/v4/d0/94/0f/d0940f87-3c4e-4e47-7ca8-86272fc93aab/dj.egyjyybr.jpg'],
  ['Everybody Wants to Rule the World', 'Tears for Fears', 'Songs from the Big Chair', '1985', 251_480, 'https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/74/41/43/744143ae-afad-8380-106e-1c1bc48922e4/14UMGIM34762.rgb.jpg'],
  ['Purple Rain', 'Prince', 'Purple Rain', '1984', 524_649, 'https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/c1/b6/79/c1b679f5-d59d-1b3e-62ab-514de20f06c6/093624912002.jpg'],
  ['Under the Bridge', 'Red Hot Chili Peppers', 'Blood Sugar Sex Magik', '1991', 264_206, 'https://is1-ssl.mzstatic.com/image/thumb/Music125/v4/c9/c8/b2/c9c8b20d-42b8-a2a6-1678-54b997e845f5/093624931973.jpg'],
  ['Livin\' on a Prayer', 'Bon Jovi', 'Slippery When Wet', '1986', 249_581, 'https://is1-ssl.mzstatic.com/image/thumb/Music112/v4/40/16/3e/40163e24-6985-b785-d4ea-cbae07d74812/06UMGIM05422.rgb.jpg'],
  ['Forever Young', 'Alphaville', 'Forever Young', '1984', 371_853, 'https://is1-ssl.mzstatic.com/image/thumb/Music125/v4/8a/63/bc/8a63bc9e-4c08-b010-a19a-35ef35084d45/190295487720.jpg'],
  ['Black Hole Sun', 'Soundgarden', 'Superunknown', '1994', 318_587, 'https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/69/60/2e/69602e04-f483-70a7-51b6-5dc6b58273ce/00602537879830.rgb.jpg'],
  ['Smells Like Teen Spirit', 'Nirvana', 'Nevermind', '1991', 301_096, 'https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/95/fd/b9/95fdb9b2-6d2b-92a6-97f2-51c1a6d77f1a/00602527874609.rgb.jpg'],
  ['Africa', 'Toto', 'Toto IV', '1982', 295_283, 'https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/69/ce/d2/69ced240-07a7-2a04-bbab-2afbacf30809/074643772822.jpg'],
  ['Billie Jean', 'Michael Jackson', 'Thriller', '1982', 293_802, 'https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/32/4f/fd/324ffda2-9e51-8f6a-0c2d-c6fd2b41ac55/074643811224.jpg'],
  ['Sweet Child O\' Mine', 'Guns N\' Roses', 'Appetite for Destruction', '1987', 356_067, 'https://is1-ssl.mzstatic.com/image/thumb/Music125/v4/56/47/b7/5647b700-6b9d-9e72-ec9f-51140b6d4492/00602567673781.rgb.jpg'],
  ['Sweet Dreams (Are Made of This)', 'Eurythmics', 'Sweet Dreams (Are Made of This)', '1983', 217_093, 'https://is1-ssl.mzstatic.com/image/thumb/Music124/v4/f2/4c/c2/f24cc223-f889-c8a3-ebbc-8ce458438580/mzi.zbvljpxb.jpg'],
];
const items: TrackItem[] = SONGS.map(([name, artist, album, year, ms], i) => ({
  added_at: `2024-0${(i % 9) + 1}-14T10:00:00Z`,
  track: track(name, artist, album, year, ms),
}));

// Enough already-decided songs that the history list is full from the first
// frame and scrolls as new decisions come in.
const PAST_DECISIONS: HistoryEntry['decision'][] = ['kept', 'removed', 'kept', 'kept', 'kept', 'removed', 'kept', 'kept', 'removed', 'kept', 'removed', 'kept'];

// --- Covers ----------------------------------------------------------------

/** Downloads one artwork size (Apple's CDN renders any `<n>x<n>bb.jpg`) and decodes it. */
async function artwork(index: number, size: number): Promise<RgbaImage> {
  const url = `${SONGS[index]![5]}/${size}x${size}bb.jpg`;
  const image = await loadCover(url);
  if (!image) throw new Error(`Could not load ${url}`);
  return image;
}

// Same sizes the app uses: Spotify's 64px image for the thumbnail, a bigger one for the info view
const thumbnails = await Promise.all(
  SONGS.map(async (_, i) => renderCover(await artwork(i, 64), THUMBNAIL_COLUMNS, 'truecolor'))
);
const covers = await Promise.all(SONGS.map((_, i) => artwork(i, 300)));

// --- Scene: replays reviewSession.ts closely enough for a demo ----------

type Frame = { lines: string[]; ms: number; key?: string; label?: string };

const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const frames: Frame[] = [];
const history: HistoryEntry[] = PAST_DECISIONS.map((decision, i) => ({ track: items[i]!.track, decision }));
let index = PAST_DECISIONS.length;
let positionMs = 0;
let caption: { key: string; label: string } | undefined;
let historyCursor: number | null = null;
let spinner: { row: number | 'current'; glyph: string } | undefined;

function capture(ms: number): void {
  frames.push({
    ms,
    ...caption,
    lines: buildReviewFrame({
      sourceName: 'Liked Songs',
      trackNumber: index + 1,
      totalTracks: 238,
      item: items[index],
      hasDevice: true,
      positionMs,
      isPaused: false,
      history,
      historyCursor,
      spinner,
      thumbnail: thumbnails[index],
      width: COLS,
      height: ROWS,
    }),
  });
}

/** Like withBusy(): the row the action concerns spins while Spotify answers. */
function spin(row: number | 'current', steps: number): void {
  for (let i = 0; i < steps; i++) {
    spinner = { row, glyph: SPINNER[i % SPINNER.length]! };
    capture(110);
  }
  spinner = undefined;
}

/** Like startPlayback(): every track starts at its estimated chorus. */
function startTrack(): void {
  positionMs = estimateChorusPositionMs(items[index]!.track.duration_ms);
}

/** One frame per played second, sped up so the GIF stays short. */
function listen(seconds: number): void {
  for (let i = 0; i < seconds; i++) {
    capture(450);
    positionMs += 1000;
  }
}

function decide(decision: HistoryEntry['decision'], key: string): void {
  caption = { key, label: decision === 'kept' ? 'keep' : 'remove' };
  history.push({ track: items[index]!.track, decision });
  // Removing waits on Spotify first (that entry's ✗ spins), then the next track starts (its → spins)
  if (decision === 'removed') spin(history.length - 1, 5);
  index += 1;
  startTrack();
  spin('current', 4);
  capture(500);
  caption = undefined;
  positionMs += 1000;
}

function press(key: string, label: string, ms: number, update: () => void): void {
  caption = { key, label };
  update();
  capture(ms);
}

/** The song info view (`i`) for history entry `position`, with the current track still playing underneath. */
function captureInfo(position: number, ms: number): void {
  const reviewed = position; // history entries are items[0…] in order, so position = index into items
  frames.push({
    ms,
    ...caption,
    lines: buildInfoFrame({
      sourceName: 'Liked Songs',
      item: items[reviewed]!,
      trackNumber: reviewed + 1,
      totalTracks: 238,
      reviewTrackNumber: index + 1,
      nowPlaying: { track: items[index]!.track, hasDevice: true, isPaused: false, positionMs },
      decision: history[position]!.decision,
      cover: renderCover(covers[reviewed]!, 24, 'truecolor'),
      width: COLS,
      height: ROWS,
    }),
  });
}

startTrack();
listen(3);
decide('kept', '⏎');
listen(2);
decide('removed', 'r');
listen(2);
press('↑', 'history', 600, () => (historyCursor = history.length - 1));
caption = { key: 'i', label: 'song info' };
captureInfo(history.length - 1, 2200);
positionMs += 2000;
press('Esc', 'back', 700, () => undefined);
press('Esc', 'leave history', 500, () => (historyCursor = null));
caption = undefined;
listen(1);
decide('kept', '⏎');
listen(2);
frames[frames.length - 1]!.ms = 900;

// --- ANSI → HTML ---------------------------------------------------------

const PALETTE: Record<number, string> = {
  30: '#1b1d23', 31: '#f26d6d', 32: '#4ade80', 33: '#f5c451', 34: '#60a5fa', 35: '#c084fc', 36: '#22d3ee', 37: '#d4d7de',
  90: '#3a3f4b', 91: '#ff8a8a', 92: '#86efac', 93: '#fde68a', 94: '#93c5fd', 95: '#d8b4fe', 96: '#67e8f9', 97: '#ffffff',
};
const FG = '#d4d7de';
const BG = '#16181d';

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Handles the SGR subset picocolors and brand.ts emit: bold/dim/inverse, 16 colors, truecolor. */
function ansiToHtml(line: string): string {
  type Style = { fg?: string; bg?: string; bold: boolean; dim: boolean; inverse: boolean };
  const reset = (): Style => ({ bold: false, dim: false, inverse: false });
  let style = reset();
  let html = '';
  let last = 0;
  // Consecutive cover cells of a row, drawn as one element (see flushHalves)
  let halves: { top: string; bottom: string }[] = [];

  // Cover half blocks: a terminal scales "▀" to the full cell; a browser font
  // doesn't, so each cell is split into a top (foreground) and bottom
  // (background) color. One element per run with hard-stop gradients rather
  // than one per cell — separate boxes at fractional cell widths leave hairline
  // seams between them.
  const flushHalves = () => {
    if (halves.length === 0) return;
    const stops = (key: 'top' | 'bottom') =>
      halves.map((cell, i) => `${cell[key]} ${i}ch ${i + 1}ch`).join(',');
    html +=
      `<span class="half" style="width:${halves.length}ch;background:` +
      `linear-gradient(to right,${stops('top')}) top/100% 50% no-repeat,` +
      // The bottom color fills the whole cell under the top half, so no gap can open between them
      `linear-gradient(to right,${stops('bottom')}) 0 0/100% 100% no-repeat"></span>`;
    halves = [];
  };

  const flush = (text: string) => {
    if (!text) return;
    let fg = style.fg ?? FG;
    let bg = style.bg;
    if (style.inverse) [fg, bg] = [bg ?? BG, fg];
    const css = [`color:${fg}`];
    if (bg) css.push(`background:${bg}`);
    if (style.bold) css.push('font-weight:700');
    if (style.dim) css.push('opacity:.55');
    for (const part of text.split(/(▀+)/)) {
      if (!part) continue;
      if (part.startsWith('▀')) {
        for (let i = 0; i < part.length; i++) halves.push({ top: fg, bottom: bg ?? BG });
      } else {
        flushHalves();
        // The braille spinner isn't in the monospace font; its fallback glyph is
        // wider than a cell and would push the rest of the row to the right.
        const cells = escapeHtml(part).replace(/[\u2800-\u28ff]/g, (glyph) => `<span class="cell">${glyph}</span>`);
        html += `<span style="${css.join(';')}">${cells}</span>`;
      }
    }
  };

  // eslint-disable-next-line no-control-regex -- deliberately matching the ESC control character of SGR sequences
  for (const match of line.matchAll(/\x1b\[([0-9;]*)m/g)) {
    flush(line.slice(last, match.index));
    last = match.index + match[0].length;
    const codes = match[1] === '' ? [0] : match[1]!.split(';').map(Number);
    for (let i = 0; i < codes.length; i++) {
      const code = codes[i]!;
      if (code === 0) style = reset();
      else if (code === 1) style.bold = true;
      else if (code === 2) style.dim = true;
      else if (code === 22) style.bold = style.dim = false;
      else if (code === 7) style.inverse = true;
      else if (code === 27) style.inverse = false;
      else if (code === 39) style.fg = undefined;
      else if (code === 49) style.bg = undefined;
      else if (PALETTE[code]) style.fg = PALETTE[code];
      else if (PALETTE[code - 10]) style.bg = PALETTE[code - 10];
      else if ((code === 38 || code === 48) && codes[i + 1] === 2) {
        const color = `rgb(${codes[i + 2]},${codes[i + 3]},${codes[i + 4]})`;
        if (code === 38) style.fg = color;
        else style.bg = color;
        i += 4;
      }
    }
  }
  flush(line.slice(last));
  flushHalves();
  return html || ' ';
}

const CSS = `
  * { box-sizing: border-box; margin: 0; }
  body { background: transparent; }
  #stage { display: inline-block; background: #0d0f14; }
  .bar { height: 36px; display: flex; align-items: center; padding: 0 14px; gap: 8px; background: #1c1f26; border-bottom: 1px solid #262a33; position: relative; }
  .dot { width: 12px; height: 12px; border-radius: 50%; }
  .title { position: absolute; left: 0; right: 0; text-align: center; color: #9aa0ab; font: 13px system-ui, sans-serif; }
  pre { font: 15px/1.2 'DejaVu Sans Mono', monospace; color: ${FG}; background: ${BG}; padding: 18px 20px 22px; white-space: pre; min-width: calc(${COLS}ch + 40px); }
  .cap { height: 64px; display: flex; align-items: center; justify-content: center; gap: 14px; color: #9aa0ab; font: 600 18px system-ui, sans-serif; border-top: 1px solid #1f232b; }
  .key { font: 700 17px 'DejaVu Sans Mono', monospace; color: #0d0f14; background: #1db954; border-radius: 7px; padding: 6px 12px; }
  .hint { opacity: .5; font-weight: 500; }
  .half { display: inline-block; height: 1.2em; vertical-align: top; }
  /* 1.2 line height: 9×18 px cells, the 1:2 of a typical terminal, which the half-block covers assume */
  .row { height: 1.2em; width: ${COLS}ch; overflow: hidden; }
  .cell { display: inline-block; width: 1ch; overflow: hidden; vertical-align: top; }
`;

function frameHtml(frame: Frame): string {
  // One fixed-height block per terminal row: a glyph from a fallback font
  // (the braille spinner) would otherwise make its line a few pixels taller,
  // and every frame has to come out exactly the same size.
  const rows = [...frame.lines, ...Array<string>(ROWS - frame.lines.length).fill('')]
    .map((line) => `<div class="row">${ansiToHtml(line)}</div>`)
    .join('');
  const cap = frame.key
    ? `<span class="key">${escapeHtml(frame.key)}</span><span>${escapeHtml(frame.label ?? '')}</span>`
    : '<span class="hint">listening from the chorus…</span>';
  return `<div id="stage">
    <div class="bar"><span class="dot" style="background:#ff5f57"></span><span class="dot" style="background:#febc2e"></span><span class="dot" style="background:#28c840"></span><span class="title">spoticlean</span></div>
    <pre>${rows}</pre><div class="cap">${cap}</div></div>`;
}

// --- Render & encode -----------------------------------------------------

// CHROMIUM_PATH: an already installed Chromium instead of playwright's own download
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const page = await browser.newPage({ deviceScaleFactor: RENDER_SCALE, viewport: { width: 1400, height: 1200 } });
await page.setContent(`<style>${CSS}</style><div id="root"></div>`);

const rgbaFrames: { data: Uint8Array; width: number; height: number }[] = [];
for (const frame of frames) {
  await page.evaluate((html) => (document.getElementById('root')!.innerHTML = html), frameHtml(frame));
  const png = await page.locator('#stage').screenshot();
  // Scale down and read back the pixels in the browser itself, which saves
  // pulling in a separate PNG decoder/resizer just for this script.
  const { width, height, pixels } = await page.evaluate(
    async ({ base64, targetWidth }) => {
      const img = new Image();
      img.src = `data:image/png;base64,${base64}`;
      await img.decode();
      const w = targetWidth;
      const h = Math.round((img.height * targetWidth) / img.width);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d')!;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, w, h);
      const bytes = ctx.getImageData(0, 0, w, h).data;
      let binary = '';
      for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return { width: w, height: h, pixels: btoa(binary) };
    },
    { base64: png.toString('base64'), targetWidth: OUTPUT_WIDTH }
  );
  rgbaFrames.push({ data: new Uint8Array(Buffer.from(pixels, 'base64')), width, height });
}
await browser.close();

// One palette shared by every frame (so colors don't flicker), with the last
// slot reserved as "unchanged since the previous frame". Marking unchanged
// pixels transparent lets most of each frame compress down to almost nothing.
const { width, height } = rgbaFrames[0]!;
// A frame of a different size gets written with the first frame's dimensions,
// which corrupts the file from that frame on (browsers stop playing there).
const misfit = rgbaFrames.findIndex((f) => f.width !== width || f.height !== height);
if (misfit !== -1) {
  throw new Error(`Frame ${misfit} is ${rgbaFrames[misfit]!.width}×${rgbaFrames[misfit]!.height}, not ${width}×${height}`);
}
const combined = new Uint8Array(rgbaFrames.reduce((sum, f) => sum + f.data.length, 0));
rgbaFrames.reduce((offset, f) => (combined.set(f.data, offset), offset + f.data.length), 0);
const palette = quantize(combined, 255);
const TRANSPARENT = palette.length;
palette.push([0, 0, 0]);

const gif = GIFEncoder();
let previous: Uint8Array | undefined;
rgbaFrames.forEach((f, i) => {
  const indexed = applyPalette(f.data, palette);
  const output = indexed.slice();
  if (previous) {
    for (let p = 0; p < indexed.length; p++) if (indexed[p] === previous[p]) output[p] = TRANSPARENT;
  }
  gif.writeFrame(output, width, height, {
    palette: i === 0 ? palette : undefined,
    delay: frames[i]!.ms,
    transparent: i > 0,
    transparentIndex: TRANSPARENT,
    dispose: 1, // keep the previous frame underneath
  });
  previous = indexed;
});
gif.finish();

mkdirSync(path.dirname(OUT_FILE), { recursive: true });
writeFileSync(OUT_FILE, gif.bytes());
console.log(`wrote ${frames.length} frames to ${path.relative(process.cwd(), OUT_FILE)}`);

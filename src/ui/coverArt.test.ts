import assert from 'node:assert/strict';
import { test } from 'node:test';

import { detectColorMode, pickCoverImage, renderCover, toAnsi256, type RgbaImage } from './coverArt.js';
import { visibleLength } from './terminal.js';

/** A width×height image whose top half is red and bottom half blue. */
function splitImage(width: number, height: number): RgbaImage {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const top = y < height / 2;
      data.set(top ? [255, 0, 0, 255] : [0, 0, 255, 255], i);
    }
  }
  return { width, height, data };
}

test('renderCover: half as many rows as columns, each exactly `columns` wide on screen', () => {
  for (const mode of ['truecolor', '256', 'ascii'] as const) {
    const lines = renderCover(splitImage(300, 300), 24, mode);
    assert.equal(lines.length, 12, mode);
    for (const line of lines) assert.equal(visibleLength(line), 24, mode);
  }
});

test('renderCover: truecolor keeps the exact colors, top pixel as foreground, bottom as background', () => {
  const lines = renderCover(splitImage(40, 40), 4, 'truecolor');
  assert.match(lines[0]!, /\x1b\[38;2;255;0;0;48;2;255;0;0m▀/); // eslint-disable-line no-control-regex
  assert.match(lines[1]!, /\x1b\[38;2;0;0;255;48;2;0;0;255m▀/); // eslint-disable-line no-control-regex
});

test('toAnsi256: primaries land on the cube corners, mid gray on the gray ramp', () => {
  assert.equal(toAnsi256([255, 0, 0]), 196);
  assert.equal(toAnsi256([0, 0, 255]), 21);
  assert.equal(toAnsi256([0, 0, 0]), 16);
  assert.equal(toAnsi256([128, 128, 128]), 244);
});

test('pickCoverImage: smallest image that is still big enough, else whatever there is', () => {
  const images = [
    { url: 'a', width: 640, height: 640 },
    { url: 'b', width: 300, height: 300 },
    { url: 'c', width: 64, height: 64 },
  ];
  assert.equal(pickCoverImage(images)?.url, 'b');
  assert.equal(pickCoverImage([{ url: 'c', width: 64, height: 64 }])?.url, 'c');
  assert.equal(pickCoverImage([]), undefined);
});

test('detectColorMode: COLORTERM=truecolor means 24-bit, otherwise the 256 palette', () => {
  // picocolors decides about color at import time; this suite runs with FORCE_COLOR=1 (see npm test)
  assert.equal(detectColorMode({ COLORTERM: 'truecolor' }), 'truecolor');
  assert.equal(detectColorMode({ COLORTERM: '24bit' }), 'truecolor');
  assert.equal(detectColorMode({}), '256');
});

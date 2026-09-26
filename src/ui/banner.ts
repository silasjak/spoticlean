import figlet from 'figlet';
import slant from 'figlet/importable-fonts/Slant.js';
import gradient from 'gradient-string';

// The "importable-fonts" variant embeds the font as a plain JS string rather
// than something figlet loads from disk at runtime — the normal font-loading
// path resolves paths relative to the installed package, which breaks once
// tsup bundles everything into a single dist/index.js.
figlet.parseFont('Slant', slant);

const spotifyGradient = gradient(['#1DB954', '#1ed760', '#1DB954']);

export function printBanner(): void {
  // 'full' turns off the font's default letter-smushing (which otherwise
  // packs adjacent letters right up against each other) for some breathing
  // room between characters instead.
  console.log(spotifyGradient.multiline(figlet.textSync('SPOTICLEAN', { font: 'Slant', horizontalLayout: 'full' })));
}

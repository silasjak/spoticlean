// Spotify's brand green (#1DB954) as a raw truecolor ANSI accent — the same
// value the startup banner's gradient uses. picocolors' own `green` is just
// the terminal's generic ANSI green (whatever that maps to per theme), not
// this specific hue, so this bypasses it the same way gradient-string does.
export function spotifyGreen(text: string): string {
  return `\x1b[38;2;29;185;84m${text}\x1b[39m`;
}

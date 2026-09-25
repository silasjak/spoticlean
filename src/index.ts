#!/usr/bin/env node
import * as p from '@clack/prompts';

import { main } from './cli.js';
import { exitAltScreen, isAltScreenActive } from './ui/terminal.js';

// Safety net: if raw mode / the alternate screen buffer was left enabled by
// an unexpected crash, restore the terminal before exiting so the shell
// isn't left showing a frozen review screen.
function restoreTerminal(): void {
  if (process.stdin.isTTY) process.stdin.setRawMode(false);
  if (isAltScreenActive()) exitAltScreen();
}

process.on('SIGINT', () => {
  restoreTerminal();
  p.cancel('Abgebrochen.');
  process.exit(130);
});

main(process.argv.slice(2)).catch((error: unknown) => {
  restoreTerminal();
  p.log.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

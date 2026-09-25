#!/usr/bin/env node
import * as p from '@clack/prompts';

import { main } from './cli.js';

// Safety net: if raw mode was left enabled by an unexpected crash, restore
// the terminal before exiting so the shell isn't left in a broken state.
process.on('SIGINT', () => {
  if (process.stdin.isTTY) process.stdin.setRawMode(false);
  p.cancel('Abgebrochen.');
  process.exit(130);
});

main(process.argv.slice(2)).catch((error: unknown) => {
  if (process.stdin.isTTY) process.stdin.setRawMode(false);
  p.log.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

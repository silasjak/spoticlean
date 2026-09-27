import { appendFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import envPaths from 'env-paths';

const paths = envPaths('spoticlean', { suffix: '' });
const LOG_FILE = path.join(paths.log, 'debug.log');

const enabled = process.env.SPOTICLEAN_DEBUG === '1' || process.argv.includes('--debug');

let dirEnsured = false;

export function isDebugEnabled(): boolean {
  return enabled;
}

export function debugLogFilePath(): string {
  return LOG_FILE;
}

/**
 * Appends a line to the debug log file — never to stdout/stderr, since
 * those are repainted wholesale by the full-screen review UI and would
 * either get lost or corrupt the display. Run `tail -f` on the file path
 * (see debugLogFilePath()) in another terminal while reproducing an issue.
 * A no-op (and effectively free) unless debug mode is on.
 */
export function debugLog(message: string): void {
  if (!enabled) return;
  try {
    if (!dirEnsured) {
      mkdirSync(paths.log, { recursive: true });
      dirEnsured = true;
    }
    appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ${message}\n`);
  } catch {
    // logging itself must never be the thing that breaks the app
  }
}

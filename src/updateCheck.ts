import { readFileSync } from 'node:fs';
import pc from 'picocolors';

import { loadConfig, updateConfig } from './config.js';
import { debugLog } from './debug.js';
import { t } from './i18n/index.js';
import { boxBottom, boxLine, boxTop } from './ui/box.js';
import { spotifyGreen } from './ui/brand.js';
import { visibleLength } from './ui/terminal.js';

const PACKAGE_NAME = 'spoticlean';
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 3000;

/**
 * Read at runtime rather than imported — both src/updateCheck.ts (tsx) and
 * the bundled dist/index.js sit exactly one level below package.json, and
 * npm always ships package.json alongside dist/.
 */
export function currentVersion(): string {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string };
  return pkg.version;
}

function parseVersion(version: string): [number, number, number] | undefined {
  // Plain x.y.z only — a prerelease ("1.2.0-beta.1") is never offered as an update.
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version.trim());
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : undefined;
}

export function isNewer(latest: string, current: string): boolean {
  const a = parseVersion(latest);
  const b = parseVersion(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) {
    if (a[i]! !== b[i]!) return a[i]! > b[i]!;
  }
  return false;
}

function isDisabled(): boolean {
  // The same opt-outs update-notifier honours, so anyone who already set
  // them for other CLIs gets the same quiet here.
  return (
    !process.stdout.isTTY ||
    Boolean(process.env.CI) ||
    Boolean(process.env.NO_UPDATE_NOTIFIER)
  );
}

async function fetchLatestVersion(): Promise<string | undefined> {
  const response = await fetch(`https://registry.npmjs.org/${PACKAGE_NAME}/latest`, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`registry responded with ${response.status}`);
  const body = (await response.json()) as { version?: unknown };
  return typeof body.version === 'string' ? body.version : undefined;
}

/**
 * Resolves to the newer published version, or undefined if there is none.
 * Asks the npm registry at most once a day and remembers the answer in the
 * config, so most runs make no request at all. Never throws — being offline
 * or the registry being down must not get in the way of cleaning playlists.
 */
export async function checkForUpdate(): Promise<string | undefined> {
  if (isDisabled()) return undefined;
  try {
    const current = currentVersion();
    const cached = (await loadConfig()).updateCheck;
    let latest = cached?.latestVersion;
    if (!cached || Date.now() - cached.checkedAt >= CHECK_INTERVAL_MS) {
      latest = await fetchLatestVersion();
      await updateConfig((config) => {
        config.updateCheck = { checkedAt: Date.now(), latestVersion: latest };
      });
    }
    return latest && isNewer(latest, current) ? latest : undefined;
  } catch (error) {
    debugLog(`update check failed: ${error instanceof Error ? error.message : String(error)}`);
    return undefined;
  }
}

export function buildUpdateNotice(current: string, latest: string): string[] {
  const lines = [
    `${pc.dim(current)} → ${spotifyGreen(pc.bold(latest))}`,
    t('cli.update.command', { command: pc.cyan(`npm i -g ${PACKAGE_NAME}`) }),
    pc.dim(t('cli.update.releaseNotes', { url: `https://github.com/silasjak/spoticlean/releases/tag/v${latest}` })),
  ];
  const indent = 2;
  // borders + left indent + the same gap again on the right
  const width = Math.max(...lines.map(visibleLength)) + 2 + indent * 2;
  return [
    boxTop(width, pc.yellow(t('cli.update.title'))),
    ...lines.map((line) => boxLine(line, width, indent)),
    boxBottom(width),
  ];
}

export function printUpdateNotice(latest: string | undefined): void {
  if (!latest) return;
  console.log(buildUpdateNotice(currentVersion(), latest).join('\n') + '\n');
}

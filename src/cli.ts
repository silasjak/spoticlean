import * as p from '@clack/prompts';
import pc from 'picocolors';

import { logout, runSetup } from './auth/session.js';
import { configFilePath } from './config.js';
import { debugLogFilePath, isDebugEnabled } from './debug.js';
import { AuthCancelled } from './errors.js';
import { printBanner } from './ui/banner.js';
import { prepareDevice } from './ui/device.js';
import { runReviewSession } from './ui/reviewSession.js';
import { selectSource } from './ui/selectSource.js';

function printSummary(summary: Awaited<ReturnType<typeof runReviewSession>>): void {
  const lines = [
    `${pc.green(`✓ ${summary.kept} behalten`)}`,
    `${pc.red(`✗ ${summary.removed.length} entfernt`)}`,
  ];
  if (summary.removed.length > 0) {
    lines.push('', pc.dim('Entfernt:'));
    for (const track of summary.removed.slice(0, 15)) {
      lines.push(pc.dim(`  • ${track.name}`));
    }
    if (summary.removed.length > 15) {
      lines.push(pc.dim(`  … und ${summary.removed.length - 15} weitere`));
    }
  }
  if (summary.quitEarly) {
    lines.push('', pc.dim(`Abgebrochen bei Track ${summary.reviewedCount + 1}/${summary.total} — beim nächsten Mal geht's von hier weiter.`));
  }
  p.note(lines.join('\n'), 'Zusammenfassung');
}

async function runLogout(): Promise<void> {
  await logout();
  p.log.success('Abgemeldet. Beim nächsten Start ist eine erneute Anmeldung nötig.');
}

export async function main(argv: string[]): Promise<void> {
  const command = argv[0];

  if (command === 'logout') {
    await runLogout();
    return;
  }

  if (command === 'setup') {
    printBanner();
    p.intro(pc.bgGreen(pc.black(' spoticlean-cli setup ')));
    try {
      await runSetup();
      p.outro(pc.green('Bereit! ✨'));
    } catch (error) {
      if (p.isCancel(error) || error instanceof AuthCancelled) {
        p.cancel('Abgebrochen.');
        return;
      }
      throw error;
    }
    return;
  }

  if (command === 'help' || command === '--help' || command === '-h') {
    console.log(
      [
        'spoticlean [command] [--debug]',
        '',
        '  (kein Befehl)   Playlist aufräumen (fragt bei Erstnutzung automatisch nach Setup)',
        '  setup           Spotify-App (Client ID) / Port neu einrichten',
        '  logout          Gespeicherte Anmeldung entfernen',
        '  help            Diese Hilfe',
        '',
        '  --debug         Jeden Spotify-API-Request/-Response in eine Log-Datei schreiben',
        '                  (auch per SPOTICLEAN_DEBUG=1 aktivierbar)',
        '',
        `Konfiguration liegt unter ${configFilePath()}`,
        `Debug-Log liegt unter      ${debugLogFilePath()}`,
      ].join('\n')
    );
    return;
  }

  printBanner();
  p.intro(pc.bgGreen(pc.black(' spoticlean-cli ')));

  if (isDebugEnabled()) {
    p.log.info(`Debug-Modus an — Requests/Responses landen in: ${debugLogFilePath()}`);
  }

  try {
    const { source } = await selectSource();
    const deviceId = await prepareDevice();
    const summary = await runReviewSession(source, deviceId);
    printSummary(summary);
    p.outro(pc.green('Fertig! ✨'));
  } catch (error) {
    if (p.isCancel(error) || error instanceof AuthCancelled) {
      p.cancel('Abgebrochen.');
      return;
    }
    throw error;
  }
}

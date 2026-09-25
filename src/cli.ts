import * as p from '@clack/prompts';
import pc from 'picocolors';

import { logout } from './auth/session.js';
import { configFilePath } from './config.js';
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

  if (command === 'help' || command === '--help' || command === '-h') {
    console.log(
      [
        'spoticlean [command]',
        '',
        '  (kein Befehl)   Playlist aufräumen',
        '  logout          Gespeicherte Anmeldung entfernen',
        '  help            Diese Hilfe',
        '',
        `Konfiguration liegt unter ${configFilePath()}`,
      ].join('\n')
    );
    return;
  }

  printBanner();
  p.intro(pc.bgGreen(pc.black(' spoticlean-cli ')));

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

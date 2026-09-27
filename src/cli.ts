import * as p from '@clack/prompts';
import pc from 'picocolors';

import { logout, runSetup } from './auth/session.js';
import { configFilePath, loadConfig } from './config.js';
import { debugLogFilePath, isDebugEnabled } from './debug.js';
import { AuthCancelled } from './errors.js';
import { detectLanguage, initI18n, t } from './i18n/index.js';
import { printBanner } from './ui/banner.js';
import { prepareDevice } from './ui/device.js';
import { runReviewSession } from './ui/reviewSession.js';
import { selectSource } from './ui/selectSource.js';
import { runSettingsMenu } from './ui/settings.js';

function printSummary(summary: Awaited<ReturnType<typeof runReviewSession>>): void {
  const lines = [
    pc.green(`✓ ${t('cli.summary.kept', { count: summary.kept })}`),
    pc.red(`✗ ${t('cli.summary.removed', { count: summary.removed.length })}`),
  ];
  if (summary.removed.length > 0) {
    lines.push('', pc.dim(t('cli.summary.removedListTitle')));
    for (const track of summary.removed.slice(0, 15)) {
      lines.push(pc.dim(`  • ${track.name}`));
    }
    if (summary.removed.length > 15) {
      lines.push(pc.dim(`  ${t('cli.summary.removedMore', { count: summary.removed.length - 15 })}`));
    }
  }
  if (summary.quitEarly) {
    lines.push(
      '',
      pc.dim(t('cli.summary.quitEarly', { current: summary.reviewedCount + 1, total: summary.total }))
    );
  }
  p.note(lines.join('\n'), t('cli.summary.title'));
}

async function runLogout(): Promise<void> {
  await logout();
  p.log.success(t('cli.logoutSuccess'));
}

function printHelp(): void {
  const rows: [string, string][] = [
    [t('cli.help.noCommandLabel'), t('cli.help.noCommandDesc')],
    ['setup', t('cli.help.setupDesc')],
    ['logout', t('cli.help.logoutDesc')],
    ['help', t('cli.help.helpDesc')],
    ['--debug', t('cli.help.debugFlagDesc')],
    ['', t('cli.help.debugFlagHint')],
  ];
  const labelWidth = Math.max(...rows.map(([label]) => label.length));
  const helpLines = rows.map(([label, desc]) => `  ${label.padEnd(labelWidth + 2)}${desc}`);

  console.log(
    [
      'spoticlean [command] [--debug]',
      '',
      ...helpLines.slice(0, 4),
      '',
      ...helpLines.slice(4, 6),
      '',
      t('cli.help.configPath', { path: configFilePath() }),
      t('cli.help.debugLogPath', { path: debugLogFilePath() }),
    ].join('\n')
  );
}

export async function main(argv: string[]): Promise<void> {
  const config = await loadConfig();
  await initI18n(config.language ?? detectLanguage());

  const command = argv[0];

  if (command === 'logout') {
    await runLogout();
    return;
  }

  if (command === 'setup') {
    printBanner();
    p.intro(pc.bgGreen(pc.black(' spoticlean setup ')));
    try {
      await runSetup();
      p.outro(pc.green(t('cli.setupReady')));
    } catch (error) {
      if (p.isCancel(error) || error instanceof AuthCancelled) {
        p.cancel(t('common.cancelled'));
        return;
      }
      throw error;
    }
    return;
  }

  if (command === 'help' || command === '--help' || command === '-h') {
    printHelp();
    return;
  }

  printBanner();
  p.intro(pc.bgGreen(pc.black(' spoticlean ')));

  if (isDebugEnabled()) {
    p.log.info(t('cli.debugModeOn', { path: debugLogFilePath() }));
  }

  try {
    // "spoticlean setup" is the one-time, everything-must-be-set wizard;
    // this is the lightweight everyday way back into any one of those same
    // values — offered right here so it's never more than one extra prompt
    // away, not a separate command to remember.
    for (;;) {
      const action = await p.select({
        message: t('cli.mainMenu.question'),
        options: [
          { value: 'review' as const, label: t('cli.mainMenu.reviewOption') },
          { value: 'settings' as const, label: t('cli.mainMenu.settingsOption') },
        ],
      });
      if (p.isCancel(action)) {
        p.cancel(t('common.cancelled'));
        return;
      }
      if (action === 'review') break;
      await runSettingsMenu();
    }

    const { source } = await selectSource();
    const deviceId = await prepareDevice();
    const summary = await runReviewSession(source, deviceId);
    printSummary(summary);
    p.outro(pc.green(t('cli.outroDone')));
  } catch (error) {
    if (p.isCancel(error) || error instanceof AuthCancelled) {
      p.cancel(t('common.cancelled'));
      return;
    }
    throw error;
  }
}

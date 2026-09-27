import * as p from '@clack/prompts';
import pc from 'picocolors';

import { DEFAULT_PORT } from '../auth/session.js';
import { loadConfig, updateConfig } from '../config.js';
import { AuthCancelled } from '../errors.js';
import { currentLanguage, detectLanguage, initI18n, t } from '../i18n/index.js';
import { isInteractiveTerminal, readKey, withRawMode } from './keypress.js';
import { buildSettingsFrame, FIELD_ORDER, type SettingsDraft, type SettingsField } from './settingsFrame.js';
import { enterAltScreen, exitAltScreen, paintFrame, terminalHeight, terminalWidth } from './terminal.js';

function normalizeKey(key: Awaited<ReturnType<typeof readKey>>): string | undefined {
  return key.name === 'return'
    ? 'enter'
    : key.name === 'backspace' || key.name === 'delete' || key.char === '\u007f'
      ? 'backspace'
      : key.name === 'up' || key.name === 'down' || key.name === 'left' || key.name === 'right' || key.name === 'escape'
        ? key.name
        : undefined;
}

/** Same rules as the setup wizard's port/Client ID prompts — just applied inline here instead of through a clack `validate` callback. */
function validate(field: SettingsField, value: string): string | undefined {
  if (field === 'port') {
    const n = Number(value);
    if (!Number.isInteger(n) || n < 1024 || n > 65535) return t('auth.setup.portValidation');
  } else if (field === 'clientId') {
    if (value.trim().length === 0) return t('auth.setup.clientIdValidation');
  }
  return undefined;
}

/**
 * A single persistent, arrow-navigable screen instead of clack's usual
 * one-prompt-at-a-time flow: ↑/↓ moves between fields, ←/→ flips the
 * language field in place, Enter opens a field for text editing, and
 * nothing is written to disk until `s` saves everything at once — Esc
 * (outside of an in-progress field edit) discards the whole draft instead.
 * Reachable from the main menu on every normal start, unlike `spoticlean
 * setup`'s one-time, everything-must-be-set wizard.
 */
export async function runSettingsMenu(): Promise<void> {
  if (!isInteractiveTerminal()) {
    throw new Error(t('common.needsTty'));
  }

  const config = await loadConfig();
  const originalLanguage = currentLanguage();
  const draft: SettingsDraft = {
    language: config.language ?? detectLanguage(),
    port: String(config.redirectPort ?? DEFAULT_PORT),
    clientId: config.clientId ?? '',
  };

  let focusIndex = 0;
  let editing: SettingsField | null = null;
  let editBuffer = '';
  let status: { text: string; color?: (text: string) => string } | undefined;

  function render(): void {
    paintFrame(
      buildSettingsFrame({
        draft,
        focus: FIELD_ORDER[focusIndex]!,
        editing,
        editBuffer,
        status,
        width: terminalWidth(),
        height: terminalHeight(),
      })
    );
  }

  enterAltScreen();
  let outcome: 'saved' | 'discarded';
  try {
    outcome = await withRawMode(async () => {
      render();
      for (;;) {
        const key = await readKey();
        if (key.ctrl && key.name === 'c') throw new AuthCancelled();
        const normalized = normalizeKey(key);

        if (editing) {
          if (normalized === 'enter') {
            const error = validate(editing, editBuffer);
            if (error) {
              status = { text: error, color: pc.red };
            } else {
              if (editing === 'port') draft.port = editBuffer;
              else draft.clientId = editBuffer.trim();
              status = undefined;
              editing = null;
            }
          } else if (normalized === 'escape') {
            editing = null; // discards just this field's in-progress edit
            status = undefined;
          } else if (normalized === 'backspace') {
            editBuffer = editBuffer.slice(0, -1);
          } else if (!key.ctrl && key.char && key.char.length === 1 && key.char >= ' ') {
            editBuffer += key.char;
          }
          render();
          continue;
        }

        if (normalized === 'up') {
          focusIndex = Math.max(0, focusIndex - 1);
        } else if (normalized === 'down') {
          focusIndex = Math.min(FIELD_ORDER.length - 1, focusIndex + 1);
        } else if (normalized === 'left' || normalized === 'right') {
          if (FIELD_ORDER[focusIndex] === 'language') {
            draft.language = draft.language === 'de' ? 'en' : 'de';
            await initI18n(draft.language); // live preview, not yet persisted
          }
        } else if (normalized === 'enter') {
          const field = FIELD_ORDER[focusIndex]!;
          if (field !== 'language') {
            editing = field;
            editBuffer = field === 'port' ? draft.port : draft.clientId;
            status = undefined;
          }
        } else if (normalized === 'escape') {
          return 'discarded';
        } else if (key.char?.toLowerCase() === 's') {
          return 'saved';
        }
        render();
      }
    });
  } finally {
    exitAltScreen();
  }

  if (outcome === 'discarded') {
    await initI18n(originalLanguage); // undo the live preview from browsing ←/→
    return;
  }

  const clientIdChanged = draft.clientId !== (config.clientId ?? '');
  await updateConfig((c) => {
    c.language = draft.language;
    c.redirectPort = Number(draft.port);
    c.clientId = draft.clientId;
    // Tied to the *old* Spotify app registration — carrying it over to a
    // new Client ID would just fail on first use anyway.
    if (clientIdChanged) delete c.tokens;
  });
  if (clientIdChanged) {
    p.log.info(t('settings.clientIdChanged'));
  }
}

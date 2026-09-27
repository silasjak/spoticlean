import pc from 'picocolors';

import { redirectUriFor } from '../auth/oauth.js';
import { t } from '../i18n/index.js';
import type { SupportedLanguage } from '../i18n/index.js';
import { boxBlank, boxBottom, boxDivider, boxLine, boxTop, fitWidth, innerWidth } from './box.js';
import { packKeyHints } from './hintLine.js';

export type SettingsField = 'language' | 'port' | 'clientId';

export type SettingsDraft = {
  language: SupportedLanguage;
  /** Kept as a string (not a number) while editable — mid-edit it's transiently not a valid port at all. */
  port: string;
  clientId: string;
};

export type SettingsFrameState = {
  draft: SettingsDraft;
  focus: SettingsField;
  /** Which field (if any) is currently in text-edit mode. Never 'language' — that toggles instantly with ←/→, no text entry needed. */
  editing: SettingsField | null;
  /** The in-progress text while `editing` is set; ignored otherwise. */
  editBuffer: string;
  status?: { text: string; color?: (text: string) => string };
  width: number;
  height: number;
};

const identity = (text: string) => text;
export const FIELD_ORDER: SettingsField[] = ['language', 'port', 'clientId'];

function fieldLabels(): Record<SettingsField, string> {
  return {
    language: t('settings.fields.language'),
    port: t('settings.fields.port'),
    clientId: t('settings.fields.clientId'),
  };
}

/** Not a `SettingsField` — read-only and derived from Port, not its own editable/focusable row. */
const REDIRECT_URI_LABEL = () => t('settings.fields.redirectUri');

/**
 * Pure frame builder for the full-screen settings editor: ↑/↓ moves focus
 * between fields, ←/→ toggles the language field in place, Enter opens a
 * field for text editing, and nothing is persisted until the caller saves —
 * this only ever renders whatever draft state it's given. Mirrors
 * reviewFrame.ts's shape deliberately, down to reusing its box/highlight
 * primitives, so the two full-screen UIs in this app feel like one system.
 */
export function buildSettingsFrame(state: SettingsFrameState): string[] {
  // `height` isn't used — this screen has a fixed, small number of rows, no
  // scrolling section to size (unlike reviewFrame's history list). Kept on
  // the state type anyway for parity with ReviewFrameState and paintFrame().
  const { draft, focus, editing, editBuffer, status, width } = state;
  const labels = fieldLabels();
  const redirectUriLabel = REDIRECT_URI_LABEL();
  const labelWidth = Math.max(...Object.values(labels).map((l) => l.length), redirectUriLabel.length);

  const header = [boxTop(width, fitWidth(t('settings.title'), width, 3))];

  function fieldRow(field: SettingsField, value: string): string {
    const label = pc.dim(labels[field].padEnd(labelWidth));
    const isEditing = editing === field;
    const shown = isEditing ? `${editBuffer}█` : value;
    const content = fitWidth(`${label}  ${shown}`, width);
    if (isEditing) return boxLine(content, width, 1, 'editing');
    if (focus === field && !editing) return boxLine(content, width, 1, 'cursor');
    return boxLine(content, width);
  }

  const card: string[] = [
    boxBlank(width),
    fieldRow('language', `◀ ${draft.language === 'de' ? 'Deutsch' : 'English'} ▶`),
    fieldRow('port', draft.port),
    boxLine(
      pc.dim(fitWidth(`${redirectUriLabel.padEnd(labelWidth)}  ${redirectUriFor(Number(draft.port) || 0)}`, width)),
      width
    ),
    fieldRow('clientId', draft.clientId || pc.dim('—')),
    boxBlank(width),
    boxLine(status ? (status.color ?? identity)(fitWidth(status.text, width)) : '', width),
    boxBlank(width),
  ];

  const mode = editing ? 'edit' : 'navigate';
  const hints =
    mode === 'edit'
      ? [
          { key: '⏎', desc: t('settings.hints.confirmEdit') },
          { key: 'Esc', desc: t('settings.hints.cancelEdit') },
        ]
      : [
          { key: '↑/↓', desc: t('settings.hints.navigate') },
          ...(focus === 'language'
            ? [{ key: '←/→', desc: t('settings.hints.toggleLanguage') }]
            : [{ key: '⏎', desc: t('settings.hints.edit') }]),
          { key: 's', desc: t('settings.hints.save') },
          { key: 'Esc', desc: t('settings.hints.discard') },
        ];
  const footerHintLines = packKeyHints(hints, innerWidth(width)).map((line) => boxLine(line, width));
  const footer = [boxDivider(width), ...footerHintLines, boxBottom(width)];

  return [...header, ...card, ...footer];
}

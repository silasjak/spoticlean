import assert from 'node:assert/strict';
import { test } from 'node:test';

import { initI18n } from '../i18n/index.js';
import { visibleLength } from './terminal.js';
import { buildSettingsFrame, type SettingsDraft } from './settingsFrame.js';

// buildSettingsFrame() renders through t() — these assertions check the
// (existing) German copy specifically, so pin the language regardless of
// whoever's machine/CI runs this.
await initI18n('de');

// eslint-disable-next-line no-control-regex -- deliberately matching the ESC control character to strip ANSI color codes
const ANSI_PATTERN = /\x1b\[[0-9;]*m/g;
function stripAnsi(text: string): string {
  return text.replace(ANSI_PATTERN, '');
}

function baseDraft(overrides: Partial<SettingsDraft> = {}): SettingsDraft {
  return { language: 'de', port: '8888', clientId: 'abc123', ...overrides };
}

function baseState(overrides: Partial<Parameters<typeof buildSettingsFrame>[0]> = {}) {
  return {
    draft: baseDraft(),
    focus: 'language' as const,
    editing: null,
    editBuffer: '',
    width: 80,
    height: 20,
    ...overrides,
  };
}

test('every line has exactly the requested visible width', () => {
  const frame = buildSettingsFrame(baseState());
  for (const line of frame) {
    assert.equal(visibleLength(line), 80, `line did not match width: ${JSON.stringify(line)}`);
  }
});

test('shows all three fields with their current draft values', () => {
  const frame = stripAnsi(buildSettingsFrame(baseState()).join('\n'));
  assert.match(frame, /Deutsch/);
  assert.match(frame, /8888/);
  assert.match(frame, /abc123/);
});

test('the port field shows a live redirect-URI preview that follows the draft, not the saved value', () => {
  const frame = stripAnsi(buildSettingsFrame(baseState({ draft: baseDraft({ port: '9090' }) })).join('\n'));
  assert.match(frame, /http:\/\/127\.0\.0\.1:9090\/callback/);
});

test('the focused (not editing) field is shown in inverse video, like the review screen\'s browse cursor', () => {
  const frame = buildSettingsFrame(baseState({ focus: 'port' }));
  const line = frame.find((l) => l.includes('8888'));
  assert.ok(line);
  // eslint-disable-next-line no-control-regex -- deliberately matching the ESC control character (SGR "inverse")
  assert.match(line!, /\x1b\[7m/);
});

test('a field being edited shows the in-progress buffer and a cursor block, not the committed value', () => {
  const frame = buildSettingsFrame(baseState({ focus: 'port', editing: 'port', editBuffer: '999' }));
  const portRow = stripAnsi(frame.find((l) => l.includes('Port'))!);
  assert.match(portRow, /999█/);
  assert.doesNotMatch(portRow, /8888/); // the old, still-committed draft value shouldn't show on the field row itself
  // The redirect-URI preview below it, though, deliberately still reflects
  // the *committed* draft.port ("8888") until this edit is actually
  // confirmed — that's the one that's still real until then.
  assert.match(stripAnsi(frame.join('\n')), /127\.0\.0\.1:8888/);
});

test('editing a field uses the yellow "editing" highlight, distinct from the plain focus cursor', () => {
  const frame = buildSettingsFrame(baseState({ focus: 'port', editing: 'port', editBuffer: '999' }));
  const line = frame.find((l) => l.includes('999'));
  assert.ok(line);
  // eslint-disable-next-line no-control-regex -- deliberately matching the ESC control code (SGR "yellow bg")
  assert.match(line!, /\x1b\[43m/);
});

test('a status message appears in the frame', () => {
  const frame = stripAnsi(
    buildSettingsFrame(baseState({ status: { text: 'Bitte einen Port zwischen 1024 und 65535 angeben.' } })).join(
      '\n'
    )
  );
  assert.match(frame, /Bitte einen Port zwischen 1024 und 65535 angeben\./);
});

test('the footer hints differ between navigating and editing a field', () => {
  const navigating = stripAnsi(buildSettingsFrame(baseState()).join('\n'));
  const editing = stripAnsi(buildSettingsFrame(baseState({ editing: 'port', editBuffer: '8888' })).join('\n'));
  assert.match(navigating, /speichern/);
  assert.doesNotMatch(editing, /speichern/);
  assert.match(editing, /übernehmen/);
});

test('the language field only offers ←/→ once it has focus, not while another field is focused', () => {
  const onLanguage = stripAnsi(buildSettingsFrame(baseState({ focus: 'language' })).join('\n'));
  const onPort = stripAnsi(buildSettingsFrame(baseState({ focus: 'port' })).join('\n'));
  assert.match(onLanguage, /Sprache wechseln/);
  assert.doesNotMatch(onPort, /Sprache wechseln/);
});

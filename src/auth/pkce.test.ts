import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createCodeChallenge, createCodeVerifier, createState } from './pkce.js';

test('createCodeVerifier produces a url-safe string without padding', () => {
  const verifier = createCodeVerifier();
  assert.match(verifier, /^[A-Za-z0-9_-]+$/);
  assert.ok(verifier.length >= 43); // RFC 7636 minimum
});

test('createCodeChallenge is deterministic for the same verifier', () => {
  const verifier = 'fixed-verifier-value';
  assert.equal(createCodeChallenge(verifier), createCodeChallenge(verifier));
});

test('createCodeChallenge differs between different verifiers', () => {
  assert.notEqual(createCodeChallenge(createCodeVerifier()), createCodeChallenge(createCodeVerifier()));
});

test('createState produces url-safe, unique values', () => {
  const a = createState();
  const b = createState();
  assert.match(a, /^[A-Za-z0-9_-]+$/);
  assert.notEqual(a, b);
});

import readline from 'node:readline';

export type KeyEvent = {
  /** The printable character, if any (e.g. "k", " ", "?"). */
  char: string;
  name?: string;
  ctrl: boolean;
};

let rawModeDepth = 0;

/**
 * Keys that arrived in the same burst as the one a readKey() resolved with —
 * a paste is a single stdin chunk that readline splits into one synchronous
 * keypress per character, so without this everything after the first
 * character would be emitted while no listener is attached and get lost.
 */
const pendingKeys: KeyEvent[] = [];

function enableRawMode() {
  if (rawModeDepth === 0) {
    readline.emitKeypressEvents(process.stdin);
    if (process.stdin.isTTY) process.stdin.setRawMode(true);
    process.stdin.resume();
  }
  rawModeDepth++;
}

function disableRawMode() {
  rawModeDepth--;
  if (rawModeDepth <= 0) {
    rawModeDepth = 0;
    pendingKeys.length = 0;
    if (process.stdin.isTTY) process.stdin.setRawMode(false);
    process.stdin.pause();
  }
}

/**
 * Runs `fn` with stdin in raw mode (so single keypresses can be read without
 * waiting for Enter) and guarantees the terminal is restored afterwards,
 * even if `fn` throws.
 */
export async function withRawMode<T>(fn: () => Promise<T>): Promise<T> {
  enableRawMode();
  try {
    return await fn();
  } finally {
    disableRawMode();
  }
}

/** Resolves with the next single keypress. Must be called within withRawMode(). */
export function readKey(): Promise<KeyEvent> {
  const pending = pendingKeys.shift();
  if (pending) return Promise.resolve(pending);

  return new Promise((resolve) => {
    let resolved = false;
    const onKeypress = (char: string, key: { name?: string; ctrl?: boolean } | undefined) => {
      const event = { char, name: key?.name, ctrl: key?.ctrl ?? false };
      if (resolved) {
        pendingKeys.push(event);
        return;
      }
      resolved = true;
      resolve(event);
      // Keep listening only for the rest of this burst — keys typed later,
      // while the caller is busy, are still dropped as before.
      setImmediate(() => process.stdin.removeListener('keypress', onKeypress));
    };
    process.stdin.on('keypress', onKeypress);
  });
}

export function isInteractiveTerminal(): boolean {
  return Boolean(process.stdin.isTTY);
}

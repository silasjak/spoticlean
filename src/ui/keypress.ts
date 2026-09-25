import readline from 'node:readline';

export type KeyEvent = {
  /** The printable character, if any (e.g. "k", " ", "?"). */
  char: string;
  name?: string;
  ctrl: boolean;
};

let rawModeDepth = 0;

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
  return new Promise((resolve) => {
    const onKeypress = (char: string, key: { name?: string; ctrl?: boolean } | undefined) => {
      process.stdin.removeListener('keypress', onKeypress);
      resolve({ char, name: key?.name, ctrl: key?.ctrl ?? false });
    };
    process.stdin.on('keypress', onKeypress);
  });
}

export function isInteractiveTerminal(): boolean {
  return Boolean(process.stdin.isTTY);
}

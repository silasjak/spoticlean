import { t } from './i18n/index.js';

/** Thrown when the user cancels an interactive prompt (e.g. Ctrl+C / Esc). */
export class AuthCancelled extends Error {
  constructor(message = t('common.cancelled')) {
    super(message);
    this.name = 'AuthCancelled';
  }
}

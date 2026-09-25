/** Thrown when the user cancels an interactive prompt (e.g. Ctrl+C / Esc). */
export class AuthCancelled extends Error {
  constructor(message = 'Abgebrochen.') {
    super(message);
    this.name = 'AuthCancelled';
  }
}

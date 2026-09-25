import { createServer, type Server } from 'node:http';

export type CallbackResult = {
  code: string;
};

const SUCCESS_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>spoticlean-cli</title>
<style>
  body { background:#121212; color:#eaeaea; font-family: system-ui, sans-serif;
         display:flex; align-items:center; justify-content:center; height:100vh; margin:0; }
  .card { text-align:center; }
  h1 { color:#1DB954; margin-bottom:.25rem; }
  p { color:#9a9a9a; }
</style></head>
<body><div class="card">
  <h1>✓ Verbunden</h1>
  <p>Du kannst dieses Tab schließen und zum Terminal zurückkehren.</p>
</div></body></html>`;

const ERROR_HTML = (message: string) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>spoticlean-cli</title>
<style>
  body { background:#121212; color:#eaeaea; font-family: system-ui, sans-serif;
         display:flex; align-items:center; justify-content:center; height:100vh; margin:0; }
  .card { text-align:center; }
  h1 { color:#e35050; margin-bottom:.25rem; }
  p { color:#9a9a9a; }
</style></head>
<body><div class="card">
  <h1>✗ Anmeldung fehlgeschlagen</h1>
  <p>${message}</p>
</div></body></html>`;

/**
 * Starts a one-shot local HTTP server on 127.0.0.1:port that listens for the
 * Spotify OAuth redirect on /callback, validates the `state` param, and
 * resolves with the authorization `code`. The server always shuts itself
 * down after handling exactly one request (or hitting the timeout).
 */
export function waitForAuthorizationCode(options: {
  port: number;
  expectedState: string;
  timeoutMs?: number;
}): Promise<CallbackResult> {
  const { port, expectedState, timeoutMs = 5 * 60 * 1000 } = options;

  return new Promise<CallbackResult>((resolve, reject) => {
    const server: Server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`);
      if (url.pathname !== '/callback') {
        res.writeHead(404).end();
        return;
      }

      const error = url.searchParams.get('error');
      const code = url.searchParams.get('code');
      const state = url.searchParams.get('state');

      if (error) {
        res.writeHead(400, { 'Content-Type': 'text/html' }).end(ERROR_HTML(error));
        finish(() => reject(new Error(`Spotify meldete einen Fehler: ${error}`)));
        return;
      }

      if (!code || state !== expectedState) {
        res.writeHead(400, { 'Content-Type': 'text/html' }).end(
          ERROR_HTML('Ungültige Antwort (state stimmt nicht überein).')
        );
        finish(() => reject(new Error('OAuth state mismatch — mögliche CSRF oder abgelaufene Anfrage.')));
        return;
      }

      res.writeHead(200, { 'Content-Type': 'text/html' }).end(SUCCESS_HTML);
      finish(() => resolve({ code }));
    });

    const timeout = setTimeout(() => {
      server.close();
      reject(new Error('Zeitüberschreitung: Es kam keine Antwort von Spotify.'));
    }, timeoutMs);

    function finish(fn: () => void) {
      clearTimeout(timeout);
      fn();
      // Give the HTTP response a tick to flush before closing the socket.
      setTimeout(() => server.close(), 50);
    }

    server.on('error', (err: NodeJS.ErrnoException) => {
      clearTimeout(timeout);
      if (err.code === 'EADDRINUSE') {
        reject(
          new Error(
            `Port ${port} ist bereits belegt. Führe "spoticlean setup" aus und wähle einen anderen Port.`
          )
        );
        return;
      }
      reject(err);
    });

    server.listen(port, '127.0.0.1');
  });
}

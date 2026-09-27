// Imported (for its side effects, first) by client.test.ts/tracks.test.ts/
// playlists.test.ts — every one of them goes through spotify.get/post/etc.,
// which calls getAccessToken() before the mockable fetch() ever runs.
// Rather than mocking that whole auth module, this points config.ts (via
// $XDG_CONFIG_HOME, read at that module's own top level) at an isolated,
// throwaway directory pre-seeded with a token that's already valid — so
// getAccessToken() takes its fast, no-network "still valid" path and the
// tests never touch the real config file or come anywhere near a real
// login/refresh flow.
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const configDir = mkdtempSync(path.join(tmpdir(), 'spoticlean-test-config-'));
const stateDir = mkdtempSync(path.join(tmpdir(), 'spoticlean-test-state-'));
process.env.XDG_CONFIG_HOME = configDir;
process.env.XDG_STATE_HOME = stateDir;

const configFile = path.join(configDir, 'spoticlean', 'config.json');
mkdirSync(path.dirname(configFile), { recursive: true });
writeFileSync(
  configFile,
  JSON.stringify({
    clientId: 'test-client-id',
    redirectPort: 8888,
    tokens: {
      accessToken: 'test-access-token',
      refreshToken: 'test-refresh-token',
      expiresAt: Date.now() + 3_600_000,
      scope: 'test',
    },
  })
);

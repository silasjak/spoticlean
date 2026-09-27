# spoticlean

Interactive command-line app to clean up your Spotify playlists (and your
"Liked Songs"): listen to a song — jumping straight to the chorus if
possible — then **keep** or **remove** it.

![node](https://img.shields.io/badge/node-%3E%3D20-1DB954)
[![CI](https://github.com/silasjak/spoticlean/actions/workflows/ci.yml/badge.svg)](https://github.com/silasjak/spoticlean/actions/workflows/ci.yml)

## Requirements

- Node.js ≥ 20
- A Spotify account. Auto-play needs **Spotify Premium** plus an **active
  device** (phone, desktop, or web player) — cleanup still works without
  that, just without the automatic jump to the chorus.

## Installation

```bash
npm install
npm run build
npm link
```

For development (no build, with hot reload): `npm run dev`.

## Setup

This app uses OAuth **Authorization Code + PKCE** — you only need a
**Client ID**, no secret. That's a one-time, purely manual step on
Spotify's own site (there's no API for it):

1. Open the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
   and create a new app with your own Spotify account.
2. Enter `http://127.0.0.1:8888/callback` as the Redirect URI (adjust the
   port if you pick something other than the default `8888` on startup).
3. Run `spoticlean` — the CLI walks you through entering the Client ID,
   logging in, and choosing a language interactively.

Setting the values manually, similar to `.env.example`, also works.

The rest (keyboard shortcuts, history, settings, debug mode, …) is
discoverable just by trying it — the key bar is always visible, and
`spoticlean help` lists everything else.

## License

MIT

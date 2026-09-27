# spoticlean-cli

Interaktive Kommandozeilen-App, um deine Spotify-Playlisten (und deine
„Liked Songs“) aufzuräumen: Song anhören — möglichst direkt am Refrain —
und dann **behalten** oder **entfernen**.

![node](https://img.shields.io/badge/node-%3E%3D20-1DB954)
[![CI](https://github.com/silasjak/spoticlean-cli/actions/workflows/ci.yml/badge.svg)](https://github.com/silasjak/spoticlean-cli/actions/workflows/ci.yml)

## Voraussetzungen

- Node.js ≥ 20
- Ein Spotify-Account. Für automatisches Abspielen wird **Spotify
  Premium** plus ein **aktives Gerät** benötigt (Handy, Desktop oder
  Web-Player) — ohne das funktioniert das Aufräumen trotzdem, nur ohne
  automatischen Sofort-Refrain.

## Installation

```bash
npm install
npm run build
npm link
```

Für die Entwicklung (ohne Build, mit Hot-Reload): `npm run dev`.

## Setup

Diese App nutzt OAuth **Authorization Code + PKCE** — du brauchst nur
eine **Client ID**, kein Secret. Das ist ein einmaliger, rein manueller
Schritt auf Spotifys eigener Seite (dafür gibt's keine API):

1. Öffne das [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
   und erstelle eine neue App mit deinem eigenen Spotify-Account.
2. Trage als Redirect URI `http://127.0.0.1:8888/callback` ein (Port
   anpassen, falls du beim Start einen anderen als den Standard `8888`
   wählst).
3. Starte `spoticlean` — Client-ID-Eingabe, Login und Sprachwahl führt
   die CLI selbst interaktiv durch.

Manuelles Setzen der Werte analog `.env.example` ist auch möglich.

Die Bedienung (Tastenkürzel, Verlauf, Einstellungen, Debug-Modus, …)
erschließt sich beim Ausprobieren von selbst — die Tastenleiste ist immer
sichtbar, und `spoticlean help` listet alles Weitere auf.

## Lizenz

MIT

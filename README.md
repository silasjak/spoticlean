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

## Setup

Diese App nutzt OAuth **Authorization Code + PKCE** — du brauchst nur
eine **Client ID**, kein Secret. Das ist ein einmaliger, rein manueller
Schritt auf Spotifys eigener Seite (dafür gibt's keine API):

1. Öffne das [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
   und erstelle eine neue App mit deinem eigenen Spotify-Account.
2. Starte `spoticlean` (siehe unten) — alles Weitere (Redirect URI,
   Client-ID-Eingabe, Login, Sprachwahl) führt die CLI selbst interaktiv
   durch.

Für Skripte/CI kann die Client ID auch per `SPOTICLEAN_CLIENT_ID`
(optional zusätzlich `SPOTICLEAN_PORT`) vorbelegt werden, siehe
`.env.example`.

## Installation & Start

```bash
npm install
npm run build
npm link
spoticlean
```

Für die Entwicklung (ohne Build, mit Hot-Reload):

```bash
npm run dev
```

Die Bedienung (Tastenkürzel, Verlauf, Einstellungen, Debug-Modus, …)
erschließt sich beim Ausprobieren von selbst — die Tastenleiste ist immer
sichtbar, und `spoticlean help` listet alles Weitere auf.

## Nutzung durch andere Personen

Das Repo ist **privat** — nur eingeladene GitHub-Collaborator können
clonen. Es gibt keinen gemeinsamen Zugang oder geteilte Secrets: jede
Person richtet einmal ihre **eigene**, kostenlose Spotify-App ein (siehe
[Setup](#setup)) und nutzt `spoticlean` danach komplett unter ihrem
eigenen Account.

## Entwicklung

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

Läuft automatisch bei jedem Push/PR über [GitHub Actions](.github/workflows/ci.yml).

## Lizenz

MIT

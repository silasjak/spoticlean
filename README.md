# spoticlean-cli

Interaktive Kommandozeilen-App, um deine Spotify-Playlisten (und deine
„Liked Songs“) aufzuräumen: Song anhören — möglichst direkt am Refrain,
damit du schnell entscheiden kannst — und dann **behalten** oder
**entfernen**.

![node](https://img.shields.io/badge/node-%3E%3D20-1DB954)

## Voraussetzungen

- Node.js ≥ 20
- Ein Spotify-Account. Für automatisches Abspielen (Refrain sofort hören)
  wird **Spotify Premium** benötigt, plus ein **aktives Gerät** — also
  Spotify geöffnet auf Handy, Desktop oder im Web-Player. Ohne das
  funktioniert das Aufräumen trotzdem (Metadaten + `o` zum manuellen
  Öffnen in Spotify), nur eben ohne automatischen Sofort-Refrain.

## Einmalige Einrichtung (Spotify App)

Diese App nutzt **OAuth Authorization Code + PKCE** — es wird nur eine
**Client ID** benötigt, kein Client Secret (die Client ID ist nicht
geheim).

Das ist ein rein manueller Schritt auf Spotifys eigener Seite — es gibt
keine API, über die eine CLI das für dich erledigen könnte. Alles danach
läuft komplett über `spoticlean` selbst, ohne dass du je eine Datei
anfassen musst:

1. Öffne das [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
   und erstelle eine neue App **mit deinem eigenen Spotify-Account**.
2. Beim ersten Start von `spoticlean` fragt die CLI zuerst nach einem
   lokalen Port (Standard `8888`) und zeigt dir danach genau die Redirect
   URI, die du bei Spotify eintragen musst (z. B.
   `http://127.0.0.1:8888/callback`).
3. Kopiere die **Client ID** aus den App-Einstellungen und gib sie in
   der CLI ein, wenn sie danach fragt (kein Secret nötig).

Client ID, Port und Tokens werden danach automatisch lokal gespeichert
(siehe [Konfiguration](#konfiguration)). Falls sich der Port mit etwas
anderem auf deinem Rechner beißt, oder du die Client ID neu eintragen
willst: `spoticlean setup` fragt beides erneut ab — kein manuelles
Editieren von Config-Dateien nötig.

Für Skripte/CI gibt es zusätzlich `SPOTICLEAN_CLIENT_ID` (und optional
`SPOTICLEAN_PORT`) als Umgebungsvariablen, die den Prompt überspringen:

```bash
cp .env.example .env
# SPOTICLEAN_CLIENT_ID=... in .env eintragen
node --env-file=.env dist/index.js
```

## Installation & Nutzung

```bash
npm install
npm run build
npm start
# oder direkt ausführen:
node dist/index.js

# global verlinken, um einfach `spoticlean` aufzurufen:
npm link
spoticlean
```

Für die Entwicklung (ohne Build, mit Hot-Reload via tsx):

```bash
npm run dev
```

Beim ersten Start öffnet sich der Browser zur Spotify-Anmeldung. Danach
wählst du eine deiner eigenen Playlisten oder „Liked Songs“ aus.

## Bedienung

Die Review-Ansicht läuft im Alternate-Screen-Buffer (wie `htop`/`less`) mit
einer festen Tastenleiste am unteren Rand — die Tasten sind immer sichtbar,
kein Popup, kein `?` nötig. Dein normales Terminal-Scrollback bleibt
unberührt und ist nach dem Beenden wieder da.

Pro Song wird sofort versucht, an einer geschätzten Refrain-Stelle
(~40 % der Songlänge) auf deinem aktiven Spotify-Gerät abzuspielen.

| Taste            | Aktion                                          |
| ----------------- | ------------------------------------------------ |
| `Enter` / `k`     | **Keep** — Song bleibt in der Playlist            |
| `⌫` (Backspace) / `r` | **Remove** — Song wird sofort entfernt        |
| `u`               | Undo — letzte Entscheidung zurücknehmen           |
| `Leertaste`       | Pause / Weiter                                    |
| `,` / `.`         | 10s zurück / vor                                  |
| `b`               | Zurück zum geschätzten Refrain-Einstieg           |
| `o`               | Song in Spotify öffnen (App/Web)                  |
| `q` / `Strg+C`    | Beenden — Fortschritt wird gespeichert            |

Entfernen passiert **sofort** über die Spotify-API (kein Sammel-Commit am
Ende), `u` macht das zuverlässig rückgängig (Song wird wieder
hinzugefügt). Der Fortschritt (welcher Song als nächstes kommt) wird
lokal gespeichert — brichst du ab, kannst du beim nächsten Start dort
weitermachen.

## Konfiguration

Client ID, Tokens und Fortschritt liegen lokal unter:

- Linux: `~/.config/spoticlean-cli/config.json`
- macOS: `~/Library/Preferences/spoticlean-cli/config.json`
- Windows: `%APPDATA%\spoticlean-cli\Config\config.json`

```bash
spoticlean setup    # Client ID / Port neu einrichten
spoticlean logout   # gespeicherte Anmeldung entfernen
```

## Wie das Abspielen funktioniert (und Grenzen)

Es gibt kein Web Playback SDK für Node — eine CLI kann keinen
Audio-Stream selbst dekodieren/abspielen. Stattdessen steuert
`spoticlean` per [Spotify Connect API](https://developer.spotify.com/documentation/web-api/reference/start-a-users-playback)
ein bereits laufendes Spotify (dein Handy, Desktop-Client oder der
Web-Player) und springt dort direkt zur geschätzten Refrain-Stelle.
Das erfordert **Premium** und ein **aktives Gerät**. Ist beides nicht
gegeben, zeigt die App das an und du kannst Songs trotzdem anhand der
Metadaten bzw. über `o` (öffnet den Song in Spotify zum manuellen
Anhören) beurteilen.

Die „Refrain-Position“ ist eine grobe Heuristik (40 % der Songlänge),
keine echte Musikanalyse — bei ungewöhnlichen Songstrukturen also
einfach mit `,`/`.`/`b` nachjustieren.

## Nutzung durch andere Personen

Das Repo ist **privat** — clonen kann nur, wer als GitHub-Collaborator
eingeladen ist (oder Zugriff über eine Organisation hat). Wer Zugriff
hat, kann das Tool aber komplett eigenständig nutzen: es gibt keinen
gemeinsam genutzten Zugang und keine geteilten Secrets im Code. Jede
Person durchläuft einmal die [Einrichtung](#einmalige-einrichtung-spotify-app)
mit ihrem **eigenen** Spotify-Account und ihrer **eigenen**, kostenlosen
Spotify-App — danach läuft `spoticlean` bei ihr unter ihrem eigenen
Account, unabhängig von allen anderen.

(Alternative, falls du stattdessen *eine* gemeinsame Spotify-App für
eine kleine, feste Gruppe betreiben willst: Spotify-Apps im
"Development Mode" erlauben bis zu 25 Accounts, die du im Dashboard
namentlich freischalten müsstest — mehr Aufwand für dich als App-Owner,
dafür entfällt der Setup-Schritt für die anderen. Für "jeder, der
Zugriff auf das Repo hat, kann es einfach benutzen" ist die
Standard-Variante mit eigener App pro Person aber die unkompliziertere.)

## Bekannte Einschränkungen

- Entfernen wirkt auf **alle** Vorkommen eines Songs in der Playlist
  (Duplikate werden zusammen entfernt) — für ein Aufräum-Tool i.d.R.
  gewollt.
- Lokale Dateien in Playlisten können nicht über Spotify Connect
  abgespielt werden.

## Entwicklung

```bash
npm run typecheck
npm run lint
npm test
```

## Lizenz

MIT

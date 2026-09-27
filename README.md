# spoticlean-cli

Interaktive Kommandozeilen-App, um deine Spotify-Playlisten (und deine
„Liked Songs“) aufzuräumen: Song anhören — möglichst direkt am Refrain,
damit du schnell entscheiden kannst — und dann **behalten** oder
**entfernen**.

![node](https://img.shields.io/badge/node-%3E%3D20-1DB954)
[![CI](https://github.com/silasjak/spoticlean-cli/actions/workflows/ci.yml/badge.svg)](https://github.com/silasjak/spoticlean-cli/actions/workflows/ci.yml)

Verfügbar auf Deutsch und Englisch — wird beim Start automatisch anhand
der Systemsprache erkannt (Fallback Englisch), lässt sich aber jederzeit
umstellen (siehe [Sprache](#sprache)).

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

`spoticlean setup` (siehe unten) fragt zusätzlich einmal die
[Sprache](#sprache) ab, bevor es zu Port und Client ID kommt.

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

Beim Start fragt `spoticlean` zuerst, ob du eine Playlist aufräumen oder
die [Einstellungen](#einstellungen) öffnen willst. Bei "Playlist
aufräumen" öffnet sich beim allerersten Mal der Browser zur
Spotify-Anmeldung, danach wählst du eine deiner eigenen Playlisten oder
„Liked Songs“ aus.

## Bedienung

Die Review-Ansicht läuft im Alternate-Screen-Buffer (wie `htop`/`less`) mit
einer festen Tastenleiste am unteren Rand — die Tasten sind immer sichtbar,
kein Popup, kein `?` nötig. Dein normales Terminal-Scrollback bleibt
unberührt und ist nach dem Beenden wieder da.

Pro Song wird sofort versucht, an einer geschätzten Refrain-Stelle
(~40 % der Songlänge) auf deinem aktiven Spotify-Gerät abzuspielen; eine
Fortschrittsleiste (elapsed/gesamt) zeigt dabei live die Position und
tickt von selbst weiter, auch ohne jede Taste zu drücken.

| Taste            | Aktion                                          |
| ----------------- | ------------------------------------------------ |
| `Enter` / `k`     | **Keep** — Song bleibt in der Playlist            |
| `⌫` (Backspace) / `r` | **Remove** — Song wird sofort entfernt        |
| `↑` / `↓`         | Verlauf durchblättern (siehe unten)               |
| `u`               | Letzte Entscheidung korrigieren (Shortcut für "Verlauf öffnen" auf den letzten Eintrag) |
| `Leertaste`       | Pause / Weiter                                    |
| `←` / `→`         | 10s zurück / vor                                  |
| `b`               | Zurück zum geschätzten Refrain-Einstieg           |
| `o`               | Song in Spotify öffnen (App/Web)                  |
| `q` / `Strg+C`    | Beenden — Fortschritt wird gespeichert            |

Entfernen passiert **sofort** über die Spotify-API (kein Sammel-Commit am
Ende), `u` macht das zuverlässig rückgängig (Song wird wieder
hinzugefügt). Der Fortschritt (welcher Song als nächstes kommt) wird
lokal gespeichert, anhand des Songs selbst statt einer reinen Position —
brichst du ab und entfernst zwischenzeitlich (in einer anderen Session)
Songs davor, macht `spoticlean` beim nächsten Start trotzdem exakt beim
richtigen Song weiter, statt bei einer verschobenen Zählposition zu
landen.

### Im Verlauf blättern und einen älteren Song neu entscheiden

Der "Verlauf"-Bereich zeigt alle bereits entschiedenen Songs. Mit `↑`
markierst du den letzten Eintrag; mit `↑`/`↓` bewegst du die Markierung
weiter, auch über den sichtbaren Ausschnitt hinaus (er scrollt mit).
`Enter` auf einem markierten Song öffnet ihn erneut zum Reinhören und
Neu-Entscheiden (Keep/Remove) — **nur dieser eine Song ändert sich**,
alle anderen Entscheidungen bleiben unangetastet. In der Verlauf-Liste
bleibt er dabei hervorgehoben, mit dem Zusatz "(wird korrigiert)".
Direkt danach geht es exakt dort weiter, wo du vorher warst, kein
erneutes Durch-Entscheiden nötig. `Esc` bricht sowohl das Blättern als
auch eine begonnene Neu-Entscheidung ohne Änderung ab.

Willst du stattdessen mehrere Entscheidungen **in Folge** rückgängig
machen (nicht nur eine einzelne, beliebig weit zurückliegende), ist
dafür weiterhin mehrfaches `u` gedacht — das räumt der Reihe nach die
letzten Entscheidungen ab, unabhängig vom Verlauf-Browser.

## Sprache

Beim ersten Start wird die Sprache automatisch anhand der Systemsprache
gewählt (aktuell Deutsch oder Englisch, sonst Englisch als Fallback).
Umstellen geht jederzeit über `spoticlean setup` (erster Schritt) oder
über [Einstellungen](#einstellungen) im Hauptmenü — beides wirkt sofort,
auch mitten im gerade laufenden Vorgang.

## Einstellungen

Über den Menüpunkt "Einstellungen" beim Start öffnet sich ein eigener
Vollbild-Screen für Sprache, Port und Client ID — ohne den kompletten
`spoticlean setup`-Assistenten erneut durchlaufen zu müssen:

- `↑` / `↓` wechselt das fokussierte Feld.
- Bei Sprache: `←` / `→` schaltet direkt um, mit sofortiger Vorschau im
  ganzen Screen.
- Bei Port / Client ID: `Enter` öffnet das Feld zum Bearbeiten (Tippen,
  `⌫`, `Enter` übernimmt, `Esc` verwirft nur dieses Feld). Die
  Redirect-URI-Zeile unter Port aktualisiert sich dabei live.
- `s` speichert **alle** Änderungen auf einmal; bis dahin ist nichts
  geschrieben. `Esc` (außerhalb eines gerade bearbeiteten Feldes) verwirft
  den kompletten Entwurf, inklusive einer nur vorgeschauten Sprache.
- Client ID ändern setzt die gespeicherte Anmeldung zurück (neue
  Client ID = neue Spotify-App, der alte Token passt nicht mehr) — beim
  nächsten Start ist dann eine erneute Anmeldung nötig.

`spoticlean setup` bleibt daneben bestehen: der einmalige, lineare
Assistent, der alle drei Werte nacheinander abfragt und nicht
weiterlässt, bevor sie gesetzt sind (u. a. für die erste Einrichtung).

## Konfiguration

Client ID, Sprache, Tokens und Fortschritt liegen lokal unter:

- Linux: `~/.config/spoticlean-cli/config.json`
- macOS: `~/Library/Preferences/spoticlean-cli/config.json`
- Windows: `%APPDATA%\spoticlean-cli\Config\config.json`

```bash
spoticlean setup    # Sprache / Client ID / Port neu einrichten
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
einfach mit `←`/`→`/`b` nachjustieren.

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
  abgespielt werden, und nicht zu/aus Liked Songs hinzugefügt/entfernt
  werden.

## Spotify-API-Version

Seit Spotifys ["Update on Developer Access and Platform Security"](https://developer.spotify.com/blog/2026-02-06-update-on-developer-access-and-platform-security)
(Feb. 2026) nutzt diese App die dabei eingeführten Endpunkte:
`GET /playlists/{id}/items` (statt `.../tracks`) und `PUT`/`DELETE
/me/library` (statt der Track-spezifischen `/me/tracks`). Diese
Änderungen betreffen nur **Development-Mode**-Apps (jede selbst
erstellte App gemäß der [Einrichtung](#einmalige-einrichtung-spotify-app)
oben) — Apps mit "Extended Quota Mode" sind davon nicht betroffen und
könnten theoretisch noch die alten Endpunkte nutzen, brauchen das mit
dieser Version aber nicht mehr.

## Debug-Modus

Bei Problemen mit der Spotify-API (unerwartete Fehler, kryptische
Antworten): `--debug` an den Befehl anhängen oder `SPOTICLEAN_DEBUG=1`
setzen. Jeder Request und jede Response (Methode, URL, Status, Header,
Body) landet dann in einer Log-Datei statt im Terminal — die
Vollbild-Review-Ansicht würde Konsolenausgaben sofort wieder
überschreiben.

```bash
npm run dev:debug
# oder
SPOTICLEAN_DEBUG=1 npm run dev
```

Der Pfad zur Log-Datei steht beim Start (bzw. unter `spoticlean help`),
typischerweise:

- Linux: `~/.local/state/spoticlean-cli/debug.log`
- macOS: `~/Library/Logs/spoticlean-cli/debug.log`
- Windows: `%LOCALAPPDATA%\spoticlean-cli\Log\debug.log`

Am besten in einem zweiten Terminal mitverfolgen: `tail -f <Pfad>`.
Die Datei enthält niemals den Access-Token (nur, dass einer gesendet
wurde), sonst aber alles — beim Teilen also kurz auf Songnamen/IDs
achten, falls das relevant ist.

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

// Source of truth for translation keys/shape — `en.ts` is typed against
// `Translations` (see below), so a missing or extra key there is a
// compile error instead of a silent gap at runtime. Deliberately not
// `as const`: that would narrow every value to its own string literal
// type, which `en.ts`'s (different!) text could then never satisfy.
const de = {
  common: {
    cancelled: 'Abgebrochen.',
    needsTty: 'spoticlean braucht ein interaktives Terminal (TTY), um Tasten lesen zu können.',
  },
  cli: {
    summary: {
      title: 'Zusammenfassung',
      kept: '{{count}} behalten',
      removed: '{{count}} entfernt',
      removedListTitle: 'Entfernt:',
      removedMore: '… und {{count}} weitere',
      quitEarly: "Abgebrochen bei Track {{current}}/{{total}} — beim nächsten Mal geht's von hier weiter.",
    },
    logoutSuccess: 'Abgemeldet. Beim nächsten Start ist eine erneute Anmeldung nötig.',
    setupReady: 'Bereit! ✨',
    outroDone: 'Fertig! ✨',
    debugModeOn: 'Debug-Modus an — Requests/Responses landen in: {{path}}',
    mainMenu: {
      question: 'Was möchtest du tun?',
      reviewOption: 'Playlist aufräumen',
      settingsOption: 'Einstellungen',
    },
    help: {
      noCommandLabel: '(kein Befehl)',
      noCommandDesc: 'Playlist aufräumen (fragt bei Erstnutzung automatisch nach Setup)',
      setupDesc: 'Spotify-App (Client ID) / Port neu einrichten',
      logoutDesc: 'Gespeicherte Anmeldung entfernen',
      helpDesc: 'Diese Hilfe anzeigen',
      debugFlagDesc: 'Jeden Spotify-API-Request/-Response in eine Log-Datei schreiben',
      debugFlagHint: '(auch per SPOTICLEAN_DEBUG=1 aktivierbar)',
      configPath: 'Konfiguration liegt unter {{path}}',
      debugLogPath: 'Debug-Log liegt unter {{path}}',
    },
  },
  auth: {
    setup: {
      languageQuestion: 'Welche Sprache soll spoticlean verwenden?',
      portQuestion: 'Auf welchem lokalen Port soll die Anmeldung ankommen?',
      portValidation: 'Bitte einen Port zwischen 1024 und 65535 angeben.',
      appNeededStep: 'Spotify-App wird benötigt (einmalig, pro Person)',
      noteTitle: 'Einmalige Einrichtung',
      step1: 'Öffne {{url}} und erstelle eine App (mit deinem eigenen Spotify-Account).',
      step2: 'Trage als Redirect URI {{exact}} das hier ein:',
      exactWord: 'genau',
      step3: 'Kopiere die "Client ID" aus den App-Einstellungen (kein Secret nötig).',
      clientIdQuestion: 'Spotify Client ID',
      clientIdValidation: 'Client ID darf nicht leer sein.',
      completed: 'Einrichtung abgeschlossen und angemeldet.',
    },
    login: {
      browserOpened: 'Browser wurde geöffnet — bitte bei Spotify anmelden und die Berechtigung erteilen.',
      browserFailed: 'Browser konnte nicht automatisch geöffnet werden. Öffne diesen Link manuell:',
      waiting: 'Warte auf Bestätigung im Browser…',
      cancelled: 'Anmeldung abgebrochen.',
      confirmed: 'Anmeldung bestätigt.',
      noRefreshToken: 'Spotify hat keinen Refresh-Token geliefert.',
    },
    token: {
      refreshFailed: 'Sitzung konnte nicht erneuert werden — erneute Anmeldung nötig.',
    },
    oauth: {
      tokenEndpointError: 'Spotify Token-Endpoint antwortete mit {{status}}: {{body}}',
    },
    callback: {
      successTitle: 'Verbunden',
      successBody: 'Du kannst dieses Tab schließen und zum Terminal zurückkehren.',
      errorTitle: 'Anmeldung fehlgeschlagen',
      spotifyError: 'Spotify meldete einen Fehler: {{error}}',
      invalidState: 'Ungültige Antwort (state stimmt nicht überein).',
      stateMismatchError: 'OAuth state mismatch — mögliche CSRF oder abgelaufene Anfrage.',
      timeout: 'Zeitüberschreitung: Es kam keine Antwort von Spotify.',
      portInUse: 'Port {{port}} ist bereits belegt. Führe "spoticlean setup" aus und wähle einen anderen Port.',
    },
  },
  device: {
    noneFound:
      'Kein Spotify-Gerät gefunden. Öffne Spotify auf deinem Handy, Desktop oder im Browser und starte die App erneut, um automatisches Abspielen zu nutzen. Bis dahin kannst du Songs mit {{key}} manuell öffnen.',
    selectQuestion: 'Auf welchem Gerät soll abgespielt werden?',
  },
  source: {
    likedSongsName: 'Lieblingssongs',
    loading: 'Lade deine Playlisten…',
    loaded_one: '{{count}} eigene Playlist gefunden.',
    loaded_other: '{{count}} eigene Playlisten gefunden.',
    unknownCountWarning_one:
      'Spotify hat für {{count}} Playlist keine Song-Anzahl geliefert: {{names}}. Das Aufräumen funktioniert trotzdem — nur die Anzeige "? Songs" ist ungenau.',
    unknownCountWarning_other:
      'Spotify hat für {{count}} Playlists keine Song-Anzahl geliefert: {{names}}. Das Aufräumen funktioniert trotzdem — nur die Anzeige "? Songs" ist ungenau.',
    selectQuestion: 'Welche Playlist möchtest du aufräumen?',
    songsCount_one: '{{count}} Song',
    songsCount_other: '{{count}} Songs',
    unknownSongCount: '? Songs',
  },
  review: {
    resume: {
      question: 'Du hattest hier bei Track {{current}}/{{total}} aufgehört.',
      continueOption: 'Fortsetzen',
      startOverOption: 'Von vorne beginnen',
    },
    loading: 'Lade Songs aus "{{name}}"…',
    loadingProgress: 'Lade Songs aus "{{name}}"… ({{loaded}}/{{total}})',
    loadFailed: 'Laden von "{{name}}" fehlgeschlagen.',
    loadError: 'Songs aus "{{name}}" konnten nicht geladen werden: {{message}}',
    loaded_one: '{{count}} Song geladen.',
    loaded_other: '{{count}} Songs geladen.',
    playback: {
      premiumRequired: 'Automatisches Abspielen benötigt Spotify Premium — nur noch Metadaten.',
      noDevice: 'Kein aktives Wiedergabegerät mehr gefunden — nur noch Metadaten.',
      actionFailed: 'Wiedergabe-Aktion fehlgeschlagen{{detail}}: {{message}}',
    },
    openedInSpotify: 'In Spotify geöffnet: {{name}}',
    removing: 'Entferne: {{name}}…',
    removed: 'Entfernt: {{name}}',
    removeFailed: 'Entfernen fehlgeschlagen ({{name}}): {{message}}',
    restoring: 'Wiederherstellen: {{name}}…',
    restored: 'Wiederhergestellt: {{name}}',
    restoreFailed: 'Wiederherstellen fehlgeschlagen: {{message}}',
    nothingToCorrect: 'Nichts zum Korrigieren.',
    kept: 'Behalten: {{name}}',
    unexpectedError: 'Unerwarteter Fehler: {{message}} — springe zum nächsten Song.',
    frame: {
      title: 'spoticlean · {{source}} · Track {{current}}/{{total}}',
      addedOn: 'hinzugefügt am {{date}}',
      localFile: 'Lokale Datei — kein Abspielen über Spotify Connect möglich.',
      beingCorrected: ' (wird korrigiert)',
      noDecisionsYet: 'Noch keine Entscheidungen.',
      historyTitle: 'Verlauf',
    },
    hints: {
      keep: 'behalten',
      remove: 'entfernen',
      history: 'Verlauf',
      correctLast: 'letzte korrigieren',
      pause: 'pause',
      seek: 'spulen',
      chorus: 'Refrain',
      open: 'öffnen',
      quit: 'beenden',
      select: 'auswählen',
      openAndCorrect: 'öffnen & korrigieren',
      cancel: 'abbrechen',
    },
  },
  settings: {
    title: 'Einstellungen',
    fields: {
      language: 'Sprache',
      port: 'Port',
      clientId: 'Client ID',
      redirectUri: 'Redirect URI',
    },
    hints: {
      navigate: 'auswählen',
      edit: 'bearbeiten',
      toggleLanguage: 'Sprache wechseln',
      save: 'speichern',
      discard: 'verwerfen',
      confirmEdit: 'übernehmen',
      cancelEdit: 'abbrechen',
    },
    clientIdChanged: 'Client ID geändert — beim nächsten Start ist eine erneute Anmeldung nötig.',
  },
  spotify: {
    tracks: {
      unexpectedShape: 'Unerwartete Antwort von Spotify: weder "track" noch "item" im Eintrag vorhanden.',
      localNotRemovable: 'Lokale Dateien können nicht aus Liked Songs entfernt werden.',
      localNotRestorable: 'Lokale Dateien können nicht zu Liked Songs hinzugefügt werden.',
    },
    client: {
      invalidJson: 'Antwort von Spotify ({{method}} {{path}}, Status {{status}}) war kein gültiges JSON: {{body}}',
    },
  },
};

export default de;
export type Translations = typeof de;

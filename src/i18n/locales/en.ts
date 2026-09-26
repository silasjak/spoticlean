import type { Translations } from './de.js';

// Typed against `Translations` (de.ts's shape) — TypeScript flags a missing
// or extra key here at compile time instead of it silently falling back.
const en: Translations = {
  common: {
    cancelled: 'Cancelled.',
  },
  cli: {
    summary: {
      title: 'Summary',
      kept: '{{count}} kept',
      removed: '{{count}} removed',
      removedListTitle: 'Removed:',
      removedMore: '… and {{count}} more',
      quitEarly: 'Stopped at track {{current}}/{{total}} — you can pick up right here next time.',
    },
    logoutSuccess: "Logged out. You'll need to sign in again next time.",
    setupReady: 'Ready! ✨',
    outroDone: 'Done! ✨',
    debugModeOn: 'Debug mode on — requests/responses go to: {{path}}',
    help: {
      noCommandLabel: '(no command)',
      noCommandDesc: 'Clean up a playlist (walks you through setup automatically on first run)',
      setupDesc: 'Reconfigure the Spotify app (Client ID) / port',
      logoutDesc: 'Remove the saved login',
      helpDesc: 'Show this help text',
      debugFlagDesc: 'Log every Spotify API request/response to a file',
      debugFlagHint: '(also enabled via SPOTICLEAN_DEBUG=1)',
      configPath: 'Config lives at {{path}}',
      debugLogPath: 'Debug log lives at {{path}}',
    },
  },
  auth: {
    setup: {
      languageQuestion: 'Which language should spoticlean use?',
      portQuestion: 'Which local port should the login arrive on?',
      portValidation: 'Please enter a port between 1024 and 65535.',
      appNeededStep: 'A Spotify app is needed (one-time, per person)',
      noteTitle: 'One-time setup',
      step1: 'Open {{url}} and create an app (with your own Spotify account).',
      step2: 'Enter {{exact}} this as the Redirect URI:',
      exactWord: 'exactly',
      step3: 'Copy the "Client ID" from the app settings (no secret needed).',
      clientIdQuestion: 'Spotify Client ID',
      clientIdValidation: "Client ID can't be empty.",
      completed: 'Setup complete and signed in.',
    },
    login: {
      browserOpened: 'Browser opened — please sign in with Spotify and grant access.',
      browserFailed: "Browser couldn't be opened automatically. Open this link manually:",
      waiting: 'Waiting for confirmation in the browser…',
      cancelled: 'Login cancelled.',
      confirmed: 'Login confirmed.',
      noRefreshToken: "Spotify didn't return a refresh token.",
    },
    token: {
      refreshFailed: "Session couldn't be renewed — signing in again is needed.",
    },
    oauth: {
      tokenEndpointError: 'Spotify token endpoint responded with {{status}}: {{body}}',
    },
    callback: {
      successTitle: 'Connected',
      successBody: 'You can close this tab and go back to the terminal.',
      errorTitle: 'Login failed',
      spotifyError: 'Spotify reported an error: {{error}}',
      invalidState: 'Invalid response (state mismatch).',
      stateMismatchError: 'OAuth state mismatch — possible CSRF or expired request.',
      timeout: "Timed out: Spotify didn't respond in time.",
      portInUse: 'Port {{port}} is already in use. Run "spoticlean setup" and pick a different port.',
    },
  },
  device: {
    noneFound:
      'No Spotify device found. Open Spotify on your phone, desktop, or in a browser, then start the app again to use auto-play. Until then you can open songs manually with {{key}}.',
    selectQuestion: 'Which device should playback use?',
  },
  source: {
    loading: 'Loading your playlists…',
    loaded_one: '{{count}} playlist you own found.',
    loaded_other: '{{count}} playlists you own found.',
    unknownCountWarning_one:
      'Spotify didn\'t report a song count for {{count}} playlist: {{names}}. Cleanup still works — only the "? songs" display is inaccurate.',
    unknownCountWarning_other:
      'Spotify didn\'t report a song count for {{count}} playlists: {{names}}. Cleanup still works — only the "? songs" display is inaccurate.',
    selectQuestion: 'Which playlist do you want to clean up?',
    songsCount_one: '{{count}} song',
    songsCount_other: '{{count}} songs',
    unknownSongCount: '? songs',
  },
  review: {
    resume: {
      question: 'You left off at track {{current}}/{{total}} here.',
      continueOption: 'Continue',
      startOverOption: 'Start over',
    },
    needsTty: 'spoticlean needs an interactive terminal (TTY) to read key presses.',
    loading: 'Loading songs from "{{name}}"…',
    loadingProgress: 'Loading songs from "{{name}}"… ({{loaded}}/{{total}})',
    loadFailed: 'Loading "{{name}}" failed.',
    loadError: 'Songs from "{{name}}" could not be loaded: {{message}}',
    loaded_one: '{{count}} song loaded.',
    loaded_other: '{{count}} songs loaded.',
    playback: {
      premiumRequired: 'Auto-play needs Spotify Premium — metadata only from here.',
      noDevice: 'No active playback device found any more — metadata only from here.',
      actionFailed: 'Playback action failed{{detail}}: {{message}}',
    },
    openedInSpotify: 'Opened in Spotify: {{name}}',
    removing: 'Removing: {{name}}…',
    removed: 'Removed: {{name}}',
    removeFailed: 'Removing failed ({{name}}): {{message}}',
    restoring: 'Restoring: {{name}}…',
    restored: 'Restored: {{name}}',
    restoreFailed: 'Restoring failed: {{message}}',
    nothingToCorrect: 'Nothing to correct.',
    kept: 'Kept: {{name}}',
    unexpectedError: 'Unexpected error: {{message}} — skipping to the next song.',
    frame: {
      title: 'spoticlean · {{source}} · Track {{current}}/{{total}}',
      addedOn: 'added on {{date}}',
      localFile: 'Local file — playback via Spotify Connect not possible.',
      positionFrom: 'at {{time}}',
      beingCorrected: ' (being corrected)',
      noDecisionsYet: 'No decisions yet.',
      historyTitle: 'History',
    },
    hints: {
      keep: 'keep',
      remove: 'remove',
      history: 'history',
      correctLast: 'correct last',
      pause: 'pause',
      seek: 'seek',
      chorus: 'chorus',
      open: 'open',
      quit: 'quit',
      select: 'select',
      openAndCorrect: 'open & correct',
      cancel: 'cancel',
    },
  },
  spotify: {
    tracks: {
      unexpectedShape: 'Unexpected response from Spotify: neither "track" nor "item" present in the entry.',
      localNotRemovable: "Local files can't be removed from Liked Songs.",
      localNotRestorable: "Local files can't be added to Liked Songs.",
    },
    client: {
      invalidJson: 'Response from Spotify ({{method}} {{path}}, status {{status}}) was not valid JSON: {{body}}',
    },
  },
};

export default en;

import * as p from '@clack/prompts';
import pc from 'picocolors';

import { getDevices, transferPlayback } from '../spotify/playback.js';

/**
 * Picks (and activates) a Spotify Connect device to control during the
 * review session. Returns `undefined` when no device is available at
 * all — the caller should then fall back to manual playback (opening the
 * track via `o`) instead of auto-playing the chorus.
 */
export async function prepareDevice(): Promise<string | undefined> {
  const { devices } = await getDevices();
  const usable = devices.filter((device) => device.id && !device.is_restricted);

  if (usable.length === 0) {
    p.log.warn(
      'Kein Spotify-Gerät gefunden. Öffne Spotify auf deinem Handy, Desktop oder im Browser und starte die App erneut, ' +
        `um automatisches Abspielen zu nutzen. Bis dahin kannst du Songs mit ${pc.bold('o')} manuell öffnen.`
    );
    return undefined;
  }

  const active = usable.find((device) => device.is_active);
  if (active?.id) return active.id;

  if (usable.length === 1) {
    const only = usable[0]!;
    await transferPlayback(only.id!);
    return only.id!;
  }

  const choice = await p.select({
    message: 'Auf welchem Gerät soll abgespielt werden?',
    options: usable.map((device) => ({
      value: device.id!,
      label: device.name,
      hint: device.type,
    })),
  });

  if (p.isCancel(choice)) return undefined;
  await transferPlayback(choice);
  return choice;
}

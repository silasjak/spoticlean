import gradient from 'gradient-string';

const LOGO = String.raw`
     _____ ____   ____  ______ ____   ______ __     ______  ____   _   __
    / ___// __ \ / __ \/_  __//  _/  / ____// /    / ____/ / __ \ / | / /
    \__ \/ /_/ // / / / / /   / /   / /    / /    / __/   / /_/ //  |/ /
   ___/ / ____// /_/ / / /  _/ /   / /___ / /___ / /___  / _, _// /|  /
  /____/_/     \____/ /_/  /___/   \____//_____//_____/ /_/ |_|/_/ |_/
`;

const spotifyGradient = gradient(['#1DB954', '#1ed760', '#1DB954']);

export function printBanner(): void {
  console.log(spotifyGradient.multiline(LOGO));
}

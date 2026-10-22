import { nativeIntentPath } from '../lib/shareLinks'

/**
 * Links that open the app arrive here before the router sees them (Expo Router's native intent).
 *
 * The links we send are `https://www.blendn.app/e/<id>`, `/v/<id>` and `/f/<token>` (`lib/shareLinks.ts`), but the
 * screens are `app/event/[id]`, `app/venue/[id]` and `app/f/[token]`. Without this an event link opened the "Unmatched
 * route" screen. A link to an event or a venue also loses its query string here (`lib/sceneSeed.ts` says why).
 * Anything else, a notification's path included, passes through untouched.
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  return nativeIntentPath(path)
}

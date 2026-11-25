import * as WebBrowser from 'expo-web-browser'

import { Logger } from '../lib/logger'
import { dismissModals } from '../lib/pendingRoute'
import { nativeIntentPath, siblingSiteUrl } from '../lib/shareLinks'
import { hostOf } from '../lib/urlHost'

/**
 * Links that open the app arrive here before the router sees them (Expo Router's native intent).
 *
 * The links we send are `https://<SITE_HOST>/event/<id>`, `/f/<token>` and `/c/<token>` for now (`lib/shareLinks.ts`,
 * `WEB_PAGES_LIVE`), and `/e/<id>`, `/v/<id>` once the public pages ship: all of them are read here. The screens are
 * `app/event/[id]`, `app/venue/[id]` and `app/f/[token]`, so `/e/` and `/v/` have no screen of their own and are
 * rewritten to those. Without this an `/e/` link opened the "Unmatched route" screen.
 *
 * Every URL that reaches here loses its query and fragment (fail closed, `nativeIntentPath`), but for the few checked params a
 * room link and the event preferences keep (`linkQuery`: the countdown to a room not open yet, R6-5; the room's pseudonym and
 * the intent question, SCRUM-1034): a link is anyone's string, and
 * screens read params (a DM's `draft`, sign-in's `notice`, the Scene's title and cover) that only the app itself should set.
 * In-app `router.push` does not pass through here, so the app's own navigation keeps its params.
 *
 * Both builds claim www and staging natively (SCRUM-1365), so the other environment's link arrives here too: its id is
 * the other API's, so it opens in the in-app browser on its own site, and the app stays where it is (or, on a cold
 * start, on its root). Not `Linking.openURL`: the OS would hand a link this app claims straight back to it.
 */
export function redirectSystemPath({ path, initial }: { path: string; initial: boolean }): string | Promise<string> {
  const sibling = siblingSiteUrl(path)
  if (sibling) {
    WebBrowser.openBrowserAsync(sibling).catch((error) => Logger.warn('general', 'The other site’s link did not open in the browser', { host: hostOf(sibling), error }))
    return initial ? '/' : ''
  }
  const target = nativeIntentPath(path)
  // With the app open, a modal route that is up closes first, and the link opens over what presented it (`dismissModals`).
  // A cold start stays synchronous: there is nothing to close, and the first state is read from it.
  return initial ? target : dismissModals().then(() => target)
}

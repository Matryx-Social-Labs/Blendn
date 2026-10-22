import { nativeIntentPath } from '../lib/shareLinks'

/**
 * Links that open the app arrive here before the router sees them (Expo Router's native intent).
 *
 * The links we send are `https://www.blendn.app/event/<id>` and `/f/<token>` for now (`lib/shareLinks.ts`,
 * `WEB_PAGES_LIVE`), and `/e/<id>`, `/v/<id>` once the public pages ship: all of them are read here. The screens are
 * `app/event/[id]`, `app/venue/[id]` and `app/f/[token]`, so `/e/` and `/v/` have no screen of their own and are
 * rewritten to those. Without this an `/e/` link opened the "Unmatched route" screen.
 *
 * Every URL that reaches here loses its query and fragment (fail closed, `nativeIntentPath`): a link is anyone's string, and
 * screens read params (a DM's `draft`, sign-in's `notice`, the Scene's title and cover) that only the app itself should set.
 * In-app `router.push` does not pass through here, so the app's own navigation keeps its params.
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  return nativeIntentPath(path)
}

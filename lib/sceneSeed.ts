/**
 * Whose words the Scene may paint before its own fetch lands.
 *
 * Opening an event from a card hands the Scene that card's title, cover, venue and date so it can draw at once. The
 * route is also what a link opens, and a link is somebody else's string: `…/e/<id>?title=Free%20money&cover=https://x/y.jpg`
 * would put a stranger's text on our screen and fetch their image (which tells them the device's address) for as long as
 * the request takes. So the seed is read only when the navigation came from inside the app, which says so with
 * `internal=1`; `lib/shareLinks.ts` removes the query from every link before the router sees it, `internal` included.
 */
export const INTERNAL_PARAM = 'internal'

/** The params an in-app push passes to the Scene: the flag first, then the seed. */
export const internalSeed = <T extends Record<string, string>>(seed: T): T & { internal: '1' } => ({ ...seed, internal: '1' })

type Params = Record<string, string | string[] | undefined>

/** The route's params if it was opened from inside the app, else only its id: nothing else is ours to trust. */
export function trustedParams(params: Params): Params {
  return params[INTERNAL_PARAM] === '1' ? params : { id: params.id }
}

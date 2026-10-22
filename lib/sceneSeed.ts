/**
 * Whose words the Scene may paint before its own fetch lands.
 *
 * Opening an event from a card hands the Scene that card's title, cover, venue and date so it can draw at once. A route
 * is also what a link opens, and a link is somebody else's string: `…?title=Free%20money&cover=https://x/y.jpg` would put
 * a stranger's text on our screen and fetch a stranger's image (which tells them the device's address). So nothing a URL
 * can carry is ever a seed, and no flag a URL can set is a trust signal: the seed travels in memory.
 *
 * `putSceneSeed` is called right before the in-app `router.push` and returns a one-time token that goes in the route as
 * `seed`; the Scene gives it to `takeSceneSeed`, which hands the words over once and forgets them. The token is a key
 * into this module's memory, made at the push and consumed by the first read, so a URL can neither supply seed words nor
 * name one that exists: a made-up token finds nothing, a copied one was spent, and a stale seed expires. The seed is also
 * tied to the event it was made for. Every other route param is ignored by the Scene.
 */
export type SceneSeed = {
  eventId: string
  title: string
  cover: string
  venue: string
  city: string
  start: string
  end: string
  category: string
  description: string
  interestCount: number
}

/** Long enough to cover a slow push, short enough that an unused seed cannot meet a later screen. */
export const SEED_TTL_MS = 10_000

const held = new Map<string, { seed: SceneSeed; expires: number }>()
let counter = 0

// ponytail: Math.random, not a CSPRNG. The token never leaves the process and is spent on first read; an attacker who could
// read this memory has no need to guess it. Swap for expo-crypto if the token ever travels.
const mint = () => `${++counter}-${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`

function forgetExpired(now: number) {
  for (const [token, entry] of held) if (entry.expires <= now) held.delete(token)
}

/** Keeps `seed` for the push that is about to happen; returns the token to put in the route as `seed`. */
export function putSceneSeed(seed: SceneSeed, now: number = Date.now()): string {
  forgetExpired(now)
  const token = mint()
  held.set(token, { seed, expires: now + SEED_TTL_MS })
  return token
}

/** The seed behind `token`, once: null for no token, an unknown or spent one, an expired one, or one made for another event. */
export function takeSceneSeed(token: unknown, eventId: unknown, now: number = Date.now()): SceneSeed | null {
  forgetExpired(now)
  if (typeof token !== 'string') return null
  const entry = held.get(token)
  if (!entry) return null
  held.delete(token)
  return entry.seed.eventId === eventId ? entry.seed : null
}

/** Tests only. */
export function resetSceneSeeds(): void {
  held.clear()
  counter = 0
}

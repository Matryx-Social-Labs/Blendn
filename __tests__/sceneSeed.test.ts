/*
 * The Scene's seed travels in memory (lib/sceneSeed.ts): one-time, expiring, tied to its event, never from a URL.
 */
import { putSceneSeed, resetSceneSeeds, SEED_TTL_MS, takeSceneSeed, type SceneSeed } from '../lib/sceneSeed'

const SEED: SceneSeed = { eventId: 'e1', title: 'Vinyl Night', cover: '', venue: 'Toit', city: 'Indiranagar', start: 's', end: 'e', category: '', description: 'd', interestCount: 3 }

beforeEach(resetSceneSeeds)

it('hands a seed over once, to the event it was made for', () => {
  const token = putSceneSeed(SEED, 0)
  expect(takeSceneSeed(token, 'e1', 1)).toEqual(SEED)
  expect(takeSceneSeed(token, 'e1', 2)).toBeNull()
})

it('expires after about ten seconds', () => {
  const token = putSceneSeed(SEED, 0)
  expect(takeSceneSeed(token, 'e1', SEED_TTL_MS + 1)).toBeNull()
  const fresh = putSceneSeed(SEED, 100_000)
  expect(takeSceneSeed(fresh, 'e1', 100_000 + SEED_TTL_MS - 1)).toEqual(SEED)
})

it('gives nothing for no token, a made-up one, a non-string, or the wrong event (and spends the token on the wrong event)', () => {
  const token = putSceneSeed(SEED, 0)
  for (const guess of [undefined, null, '', '1', '1-abc', 42, ['x'], { a: 1 }]) expect(takeSceneSeed(guess, 'e1', 1)).toBeNull()
  expect(takeSceneSeed(token, 'e2', 1)).toBeNull()
  expect(takeSceneSeed(token, 'e1', 2)).toBeNull()
})

it('keys by a token minted at the push, not by the event: a second push to the same event has its own, and an old token is not the new one', () => {
  const first = putSceneSeed(SEED, 0)
  const second = putSceneSeed({ ...SEED, title: 'Newer' }, 1)
  expect(second).not.toBe(first)
  expect(takeSceneSeed(second, 'e1', 2)?.title).toBe('Newer')
  expect(takeSceneSeed(first, 'e1', 2)?.title).toBe('Vinyl Night')
})

it('forgets what expired when anything is next stored, so an unused seed does not pile up', () => {
  const stale = putSceneSeed(SEED, 0)
  putSceneSeed(SEED, SEED_TTL_MS + 5)
  expect(takeSceneSeed(stale, 'e1', SEED_TTL_MS + 6)).toBeNull()
})

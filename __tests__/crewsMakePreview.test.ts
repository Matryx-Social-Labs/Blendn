/**
 * The crew emblem is random, with Shuffle at Make, then fixed (owner, 2026-11-12, SCRUM-1053). The app picks the seed and
 * sends it; the server takes `^[0-9a-f]{16}$` (else 400), so the look on Make is the look the crew keeps.
 * Negative control: sending no `emblemSeed` from `createCrewBody` fails the second test.
 */
import { EMBLEM_SEED, createCrewBody, newEmblemSeed } from '../lib/crews'

const form = { name: 'Saturday Lot', bio: '', tags: [], openToSolo: false, inviteUserIds: ['u1'] }
const consent = { consented: true, keepMeAnonymous: false }

describe('Shuffle on Make a crew', () => {
  it('draws 16 lowercase hex, the shape the server takes, and a new one each time', () => {
    const drawn = Array.from({ length: 500 }, () => newEmblemSeed())
    for (const s of drawn) expect(s).toMatch(EMBLEM_SEED)
    expect(new Set(drawn).size).toBe(500)
    expect(newEmblemSeed(() => 0)).toBe('0000000000000000')
    expect(newEmblemSeed(() => 0.999999)).toBe('ffffffffffffffff')
  })

  it('sends the seed it showed, and nothing the server would refuse', () => {
    expect(createCrewBody({ ...form, emblemSeed: '00ff00ff00ff00ff' }, consent)).toEqual(expect.objectContaining({ emblemSeed: '00ff00ff00ff00ff' }))
    // A seed that is not the server's shape (an old build's `preview-…`) is left for the server to draw.
    expect(createCrewBody({ ...form, emblemSeed: 'preview-abc' }, consent)).not.toHaveProperty('emblemSeed')
    expect(createCrewBody(form, consent)).not.toHaveProperty('emblemSeed')
  })
})

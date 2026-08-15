import { avatarStack, pseudonymAvatar } from '../lib/pseudonymAvatar'

/*
 * A face-shaped thing that is not a face.
 *
 * The property under test is what this exists for: **nothing here is derived
 * from a photograph or from anything stable across events**. A blurred face
 * would have satisfied the design and reintroduced the leak `#229` closed —
 * blurring in the app still ships the original, and blurring on the server
 * still carries skin tone, hair and build.
 *
 * So the tests below are mostly about what the output must *not* depend on.
 */

describe('pseudonymAvatar', () => {
  it('is stable for the same pseudonym', () => {
    // The same person must look the same across the roster, the stack and the
    // room — recognising somebody you have seen is the whole product.
    expect(pseudonymAvatar('Cosmic Panda')).toEqual(pseudonymAvatar('Cosmic Panda'))
  })

  it('differs between pseudonyms', () => {
    const a = pseudonymAvatar('Cosmic Panda')
    const b = pseudonymAvatar('Velvet Heron')
    expect(a.colors).not.toEqual(b.colors)
  })

  it('takes its initial from the pseudonym, never a real name', () => {
    // "C" for Cosmic Panda. A real initial beside a pseudonym would be a
    // half-reveal nobody consented to, and it narrows a room fast.
    expect(pseudonymAvatar('Cosmic Panda').initial).toBe('C')
  })

  it('produces something for an empty seed rather than throwing', () => {
    /*
     * A real state, not a defensive flourish: the roster renders before the
     * pseudonyms resolve, and a crash or a blank hole there is worse than a
     * neutral disc.
     */
    const a = pseudonymAvatar('')
    expect(a.initial).toBe('A')
    expect(a.colors).toHaveLength(2)
    expect(pseudonymAvatar('   ')).toEqual(a)
  })

  it('never returns the accent', () => {
    // The accent means "live" or "selected" everywhere else in the app. An
    // avatar wearing it would read as a state rather than as a person.
    const seeds = ['Cosmic Panda', 'Velvet Heron', 'Amber Fox', 'Quiet Lynx', 'Iron Wren']
    for (const s of seeds) {
      for (const c of pseudonymAvatar(s).colors) {
        expect(c.toUpperCase()).not.toBe('#FF906D')
        expect(c.toUpperCase()).not.toBe('#FF6D8D')
      }
    }
  })

  it('spreads across the palette rather than collapsing onto one entry', () => {
    // A hash that returned the same bucket for everything would pass every test
    // above and make every person in the room the same colour.
    const seeds = Array.from({ length: 40 }, (_, i) => `Pseudonym ${i}`)
    const distinct = new Set(seeds.map((s) => pseudonymAvatar(s).colors[0]))
    expect(distinct.size).toBeGreaterThan(3)
  })
})

describe('avatarStack', () => {
  it('draws the cap and puts the rest in the pill', () => {
    expect(avatarStack(124)).toEqual({ shown: 3, remainder: 121 })
  })

  it('has no pill when everybody fits', () => {
    expect(avatarStack(2)).toEqual({ shown: 2, remainder: 0 })
    expect(avatarStack(3)).toEqual({ shown: 3, remainder: 0 })
  })

  it('never renders a negative remainder', () => {
    // `total - max` on a two-person event is "+-1", which is the kind of thing
    // that ships because nobody seeds a small event.
    expect(avatarStack(1).remainder).toBe(0)
    expect(avatarStack(0)).toEqual({ shown: 0, remainder: 0 })
  })

  it('survives the numbers an API can actually send', () => {
    expect(avatarStack(Number.NaN)).toEqual({ shown: 0, remainder: 0 })
    expect(avatarStack(-5)).toEqual({ shown: 0, remainder: 0 })
    expect(avatarStack(2.7)).toEqual({ shown: 2, remainder: 0 })
  })
})

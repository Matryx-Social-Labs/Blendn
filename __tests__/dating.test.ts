import {
  GENDERS,
  MAX_ORIENTATIONS,
  ORIENTATIONS,
  needsInterestedInPicker,
  orientationDisabled,
  orientationImpliesInterest,
  toggleOrientation,
  type Gender,
  type Orientation,
} from '../lib/dating'

/**
 * The client half of one decision: ask, or do not ask.
 *
 * The server derives and stores `interested_in`; this only decides whether the
 * about-you screen shows the direct picker. Getting it wrong in one direction
 * shows a question that was not needed. Getting it wrong in the other leaves
 * somebody with **no dating tag on any card and no idea why**, which is a
 * feature quietly doing nothing — the worse failure, and the one these pin.
 */

describe('orientationImpliesInterest', () => {
  it('is true for the pairs whose meaning is settled', () => {
    expect(orientationImpliesInterest('woman', 'straight')).toBe(true)
    expect(orientationImpliesInterest('man', 'gay')).toBe(true)
    expect(orientationImpliesInterest('woman', 'lesbian')).toBe(true)
    expect(orientationImpliesInterest('man', 'bisexual')).toBe(true)
  })

  it('is false when the label does not compose with the gender', () => {
    // "Straight" is defined against a binary a non-binary person is not in.
    expect(orientationImpliesInterest('non_binary', 'straight')).toBe(false)
    expect(orientationImpliesInterest('non_binary', 'gay')).toBe(false)
  })

  it('carries bisexual over to non-binary, because that one does compose', () => {
    expect(orientationImpliesInterest('non_binary', 'bisexual')).toBe(true)
  })

  it('is false for identities that are not target sets', () => {
    expect(orientationImpliesInterest('woman', 'pansexual')).toBe(false)
    expect(orientationImpliesInterest('man', 'queer')).toBe(false)
  })

  it('is false for prefer_not_to_say on either side', () => {
    // Someone may want the label on their profile without it implying anything
    // about who they want to meet.
    expect(orientationImpliesInterest('woman', 'prefer_not_to_say')).toBe(false)
    expect(orientationImpliesInterest('prefer_not_to_say', 'straight')).toBe(false)
  })

  it('treats asexual as answered rather than ambiguous', () => {
    // Asking somebody who has just said they are asexual to pick who they want
    // to date would be a strange thing to do. The server stores an empty set.
    expect(orientationImpliesInterest('woman', 'asexual')).toBe(true)
  })

  it('is false while either half is missing', () => {
    expect(orientationImpliesInterest(null, 'straight')).toBe(false)
    expect(orientationImpliesInterest('woman', null)).toBe(false)
  })

  it('returns a boolean for every declared combination', () => {
    // Guards against a label being added and falling through into undefined,
    // which would read as "do not ask" and silently drop the tag.
    for (const g of GENDERS) {
      for (const o of ORIENTATIONS) {
        expect(typeof orientationImpliesInterest(g as Gender, o as Orientation)).toBe('boolean')
      }
    }
  })
})

describe('needsInterestedInPicker', () => {
  it('never asks somebody who did not tick dating', () => {
    // The whole reason gender is gated behind the dating chip: a networking
    // user is never asked their gender. Less friction, and less data held about
    // people who had no reason to give it.
    expect(needsInterestedInPicker('non_binary', ['queer'], ['networking'])).toBe(false)
    expect(needsInterestedInPicker(null, [], ['friendship', 'just_here'])).toBe(false)
  })

  it('asks when dating is ticked and the pair is ambiguous', () => {
    expect(needsInterestedInPicker('non_binary', ['straight'], ['dating'])).toBe(true)
    expect(needsInterestedInPicker('woman', ['pansexual'], ['dating', 'networking'])).toBe(true)
  })

  it('does not ask when dating is ticked and the pair is clear', () => {
    expect(needsInterestedInPicker('woman', ['straight'], ['dating'])).toBe(false)
  })

  it('asks when dating is ticked and nothing has been chosen yet', () => {
    // Mid-form, before either dropdown is touched. Showing the picker early is
    // the harmless direction; hiding it is how the tag goes missing.
    expect(needsInterestedInPicker(null, [], ['dating'])).toBe(true)
  })

  it('asks when any one of several labels is ambiguous', () => {
    /*
     * All, not any — the same rule the server applies.
     *
     * `deriveInterestedIn` returns null if a single label is one it cannot
     * read, so asking only when *every* label is unreadable would skip the
     * picker on exactly the sets the server is about to leave underived. The
     * person then has no dating tag on any card and nothing on screen saying
     * why, which is the failure this file exists to prevent.
     */
    expect(needsInterestedInPicker('woman', ['straight', 'queer'], ['dating'])).toBe(true)
    expect(needsInterestedInPicker('woman', ['bisexual', 'lesbian'], ['dating'])).toBe(false)
  })
})

describe('toggleOrientation', () => {
  it('adds and removes', () => {
    expect(toggleOrientation([], 'queer')).toEqual(['queer'])
    expect(toggleOrientation(['queer'], 'queer')).toEqual([])
  })

  it('stops at three', () => {
    const full: Orientation[] = ['queer', 'bisexual', 'asexual']
    expect(toggleOrientation(full, 'pansexual')).toEqual(full)
    expect(orientationDisabled(full, 'pansexual')).toBe(true)
  })

  it('still lets you deselect from a full set', () => {
    // A cap that can trap somebody is worse than no cap: with nothing removable
    // the only way out of three wrong answers is to reinstall.
    const full: Orientation[] = ['queer', 'bisexual', 'asexual']
    expect(toggleOrientation(full, 'bisexual')).toEqual(['queer', 'asexual'])
    expect(orientationDisabled(full, 'bisexual')).toBe(false)
  })

  it('makes prefer_not_to_say exclusive in both directions', () => {
    // Declining to answer is not a fourth thing you are, so the pair is two
    // contradictory statements — the same rule `intentsAreCoherent` applies to
    // `just_here` on the server.
    expect(toggleOrientation(['queer', 'bisexual'], 'prefer_not_to_say')).toEqual([
      'prefer_not_to_say',
    ])
    expect(toggleOrientation(['prefer_not_to_say'], 'gay')).toEqual(['gay'])
  })

  it('never dims prefer_not_to_say', () => {
    // It replaces the set rather than joining it, so the cap does not apply —
    // and somebody at three labels who changes their mind about answering at
    // all must not be locked out of saying so.
    const full: Orientation[] = ['queer', 'bisexual', 'asexual']
    expect(orientationDisabled(full, 'prefer_not_to_say')).toBe(false)
    expect(toggleOrientation(full, 'prefer_not_to_say')).toEqual(['prefer_not_to_say'])
  })

  it('produces nothing the server would reject', () => {
    /*
     * The point of these two living in `lib/` rather than in a screen: two
     * screens write this field, and a cap enforced in one of them is a 400 from
     * the other. Every state reachable by tapping has to be a legal payload.
     */
    let current: Orientation[] = []
    for (const o of [...ORIENTATIONS, ...ORIENTATIONS]) {
      if (!orientationDisabled(current, o)) current = toggleOrientation(current, o)
      expect(current.length).toBeLessThanOrEqual(MAX_ORIENTATIONS)
      expect(new Set(current).size).toBe(current.length)
      if (current.includes('prefer_not_to_say')) expect(current).toHaveLength(1)
    }
  })
})

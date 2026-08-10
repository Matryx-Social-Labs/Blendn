import {
  GENDERS,
  ORIENTATIONS,
  needsInterestedInPicker,
  orientationImpliesInterest,
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
    expect(needsInterestedInPicker('non_binary', 'queer', ['networking'])).toBe(false)
    expect(needsInterestedInPicker(null, null, ['friendship', 'just_here'])).toBe(false)
  })

  it('asks when dating is ticked and the pair is ambiguous', () => {
    expect(needsInterestedInPicker('non_binary', 'straight', ['dating'])).toBe(true)
    expect(needsInterestedInPicker('woman', 'pansexual', ['dating', 'networking'])).toBe(true)
  })

  it('does not ask when dating is ticked and the pair is clear', () => {
    expect(needsInterestedInPicker('woman', 'straight', ['dating'])).toBe(false)
  })

  it('asks when dating is ticked and nothing has been chosen yet', () => {
    // Mid-form, before either dropdown is touched. Showing the picker early is
    // the harmless direction; hiding it is how the tag goes missing.
    expect(needsInterestedInPicker(null, null, ['dating'])).toBe(true)
  })
})

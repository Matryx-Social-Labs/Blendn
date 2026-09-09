/*
 * The three conditions on the warning, and the two states of the banner.
 *
 * Worth testing because the failure modes are asymmetric. A warning that fires
 * too often trains people to dismiss it, which costs nothing the first time and
 * everything on the day it matters. A warning that fires too rarely means
 * somebody's name and face were in a room they did not picture.
 */

import {
  PUBLIC_CHECKIN_WARNING,
  bannerText,
  roomVisibility,
  shouldWarnBeforePublicCheckIn,
} from '../lib/roomVisibility'

describe('roomVisibility', () => {
  it('maps the server flag to a state', () => {
    expect(roomVisibility(true)).toBe('named')
    expect(roomVisibility(false)).toBe('anonymous')
  })
})

describe('bannerText', () => {
  it('only ever describes you, never anyone else', () => {
    /*
     * Carried here when `revealChipLabel` was deleted — it had no caller, and
     * `bannerText` is what the room actually renders, so the rule had to move
     * with the responsibility rather than be deleted alongside the dead code.
     *
     * `PLACEHOLDER_SCREENS.md`: showing who else has revealed "turns a personal
     * choice into a count and makes the last holdout visible". The copy is
     * first-person by construction, in both states.
     */
    for (const title of [
      bannerText('named').title,
      bannerText('anonymous').title,
      bannerText('anonymous', 'Cosmic Panda').title,
    ]) {
      expect(title).not.toMatch(/\b\d+\s+(people|others|revealed)\b/i)
      expect(title).toMatch(/^(You|People here)/)
    }
  })

  it('names the pseudonym when anonymous', () => {
    // The person can see their pseudonym on their own messages; the banner has
    // to obviously be talking about the same thing.
    expect(bannerText('anonymous', 'Cosmic Panda').title).toContain('Cosmic Panda')
  })

  it('still says something when the pseudonym has not arrived', () => {
    // The roster is a network call and the banner renders before it lands.
    // "You're anonymous in this room" is true with or without the name.
    const text = bannerText('anonymous', null)
    expect(text.title).toContain('anonymous')
    expect(text.title).not.toContain('null')
  })

  it('says what is visible when named, not just that you are named', () => {
    // "You are visible" leaves someone to guess what that means. Naming the
    // name and the photo is the whole point.
    const text = bannerText('named')
    expect(text.title).toContain('name')
    expect(text.title).toContain('photo')
  })

  it('offers the opposite state as the action, both ways', () => {
    // A banner that only reports is a banner people learn to ignore. The way
    // out has to be in the thing that tells you where you are.
    expect(bannerText('named').action).toMatch(/anonymous/i)
    expect(bannerText('anonymous').action).toMatch(/show/i)
  })
})

describe('shouldWarnBeforePublicCheckIn', () => {
  const base = { revealByDefault: true, hasSeenWarning: false, canReveal: true }

  it('warns on the first public check-in', () => {
    expect(shouldWarnBeforePublicCheckIn(base)).toBe(true)
  })

  it('does not warn someone entering anonymously', () => {
    // Nothing is being exposed, and a dialog on the safe path is how people
    // learn to dismiss dialogs without reading them.
    expect(shouldWarnBeforePublicCheckIn({ ...base, revealByDefault: false })).toBe(false)
  })

  it('warns once, not every time', () => {
    // The banner carries the message from then on, and it does it better —
    // continuously, in the room, rather than once at the door.
    expect(shouldWarnBeforePublicCheckIn({ ...base, hasSeenWarning: true })).toBe(false)
  })

  it('does not warn when there is nothing to reveal', () => {
    /*
     * No name and no photo means revealing shows *nothing* — the card is
     * byte-for-byte what it was. Warning about an exposure that cannot happen
     * is the same class of mistake as `lib/reveal.ts` was written to avoid.
     */
    expect(shouldWarnBeforePublicCheckIn({ ...base, canReveal: false })).toBe(false)
  })
})

describe('the warning copy', () => {
  it('names both things that become visible', () => {
    expect(PUBLIC_CHECKIN_WARNING.title).toContain('name')
    expect(PUBLIC_CHECKIN_WARNING.title).toContain('photo')
  })

  it('says the scope is this room, not everywhere', () => {
    // Someone who thinks it is a global switch will either refuse it or be
    // surprised later, and both are worse than a longer sentence.
    expect(PUBLIC_CHECKIN_WARNING.body).toMatch(/this room/i)
  })

  it('offers staying anonymous as a real choice, not a dismissal', () => {
    // "Cancel" reads as "go back"; "Stay anonymous" reads as a decision. On a
    // consent dialog the difference is whether the safe option looks like one.
    expect(PUBLIC_CHECKIN_WARNING.cancel).toMatch(/anonymous/i)
  })
})

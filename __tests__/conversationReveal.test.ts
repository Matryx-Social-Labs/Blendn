import {
  BLUR_WIDTH,
  leaveConfirmation,
  revealConfirmation,
  revealView,
  type ConversationRevealState,
} from '../lib/conversationReveal'

/*
 * The copy around identity, which is the part that fails quietly.
 *
 * A wrong string here does not throw. It tells somebody they are anonymous
 * when they are not, offers to reveal to a person who already saw their card,
 * or implies that unmatching takes a face back. Each of those is worse than a
 * crash, because the person acts on it.
 */

const state = (over: Partial<ConversationRevealState> = {}): ConversationRevealState => ({
  displayName: 'Wandering Kestrel',
  youRevealed: false,
  theyRevealed: false,
  revealRequested: false,
  pseudonymous: true,
  ...over,
})

describe('revealView (Flow 5 DM #01–#05)', () => {
  it('shows nothing on a conversation that was never pseudonymous', () => {
    // An accepted message request has shown real names since it existed.
    expect(revealView(state({ pseudonymous: false }))).toEqual({ bar: null, line: null, nudge: null })
  })

  it('both anonymous: Show them and Ask them, and the eye-off line', () => {
    expect(revealView(state())).toEqual({ bar: 'none', line: { seen: false, text: 'You’re both anonymous here' }, nudge: null })
  })

  it('once you ask, the Asked state — never a declined one', () => {
    expect(revealView(state(), true)).toEqual({ bar: 'asked', line: { seen: false, text: 'You’re both anonymous here · asked' }, nudge: null })
  })

  it('surfaces that they asked, without making it a demand', () => {
    const v = revealView(state({ revealRequested: true }))
    expect(v.nudge).toBe('Wandering Kestrel asked to know who you are')
    expect(v.nudge).not.toMatch(/must|need|waiting|\d/i)
  })

  it('they revealed, you have not: Show them, and their side seen', () => {
    expect(revealView(state({ theyRevealed: true })).bar).toBe('theyOnly')
    expect(revealView(state({ theyRevealed: true })).line?.text).toBe('You can see their name. They can’t see yours.')
  })

  it('you revealed, they have not: no button, they decide', () => {
    const v = revealView(state({ youRevealed: true, revealRequested: true }))
    expect(v.bar).toBe('youOnly')
    expect(v.line?.text).toBe('They can see your name. You can’t see theirs yet.')
    // Nothing left for you to answer.
    expect(v.nudge).toBeNull()
  })

  it('both revealed: the bar goes for good and the line says so', () => {
    expect(revealView(state({ youRevealed: true, theyRevealed: true }))).toEqual({
      bar: null,
      line: { seen: true, text: 'You can both see each other' },
      nudge: null,
    })
  })
})

describe('revealConfirmation', () => {
  it('states plainly that it cannot be undone, before the tap', () => {
    /*
     * The load-bearing sentence. A control that reads like a toggle implies it
     * can be toggled back, and nothing can unsee a name and a face. The server
     * has no path back to false, so the copy has to carry the whole warning.
     */
    const c = revealConfirmation('Wandering Kestrel')
    expect(c.body.toLowerCase()).toContain('can’t be undone')
    expect(c.title).toContain('Wandering Kestrel')
  })

  it('names what is actually shown', () => {
    // "Reveal" is abstract. Name and photos is what happens.
    expect(revealConfirmation('X').body).toMatch(/name and photos/)
  })

  it('offers blocking as the real remedy rather than pretending to undo', () => {
    expect(revealConfirmation('X').body.toLowerCase()).toContain('block')
  })
})

describe('leaveConfirmation', () => {
  it('is honest after a reveal — they already know', () => {
    /*
     * The app can close the channel and nothing else. A sheet implying
     * otherwise sells a protection it cannot provide, to somebody who may be
     * choosing between this and going to the police.
     */
    const c = leaveConfirmation('Priya Raman', true)
    expect(c.body).toContain("already know")
    expect(c.body.toLowerCase()).toContain("doesn't undo that")
  })

  it('says the softer true thing before a reveal', () => {
    const c = leaveConfirmation('Wandering Kestrel', false)
    expect(c.body).toContain('never saw your name')
    expect(c.body).not.toContain('already know')
  })

  it('does not claim they never saw your name on an accepted request', () => {
    /*
     * Driven on iOS: a conversation from an accepted message request — where
     * the request itself showed them the name and photo — offered "Unmatch
     * Rohan Desai? … They never saw your name." Two things wrong: the verb,
     * and the claim.
     */
    const c = leaveConfirmation('Rohan Desai', true, false)
    expect(c.title).toBe('End the conversation with Rohan Desai?')
    expect(c.body).toContain('already know')
    expect(c.body).not.toContain('unmatching')
  })

  it('always says it closes for both of you', () => {
    // A one-sided hide would leave them writing into a conversation you left.
    for (const revealed of [true, false]) {
      expect(leaveConfirmation('X', revealed).body).toContain('both of you')
    }
  })

  it('never promises anything is taken back', () => {
    for (const revealed of [true, false]) {
      const body = leaveConfirmation('X', revealed).body.toLowerCase()
      expect(body).not.toMatch(/erase|delete your|forget you|remove your name/)
    }
  })
})

describe('the blur derivative is small enough to be a blur', () => {
  it('is tiny — the size IS the anonymity', () => {
    /*
     * 40px scaled to a card is the blur. There is no filter to defeat because
     * the detail is not in the file.
     *
     * The alternative was `blurRadius` on the real image, which is the version
     * that has already shipped as a bug here: the real URL reaches the device,
     * so a proxy or a cache dump undoes it. `MatchScreen.tsx` still carries the
     * comment "the anonymity was one tap deep".
     */
    expect(BLUR_WIDTH).toBeGreaterThan(0)
    expect(BLUR_WIDTH).toBeLessThanOrEqual(64)
  })
})

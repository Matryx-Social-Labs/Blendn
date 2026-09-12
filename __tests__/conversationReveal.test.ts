import {
  BLUR_WIDTH,
  leaveConfirmation,
  revealAction,
  revealConfirmation,
  revealSubtitle,
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

describe('revealAction', () => {
  it('offers nothing on a conversation that was never pseudonymous', () => {
    // An accepted message request has shown real names since it existed.
    // "Reveal" there would be a control that does nothing.
    expect(revealAction(state({ pseudonymous: false }))).toEqual({ kind: 'none' })
  })

  it('offers to reveal while you are anonymous', () => {
    const a = revealAction(state())
    expect(a.kind).toBe('reveal')
  })

  it('surfaces that they asked, without making it a demand', () => {
    /*
     * Being asked is the only signal the other person can send, so hiding it
     * would waste it. But asking twice writes the same flag -- there is no
     * count to show, nothing to escalate, and nothing to feel nagged by.
     */
    const a = revealAction(state({ revealRequested: true }))
    if (a.kind !== 'reveal') throw new Error('expected reveal')
    expect(a.nudge).toContain('Wandering Kestrel')
    expect(a.nudge?.toLowerCase()).not.toMatch(/again|reminder|\d+ times|waiting/)
  })

  it('offers to ask only once you have revealed and they have not', () => {
    const a = revealAction(state({ youRevealed: true }))
    expect(a.kind).toBe('ask')
    if (a.kind === 'ask') expect(a.label).toContain('Wandering Kestrel')
  })

  it('never offers to ask somebody who has already revealed', () => {
    // The server refuses this with a 400. Offering it would be a button whose
    // only outcome is an error.
    const a = revealAction(state({ youRevealed: true, theyRevealed: true }))
    expect(a.kind).toBe('done')
  })

  it('offers exactly one control in every state', () => {
    /*
     * A screen showing both "Reveal" and "Ask them to reveal" makes the person
     * work out which one applies to them. The type makes that impossible; this
     * pins it against every combination.
     */
    for (const youRevealed of [true, false]) {
      for (const theyRevealed of [true, false]) {
        for (const revealRequested of [true, false]) {
          const a = revealAction(state({ youRevealed, theyRevealed, revealRequested }))
          expect(['reveal', 'ask', 'done']).toContain(a.kind)
        }
      }
    }
  })

  it('still offers to reveal even when they already have', () => {
    // The asymmetric case: they were public in the room, so their side started
    // revealed. Yours is still yours to give.
    const a = revealAction(state({ theyRevealed: true }))
    expect(a.kind).toBe('reveal')
  })
})

describe('revealSubtitle', () => {
  it('says nothing when there is nothing to say', () => {
    expect(revealSubtitle(state({ pseudonymous: false }))).toBeNull()
    expect(revealSubtitle(state({ youRevealed: true, theyRevealed: true }))).toBeNull()
  })

  it('describes both halves without judging either', () => {
    // Never "they have not revealed yet", which frames waiting as a failing.
    const one = revealSubtitle(state({ youRevealed: true }))
    const other = revealSubtitle(state({ theyRevealed: true }))
    expect(one).toBeTruthy()
    expect(other).toBeTruthy()
    expect(one).not.toBe(other)
    for (const s of [one, other]) {
      expect(s?.toLowerCase()).not.toMatch(/refus|declin|won't|hasn't bothered/)
    }
  })

  it('says you are both anonymous when you are', () => {
    expect(revealSubtitle(state())).toBe("You're both anonymous here")
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
    expect(c.body.toLowerCase()).toContain("can't be undone")
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

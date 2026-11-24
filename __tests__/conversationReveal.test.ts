import {
  BLUR_WIDTH,
  leaveConfirmation,
  revealView,
  type ConversationRevealState,
  revealPanelKey,
  ANON_LINE_MAX,
  REVEAL_LINE_MAX,
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

describe('revealView: Swap names (identity model, task 17 a, advisor pick A)', () => {
  /*
   * The server's fields, under the identity model (admin #1001): `youRevealed` = you tapped Swap names; `theyRevealed` = BOTH
   * tapped (a one-sided tap never makes it true); `revealRequested` = they tapped and you have not.
   */
  it('neither tapped: Swap names', () => {
    expect(revealView(state())).toEqual({ bar: 'none', line: { seen: false, text: 'Both anonymous' } })
  })

  it('you tapped: waiting, with Cancel; nothing shows yet', () => {
    expect(revealView(state({ youRevealed: true }))).toEqual({ bar: 'mine', line: { seen: false, text: 'Waiting for them' } })
  })

  it('they tapped: their ask leads, with Swap names', () => {
    expect(revealView(state({ revealRequested: true }))).toEqual({ bar: 'theirs', line: { seen: false, text: 'Wants to swap' } })
  })

  it('both tapped: the strip folds, unless the server offers Add friend', () => {
    const both = state({ youRevealed: true, theyRevealed: true })
    expect(revealView(both)).toEqual({ bar: null, line: { seen: true, text: 'Names swapped' } })
    expect(revealView(both, true).bar).toBe('both')
  })

  it('`theyRevealed` alone is both (the server sends it only once both tapped)', () => {
    expect(revealView(state({ theyRevealed: true })).bar).toBeNull()
    expect(revealView(state({ theyRevealed: true })).line?.seen).toBe(true)
  })

  it('an offer changes nothing before you have both tapped, or on a conversation that was never pseudonymous', () => {
    expect(revealView(state({ youRevealed: true }), true).bar).toBe('mine')
    expect(revealView(state({ revealRequested: true }), true).bar).toBe('theirs')
    expect(revealView(state({ pseudonymous: false }), true)).toEqual({ bar: null, line: null })
  })

  it('a stale revealRequested after your own tap reads as yours: you are waiting, not asked', () => {
    expect(revealView(state({ youRevealed: true, revealRequested: true })).bar).toBe('mine')
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
    expect(c.body.toLowerCase()).toContain("doesn’t undo that")
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

describe('the reveal panel’s key (what a fold is remembered against)', () => {
  it('is the state, and null with no panel', () => {
    expect(revealPanelKey(null)).toBeNull()
    expect(revealPanelKey({ bar: null })).toBeNull()
    expect(revealPanelKey({ bar: 'none' })).toBe('none')
  })

  it('changes with the state, so a fold does not outlive what it folded (their tap brings the strip back)', () => {
    expect(revealPanelKey({ bar: 'none' })).not.toBe(revealPanelKey({ bar: 'theirs' }))
    expect(revealPanelKey({ bar: 'mine' })).not.toBe(revealPanelKey({ bar: 'none' }))
  })
})

// TG-17 (C25): the header's line truncated beside the face. Negative control: the old sentences (up to 49) fail.
it('every header line fits the header: short, each side said once', () => {
  const base = { pseudonymous: true, youRevealed: false, theyRevealed: false, revealRequested: false, displayName: 'Plover' }
  const lines = [
    revealView({ ...base }),
    revealView({ ...base, youRevealed: true }),
    revealView({ ...base, revealRequested: true }),
    revealView({ ...base, youRevealed: true, theyRevealed: true }),
  ].map((v) => v.line?.text ?? '')
  for (const line of lines) expect(line.length).toBeLessThanOrEqual(REVEAL_LINE_MAX)
})

// rc9 D2: at 1.3 text on 360 dp the header's line had room for 16 characters and read "You’re both ano…". Negative control: the old
// "You’re both anonymous here" (26) fails.
it('the anonymous header line fits one line at 1.3 text on a 360 dp phone', () => {
  const base = { pseudonymous: true, youRevealed: false, theyRevealed: false, revealRequested: false, displayName: 'Plover' }
  const lead = revealView({ ...base }).line?.text ?? ''
  expect(lead.length).toBeLessThanOrEqual(ANON_LINE_MAX)
  // Every state sits in the same slot. Task 17 Android drive at 1.3 / 360: "They want to swap" (17) read "They want to swa…".
  for (const over of [{ youRevealed: true }, { revealRequested: true }, { youRevealed: true, theyRevealed: true }]) {
    expect((revealView({ ...base, ...over }).line?.text ?? '').length).toBeLessThanOrEqual(ANON_LINE_MAX)
  }
})

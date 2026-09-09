import { revealPromptText, revealReadiness } from '../lib/reveal'

/**
 * The three pieces of copy that decide whether anonymity is legible.
 *
 * All three fail quietly if they are wrong: a gate that lets you turn on a
 * switch which shows nothing, a chip that says the opposite of your state, or a
 * prompt that implies something already happened. None of those throw.
 */

describe('revealReadiness', () => {
  it('is ready with both a name and a photo', () => {
    expect(revealReadiness({ name: 'Priya Raman', photos: ['https://x/p.jpg'] })).toEqual({
      ok: true,
      missing: '',
    })
  })

  it('names the photo when only that is missing', () => {
    expect(revealReadiness({ name: 'Priya Raman', photos: [] })).toEqual({
      ok: false,
      missing: 'a photo',
    })
  })

  it('names the name when only that is missing', () => {
    expect(revealReadiness({ name: null, photos: ['https://x/p.jpg'] })).toEqual({
      ok: false,
      missing: 'a name',
    })
  })

  it('names both when there is nothing at all', () => {
    /*
     * The case that matters. Revealing shows exactly a name and a photo — with
     * neither, the switch turns on and the card is byte-for-byte identical, so
     * the person concludes the feature is broken rather than that their profile
     * is empty.
     */
    expect(revealReadiness({ name: null, photos: null })).toEqual({
      ok: false,
      missing: 'a name and a photo',
    })
    expect(revealReadiness({})).toEqual({ ok: false, missing: 'a name and a photo' })
  })

  it('does not count whitespace as a name', () => {
    expect(revealReadiness({ name: '   ', photos: ['https://x/p.jpg'] }).ok).toBe(false)
  })

  it('phrases `missing` to drop into the sentence that uses it', () => {
    // "Add a photo to your profile first" — the copy and the value have to be
    // written together or one of them reads wrong.
    for (const input of [{ name: 'A' }, { photos: ['p'] }, {}]) {
      const { missing } = revealReadiness(input)
      expect(`Add ${missing} to your profile first`).toMatch(/^Add a [a-z ]+ to your profile first$/)
    }
  })
})

describe('revealPromptText', () => {
  it('asks about this room, using the name they usually use', () => {
    expect(revealPromptText('Sagar')).toBe('You usually join as Sagar. Do that here?')
  })

  it('still asks when there is no name to quote', () => {
    expect(revealPromptText(null)).toBe('You usually show your name. Do that here?')
  })

  it('is phrased as a question, never as something already done', () => {
    /*
     * The server no longer applies `reveal_by_default` at check-in, so nothing
     * has happened yet. Copy like "you've been revealed — undo?" would describe
     * a state that does not exist, and imply a window in which they were named
     * before answering. There is no such window.
     */
    for (const text of [revealPromptText('Sagar'), revealPromptText(null)]) {
      expect(text).toMatch(/\?$/)
      expect(text.toLowerCase()).not.toMatch(/undo|revert|turn off|you are now|you've been/)
    }
  })
})

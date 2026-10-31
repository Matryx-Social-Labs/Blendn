import { CHECK_OUT_LABEL, OPEN_ROOM_LABEL, SWITCH_LABEL, checkOutCaption, switchCaption } from '../lib/switchCopy'

const LONG = 'The Very Long Name Of A Rooftop Sundowner With Vinyl, Small Plates And A Surprise Guest Set At The Old Mill'

describe('the words around switching rooms and checking out (SCRUM-970)', () => {
  it('names the event you leave, and says you are checked in here', () => {
    expect(SWITCH_LABEL).toBe('Hold to switch')
    expect(switchCaption('Vinyl Night')).toBe('Leaves Vinyl Night and checks you in here.')
  })

  it('names the event you check out of', () => {
    expect(CHECK_OUT_LABEL).toBe('Hold to check out')
    expect(OPEN_ROOM_LABEL).toBe('Open the room')
    expect(checkOutCaption('Vinyl Night')).toBe('Checks you out of Vinyl Night.')
  })

  it('falls back when the name is missing, empty or blank', () => {
    for (const none of [null, undefined, '', '   ']) {
      expect(switchCaption(none)).toBe('Leaves your other event and checks you in here.')
      expect(checkOutCaption(none)).toBe('Checks you out of this event.')
    }
  })

  it('keeps a long name whole, trimmed, so it wraps rather than being cut', () => {
    expect(switchCaption(`  ${LONG} `)).toBe(`Leaves ${LONG} and checks you in here.`)
    expect(checkOutCaption(LONG)).toBe(`Checks you out of ${LONG}.`)
  })

  it('never doubles a word', () => {
    for (const name of ['Vinyl Night', LONG, null]) {
      for (const line of [switchCaption(name), checkOutCaption(name)]) expect(line).not.toMatch(/\b(\w+)\s+\1\b/i)
    }
  })
})

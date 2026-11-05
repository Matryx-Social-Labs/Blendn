/*
 * The email sheet's geometry (lib/emailSheet.ts, Flow 1c option C, owner's pick 2026-11-04): the board
 * (mockups/redesign-2026-11/email-sign-in, element-boxes.json) as numbers, so the build can be held to it.
 * - The sheet is its content and its dock, capped under the back button; it sits on the keyboard.
 * - The scroll shows the focused field and, if it moves at all, moves the switch fully out of view (the SE frame).
 * - The landing hands over in sequence: its tagline and Dock are gone by 40% and 50%, the form comes in after 35%.
 * - The lockup fades over the 24 pt the sheet's edge takes to reach it.
 */
import {
  SHEET,
  handover,
  inContent,
  lockupShown,
  revealOffset,
  sheetCeiling,
  sheetHeight,
} from '../lib/emailSheet'

/** The board's iPhone frame: 390 × 844, top inset 52 so the back button's row starts at 54, bottom inset 34. */
const PHONE = { windowHeight: 844, insetTop: 52, insetBottom: 34 }

describe('sheetHeight', () => {
  // The board's sign-in at rest: the stack is 298 pt (title 30, 24, switch 48, 16, email 80, 16, password 84), the dock
  // the 56 pt primary; the sheet starts at 408.
  it('at rest: 24 over the stack, 16 to the primary, 8 over the home indicator — the board’s 436 pt sheet', () => {
    const h = sheetHeight({ content: 298, dock: 56, lift: 0, ...PHONE })
    expect(h).toBe(436)
    expect(PHONE.windowHeight - h).toBe(408)
  })

  it('on the keyboard: 8 under the dock, nothing for the home indicator', () => {
    expect(sheetHeight({ content: 298, dock: 56, lift: 336, ...PHONE })).toBe(24 + 298 + 16 + 56 + 8)
  })

  it('never taller than the room under the back button (its row, 44, and 8)', () => {
    const h = sheetHeight({ content: 900, dock: 56, lift: 336, ...PHONE })
    expect(h).toBe(844 - 336 - sheetCeiling(PHONE.insetTop, false))
    expect(sheetCeiling(52, false)).toBe(52 + 2 + 44 + 8)
    expect(sheetCeiling(24, true)).toBe(24 + 2 + 48 + 8)
  })

  it('the constants are the board’s', () => {
    expect(SHEET).toEqual({ padTop: 24, gap: 16, foot: 8, headroom: 8, titleGap: 24, fade: 24 })
  })
})

describe('revealOffset', () => {
  const field = (top: number, bottom: number) => ({ top, bottom })

  it('a field that shows already: no scroll', () => {
    expect(revealOffset(field(100, 180), 300, 400, 64)).toBe(0)
  })

  it('a field under the fold comes up just far enough, but at least past the switch (the SE frame)', () => {
    // Visible 260, the password ends at 280: 20 would cut the switch (64 = 48 + 16), so the switch goes.
    expect(revealOffset(field(184, 280), 260, 400, 64)).toBe(64)
  })

  it('never further than the content goes', () => {
    expect(revealOffset(field(400, 520), 200, 450, 64)).toBe(250)
  })

  it('never past the field’s own top: a field right under the switch keeps its label', () => {
    expect(revealOffset(field(40, 140), 120, 400, 64)).toBe(20)
  })
})

describe('handover (the landing → the form, one progress 0 → 1)', () => {
  it('starts as the landing and ends as the form', () => {
    expect(handover(0)).toEqual({ tagline: 1, dock: 1, form: 0, actions: 0 })
    expect(handover(1)).toEqual({ tagline: 0, dock: 0, form: 1, actions: 1 })
  })

  it('in sequence, never mixed: the Dock is gone by 40%, the form only comes in after 35%', () => {
    expect(handover(0.4).dock).toBe(0)
    expect(handover(0.35).form).toBe(0)
    expect(handover(0.45).actions).toBe(0)
    expect(handover(0.5).tagline).toBe(0)
  })
})

describe('lockupShown', () => {
  it('whole until the sheet’s edge is 24 pt from it, gone once the edge reaches it', () => {
    expect(lockupShown(408, 288)).toBe(1)
    expect(lockupShown(300, 288)).toBeCloseTo(0.5, 5)
    expect(lockupShown(288, 288)).toBe(0)
    expect(lockupShown(120, 288)).toBe(0)
  })
})

describe('inContent (a field’s box in the scroll’s own coordinates)', () => {
  // A SheetItem reports its box in the stack under the title; the scroll counts from its own top: the 24 pt pad, then
  // the title's block while it shows. A drive found the sign-up form scrolled by exactly that block (54 pt) without it.
  it('adds the pad, and the title’s block while the title shows', () => {
    expect(inContent({ top: 64, bottom: 144 }, 0)).toEqual({ top: 88, bottom: 168 })
    expect(inContent({ top: 64, bottom: 144 }, 54)).toEqual({ top: 142, bottom: 222 })
  })
})

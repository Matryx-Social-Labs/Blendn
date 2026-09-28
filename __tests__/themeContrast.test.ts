/**
 * Every text colour clears WCAG AA (4.5:1) on every surface text sits on.
 *
 * `textTertiary` was `#787574` — 3.3:1 on `surface`, where most helper text
 * lives — and `textPlaceholder` was `#6B7280`, 3.2:1 on the input fill. Both
 * read as fine on a bright monitor and were unreadable in a dark bar on a
 * phone at half brightness.
 */
import { EMBER, MAX_FONT_SCALE, OPACITY, TYPE } from '../lib/theme'

const luminance = (hex: string) => {
  const n = parseInt(hex.slice(1, 7), 16)
  const [r, g, b] = [16, 8, 0].map((shift) => {
    const c = ((n >> shift) & 255) / 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

const SURFACES = { bg: EMBER.bg, surfaceSunken: EMBER.surfaceSunken, surface: EMBER.surface }
const TEXT = {
  textPrimary: EMBER.textPrimary,
  textSecondary: EMBER.textSecondary,
  textTertiary: EMBER.textTertiary,
  textPlaceholder: EMBER.textPlaceholder,
}

describe('text contrast', () => {
  for (const [textName, fg] of Object.entries(TEXT)) {
    for (const [surfaceName, bg] of Object.entries(SURFACES)) {
      it(`${textName} is AA on ${surfaceName}`, () => {
        expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5)
      })
    }
  }

  it('keeps the text hierarchy: tertiary is dimmer than secondary', () => {
    expect(contrast(EMBER.textTertiary, EMBER.bg)).toBeLessThan(contrast(EMBER.textSecondary, EMBER.bg))
  })

  it('keeps dark text on the accent, which white would fail', () => {
    expect(contrast(EMBER.onGradient, EMBER.accent)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(EMBER.textPrimary, EMBER.accent)).toBeLessThan(4.5)
  })
})

describe('scales', () => {
  it('caps text in fixed boxes tighter than reading text', () => {
    expect(MAX_FONT_SCALE.button).toBeLessThan(MAX_FONT_SCALE.body)
    expect(MAX_FONT_SCALE.display).toBeLessThanOrEqual(MAX_FONT_SCALE.button)
    expect(Object.keys(MAX_FONT_SCALE).sort()).toEqual(Object.keys(TYPE).sort())
  })

  it('has one pressed and one disabled opacity', () => {
    expect(OPACITY).toEqual({ pressed: 0.85, disabled: 0.45 })
  })
})

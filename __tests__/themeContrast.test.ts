/**
 * Every text colour clears WCAG AA (4.5:1) on every surface text sits on, and
 * every icon and state indicator 3:1 (DESIGN-BRIEF §4, §14).
 *
 * The redesign's pairs come first. The old system's rule — dark text on a flat
 * orange accent, `onGradient #5B1600` — is retired (§4.3): the redesign puts
 * white on `GRADIENT.fill`, and ink on flat `brandOrange`, because white on
 * `#F05423` is 3.50:1. `EMBER` stays tested at the end while screens still
 * draw with it.
 */
import { BLUR, GLASS, SOLID, type MaterialRole } from '../components/ui/Material'
import { COLOR, GRADIENT, MAX_FONT_SCALE as DESIGN_MAX_FONT_SCALE, TYPE as DESIGN_TYPE } from '../lib/design/tokens'
import { EMBER, MAX_FONT_SCALE, TYPE } from '../lib/theme'

jest.mock('expo-glass-effect', () => ({}))
jest.mock('expo-blur', () => ({}))
jest.mock('expo-linear-gradient', () => ({}))

type Rgb = [number, number, number]

const rgb = (hex: string): Rgb => {
  const n = parseInt(hex.slice(1, 7), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

const luminance = ([r, g, b]: Rgb) => {
  const [lr, lg, lb] = [r, g, b].map((v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb
}

const ratio = (a: Rgb, b: Rgb) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

const contrast = (a: string, b: string) => ratio(rgb(a), rgb(b))

/** `rgba(13,12,12,0.80)` or `#242121` painted over an opaque colour. */
const over = (paint: string, under: Rgb): Rgb => {
  const m = /^rgba\((\d+),(\d+),(\d+),([\d.]+)\)$/.exec(paint)
  if (!m) return rgb(paint)
  const a = Number(m[4])
  return [1, 2, 3].map((i) => Number(m[i]) * a + under[i - 1] * (1 - a)) as Rgb
}

const SURFACES = { ink: COLOR.ink, surfaceSunken: COLOR.surfaceSunken, surface: COLOR.surface }
const TEXT = {
  textPrimary: COLOR.textPrimary,
  textSecondary: COLOR.textSecondary,
  textTertiary: COLOR.textTertiary,
  textPlaceholder: COLOR.textPlaceholder,
  // Brand colours as text: only these two, only on these three surfaces (§4.2).
  brandOrange: COLOR.brandOrange,
  brandVioletText: COLOR.brandVioletText,
  destructive: COLOR.destructive,
}

describe('text on the surfaces', () => {
  for (const [textName, fg] of Object.entries(TEXT)) {
    for (const [surfaceName, bg] of Object.entries(SURFACES)) {
      it(`${textName} is AA on ${surfaceName}`, () => {
        expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5)
      })
    }
  }

  it('keeps the text hierarchy: tertiary is dimmer than secondary', () => {
    expect(contrast(COLOR.textTertiary, COLOR.ink)).toBeLessThan(contrast(COLOR.textSecondary, COLOR.ink))
  })

  it('never sets brandRose as text: it fails on surface', () => {
    expect(contrast(COLOR.brandRose, COLOR.surface)).toBeLessThan(4.5)
  })

  it('shows the live dot at 3:1 or more on the page', () => {
    expect(contrast(COLOR.live, COLOR.ink)).toBeGreaterThanOrEqual(3)
  })
})

describe('text on colour', () => {
  it('puts white text on gradientFill: AA at every stop', () => {
    expect(Math.min(...GRADIENT.fill.colors.map((stop) => contrast(COLOR.textOnGradient, stop)))).toBeGreaterThanOrEqual(4.5)
  })

  it('puts ink, not white, on flat orange: white on #F05423 fails AA', () => {
    expect(contrast(COLOR.textOnOrangeFlat, COLOR.brandOrange)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(COLOR.textPrimary, COLOR.brandOrange)).toBeLessThan(4.5)
    // …which is why gradientBrand, which starts on it, never carries text.
    expect(contrast(COLOR.textPrimary, GRADIENT.brand.colors[0])).toBeLessThan(4.5)
  })

  it('puts white on the filled destructive button, and ink on a selection', () => {
    expect(contrast(COLOR.textPrimary, COLOR.destructiveFill)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(COLOR.textOnSelection, COLOR.selectionFill)).toBeGreaterThanOrEqual(4.5)
  })
})

/*
 * §5.2 rule 5: every glyph on glass passes at the clearest setting, measured
 * over a white and a mid-grey backdrop — 4.5:1 for text, 3:1 for icons. This
 * reads the tints `<Material>` actually draws, per role and tier.
 */
describe('on <Material>, over the worst backdrop', () => {
  const BACKDROPS: Record<string, Rgb> = { white: [255, 255, 255], grey: [128, 128, 128] }
  /** What sits on each role, and the ratio it needs. */
  const ON: Record<MaterialRole, [string, number]> = {
    bar: [COLOR.textSecondary, 4.5], // unselected tab labels
    sheet: [COLOR.textSecondary, 4.5],
    toast: [COLOR.textPrimary, 4.5],
    control: [COLOR.textPrimary, 3], // a white icon
    media: [COLOR.textPrimary, 3],
  }
  /** Clear glass over a photo always has a ≥45% black dim under it (§5.2 rule 3). */
  const MEDIA_DIM = 'rgba(0,0,0,0.45)'

  const tiers: [string, (role: MaterialRole) => string][] = [
    ['glass', (role) => GLASS[role]],
    ['blur', (role) => BLUR[role].tint],
    ['solid', (role) => SOLID[role]],
  ]
  for (const [tier, paint] of tiers) {
    for (const role of Object.keys(ON) as MaterialRole[]) {
      for (const [name, backdrop] of Object.entries(BACKDROPS)) {
        it(`${role} on ${tier}, over ${name}`, () => {
          const [fg, min] = ON[role]
          const under = role === 'media' ? over(MEDIA_DIM, backdrop) : backdrop
          expect(ratio(rgb(fg), over(paint(role), under))).toBeGreaterThanOrEqual(min)
        })
      }
    }
  }
})

describe('type scales', () => {
  it('caps text in fixed boxes tighter than reading text', () => {
    expect(MAX_FONT_SCALE.button).toBeLessThan(MAX_FONT_SCALE.body)
    expect(MAX_FONT_SCALE.display).toBeLessThanOrEqual(MAX_FONT_SCALE.button)
    expect(Object.keys(MAX_FONT_SCALE).sort()).toEqual(Object.keys(TYPE).sort())
  })

  it('gives every redesign role a cap, and keeps the 12pt floor', () => {
    expect(Object.keys(DESIGN_MAX_FONT_SCALE).sort()).toEqual(Object.keys(DESIGN_TYPE).sort())
    expect(DESIGN_MAX_FONT_SCALE.caption).toBeLessThan(DESIGN_MAX_FONT_SCALE.body)
    expect(Math.min(...Object.values(DESIGN_TYPE).map((r) => r.fontSize))).toBeGreaterThanOrEqual(12)
  })
})

/** The palette today's screens still draw with, until each is redesigned. */
describe('EMBER, while it ships', () => {
  const EMBER_SURFACES = { bg: EMBER.bg, surfaceSunken: EMBER.surfaceSunken, surface: EMBER.surface }
  const EMBER_TEXT = {
    textPrimary: EMBER.textPrimary,
    textSecondary: EMBER.textSecondary,
    textTertiary: EMBER.textTertiary,
    textPlaceholder: EMBER.textPlaceholder,
  }
  for (const [textName, fg] of Object.entries(EMBER_TEXT)) {
    for (const [surfaceName, bg] of Object.entries(EMBER_SURFACES)) {
      it(`${textName} is AA on ${surfaceName}`, () => {
        expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5)
      })
    }
  }

  it('keeps dark text on its flat accent, which white would fail', () => {
    expect(contrast(EMBER.onGradient, EMBER.accent)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(EMBER.textPrimary, EMBER.accent)).toBeLessThan(4.5)
  })
})

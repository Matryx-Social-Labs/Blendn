/**
 * Every text colour clears WCAG AA (4.5:1) on every surface text sits on, and
 * every icon and state indicator 3:1 (DESIGN-BRIEF §4, §14).
 *
 * The redesign's pairs come first. The old system's rule — dark text on a flat
 * orange accent, `onGradient #5B1600` — is retired (§4.3): the redesign puts
 * white on `GRADIENT.fill`, and ink on flat `brandOrange`, because white on
 * `#F05423` is 3.50:1. `EMBER` itself was deleted (`retiredDesign.test.ts`).
 */
import { PRESSED_WASH, SELECTION } from '../components/ds/shared'
import { BLUR, GLASS, SOLID, type MaterialRole } from '../components/ui/Material'
import { COLOR, GRADIENT, MAX_FONT_SCALE as DESIGN_MAX_FONT_SCALE, TYPE as DESIGN_TYPE } from '../lib/design/tokens'

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
 * Every label the design system draws on a lit fill clears AA (4.5:1) in every state it can be read in (colour and buttons
 * re-audit, 2026-11-17, "fix now"). A token moved without its pair fails here: `selectionVioletGlyph #B58FD0` was 4.37:1 as the
 * selected violet chip's count on `#433247`.
 */
describe('every DS label on its fill, in every state', () => {
  const ANDROID_PRESS = (fill: string) => over(PRESSED_WASH.android, rgb(fill))
  for (const [hue, sel] of Object.entries(SELECTION)) {
    it(`${hue}: the lit glyph tone as text (a selected chip's count) is AA on its fill`, () => {
      expect(contrast(sel.glyph, sel.fill)).toBeGreaterThanOrEqual(4.5)
    })
    it(`${hue}: the lit glyph tone as text is AA on the page`, () => {
      expect(contrast(sel.glyph, COLOR.ink)).toBeGreaterThanOrEqual(4.5)
    })
    it(`${hue}: white, the label while pressed, is AA on the flare and on the fill under Android's press wash`, () => {
      expect(contrast(COLOR.textPrimary, sel.flare)).toBeGreaterThanOrEqual(4.5)
      expect(ratio(rgb(COLOR.textPrimary), ANDROID_PRESS(sel.fill))).toBeGreaterThanOrEqual(4.5)
    })
  }

  // Control: the reason the count turns white while pressed. The glyph tone is not AA under the press, on any hue.
  it('the glyph tone under the press is below AA, so a pressed count must not keep it', () => {
    for (const sel of Object.values(SELECTION)) {
      expect(contrast(sel.glyph, sel.flare)).toBeLessThan(4.5)
      expect(ratio(rgb(sel.glyph), ANDROID_PRESS(sel.fill))).toBeLessThan(4.5)
    }
  })
})

/*
 * §5.2 rule 5: every glyph on glass passes at the clearest setting, measured
 * over a white and a mid-grey backdrop — 4.5:1 for text, 3:1 for icons. This
 * reads the tints `<Material>` actually draws, per role and tier.
 */
/*
 * Buttons board C, "Lit gradient" (owner 2026-11-17, SCRUM-1063): every pair the positive look draws, per gradient stop, in
 * every state. A stop moved without its pair fails here. The board's own table: white on the tint 9.26–9.52, pressed
 * 7.26–7.54, the rim 4.06–4.31 on ink and 3.32–3.53 on a surface card.
 */
describe('the positive look (lit), every stop, every state', () => {
  const stops = (g: readonly string[]) => g.map(rgb)
  const white = rgb(COLOR.textPrimary)

  it.each(GRADIENT.lit.colors)('rest: a white label is AA on the tint stop %s', (stop) => {
    expect(contrast(COLOR.textPrimary, stop)).toBeGreaterThanOrEqual(9)
  })

  it.each(GRADIENT.litPressed.colors)('pressed (the pour): a white label is AA on the stop %s', (stop) => {
    expect(contrast(COLOR.textPrimary, stop)).toBeGreaterThanOrEqual(7)
  })

  it('pressed on Android (the ripple wash over the tint): still AA at every stop', () => {
    for (const stop of stops(GRADIENT.lit.colors)) expect(ratio(white, over(PRESSED_WASH.android, stop))).toBeGreaterThanOrEqual(4.5)
  })

  it('the 1.5 pt gradient rim carries the boundary (SC 1.4.11): 3:1 on the page and on a surface card, every stop', () => {
    for (const stop of GRADIENT.fill.colors) {
      expect(contrast(stop, COLOR.ink)).toBeGreaterThanOrEqual(4)
      expect(contrast(stop, COLOR.surface)).toBeGreaterThanOrEqual(3)
    }
  })

  it('advisory, measured so nobody drops the rim: the tint alone is under 3:1 on the page', () => {
    for (const stop of GRADIENT.lit.colors) expect(contrast(stop, COLOR.ink)).toBeLessThan(3)
  })

  it('the tiers survive grayscale: hero › positive › neutral by luminance (board: L* 50 / 30 / 13)', () => {
    const mean = (g: readonly string[]) => g.reduce((sum, c) => sum + luminance(rgb(c)), 0) / g.length
    expect(mean(GRADIENT.fill.colors)).toBeGreaterThan(mean(GRADIENT.lit.colors))
    expect(mean(GRADIENT.lit.colors)).toBeGreaterThan(luminance(rgb(COLOR.surface)))
    expect(mean(GRADIENT.litPressed.colors)).toBeGreaterThan(mean(GRADIENT.lit.colors))
  })

  it('disabled (45% over the page, exempt by SC 1.4.3) stays legible: white over the dimmed tint ≥ 4:1', () => {
    const dim = (c: Rgb, under: Rgb): Rgb => c.map((v, i) => v * 0.45 + under[i] * 0.55) as Rgb
    for (const stop of stops(GRADIENT.lit.colors)) {
      const ground = dim(stop, rgb(COLOR.ink))
      expect(ratio(dim(white, ground), ground)).toBeGreaterThanOrEqual(4)
    }
  })

  it('a hold out of reach (inactive, exempt): the secondary label on the tint is ≥ 4.2:1 (board `.hold.far`)', () => {
    for (const stop of GRADIENT.lit.colors) expect(contrast(COLOR.textSecondary, stop)).toBeGreaterThanOrEqual(4.2)
  })

  it('the neutral hold (check-out): white on its surface, on its pour, and the pour is visible against the ground', () => {
    const ground = rgb(COLOR.surface)
    const pour = over(COLOR.hairlineStrong, ground)
    expect(ratio(white, ground)).toBeGreaterThanOrEqual(4.5)
    expect(ratio(white, pour)).toBeGreaterThanOrEqual(4.5)
    expect(ratio(pour, ground)).toBeGreaterThan(1.5)
  })

  it('control: the measure itself fails a pair that should (white on flat brand orange)', () => {
    expect(contrast(COLOR.textPrimary, COLOR.brandOrange)).toBeLessThan(4.5)
  })
})

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
  it('gives every redesign role a cap, and keeps the 12pt floor', () => {
    expect(Object.keys(DESIGN_MAX_FONT_SCALE).sort()).toEqual(Object.keys(DESIGN_TYPE).sort())
    expect(DESIGN_MAX_FONT_SCALE.caption).toBeLessThan(DESIGN_MAX_FONT_SCALE.body)
    expect(Math.min(...Object.values(DESIGN_TYPE).map((r) => r.fontSize))).toBeGreaterThanOrEqual(12)
  })

  it('has the boards’ 15/22 secondary line (lede, owner 2026-11-06): reading text, AA in the secondary ink on every surface', () => {
    expect(DESIGN_TYPE.lede).toEqual({ fontFamily: 'Satoshi_400Regular', fontSize: 15, lineHeight: 22, letterSpacing: 0 })
    expect(DESIGN_MAX_FONT_SCALE.lede).toBe(DESIGN_MAX_FONT_SCALE.body)
    for (const bg of [COLOR.ink, COLOR.surfaceSunken, COLOR.surface, COLOR.surfaceRaised]) {
      expect(contrast(COLOR.textSecondary, bg)).toBeGreaterThanOrEqual(4.5)
    }
  })
})

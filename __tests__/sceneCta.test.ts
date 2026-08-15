import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * The Scene's CTA — the numbers, and the two structural rules behind them.
 *
 * All of this is source-text assertion rather than rendering, for the same
 * reason `pulseNav.test.ts` is: these are *style constants*, every value here
 * typechecks and lints identically to every wrong value, and the only thing
 * that catches a wrong one is a screenshot somebody remembers to take.
 */
const SRC = () =>
  readFileSync(join(__dirname, '..', 'components', 'scene', 'SceneSections.tsx'), 'utf8')

const PREVIEW = () =>
  readFileSync(join(__dirname, '..', 'app', '(tabs)', '__preview-scene.tsx'), 'utf8')

describe('the CTA pays for its own height', () => {
  it('SCENE_CTA_HEIGHT is the sum of what is actually in the pill', () => {
    const src = SRC()
    const height = Number(/SCENE_CTA_HEIGHT = (\d+)/.exec(src)?.[1])
    const icon = Number(/SCENE_CTA_ICON = (\d+)/.exec(src)?.[1])
    const padding = Number(/paddingVertical: (\d+),/.exec(src.slice(src.indexOf('ctaFill:')))?.[1])
    const lineHeight = Number(
      /lineHeight: (\d+),/.exec(src.slice(src.indexOf('ctaLabel:')))?.[1]
    )

    // 1pt border, padding, the taller of icon and line, padding, 1pt border.
    const border = 2
    expect(border + padding * 2 + Math.max(icon, lineHeight)).toBe(height)

    /*
     * And the icon must not be the thing setting the height. The frame's 40pt
     * icon is exactly why the pill was 74 — a 40 beside a 28pt line drives the
     * box on its own, and 74 of pill on top of a ~88pt tab bar was a fifth of
     * the screen given over to chrome.
     */
    expect(icon).toBeLessThanOrEqual(lineHeight)
  })

  it('the ScrollView reserves the pill plus its gutter', () => {
    // Anything pinned over a scroll has to pay for its own height in the
    // content inset, or it silently eats the end of the page.
    expect(PREVIEW()).toContain('SCENE_CTA_HEIGHT')
  })
})

describe('the pill is glass, and the glass is the pill', () => {
  it('has no opaque fill left', () => {
    /*
     * `rgba(15,14,14,0.9)` was the fill. At 90% the pill is paint, and the
     * photograph it docks over may as well not be there.
     */
    expect(SRC()).not.toContain("backgroundColor: 'rgba(15,14,14,0.9)'")
  })

  it('clips its blur, or the blur is a rectangle behind a round pill', () => {
    const fill = SRC().slice(SRC().indexOf('ctaFill:'))
    expect(fill).toContain("overflow: 'hidden'")
    expect(fill).toContain('borderRadius: 9999')
  })

  it('has no gradient rectangle behind a translucent fill', () => {
    /*
     * The regression this exists for: the pill used to be a `LinearGradient`
     * with `padding: 1` wrapping an opaque child — a standard fake gradient
     * border. It works *only* while the child is opaque. Make the child glass
     * and the whole gradient rectangle shows through, which rendered a
     * brown-to-purple wash inside the pill instead of a stroke around it.
     *
     * RN has no gradient `borderColor` and no masking without a new dependency,
     * so the ring is a hairline of white and the warmth lives in the tint.
     */
    expect(SRC()).not.toContain('ctaBorder')
    const fill = SRC().slice(SRC().indexOf('ctaFill:'))
    expect(fill).toContain('borderColor:')
  })

  it('tints warm, because neutral glass on this screen is a black slab', () => {
    /*
     * The pill docks over the bottom of a dark map on a `#0F0E0E` page. There
     * is nothing luminous behind it to refract, so a neutral frost renders as
     * near-black and reads as a *disabled* control in the primary position.
     * `#4B2F26` is `gradientFrom` at 25% over the page background.
     */
    expect(SRC()).toContain("'rgba(75,47,38,0.74)'")
  })

  it('is content-width, not screen-width', () => {
    // A full-bleed pill is a bar, and a bar is chrome. The node is named
    // "Floating CTA"; padded to its label it can actually float.
    const fill = SRC().slice(SRC().indexOf('ctaFill:'))
    expect(fill).toContain('paddingHorizontal: 32')
    expect(PREVIEW()).toContain("alignItems: 'center'")
  })

  it('the dock carries no second sheet of glass', () => {
    /*
     * The dock had a full-bleed blur and scrim. That was right while the pill
     * was opaque — the band was the pill's bleed. With a glass pill it is a
     * second full-width sheet behind the first one, which is a toolbar, not
     * glassmorphism.
     */
    const preview = PREVIEW()
    expect(preview).not.toContain('ctaDockFill')
    expect(preview).not.toContain('ctaDockHairline')
    expect(preview).not.toContain('BlurView')
  })

  it('does not clip the pill shadow', () => {
    // `overflow: 'hidden'` on the dock existed to clip a blur the dock no
    // longer has; leaving it on cuts the shadow that separates a floating
    // control from the page.
    const preview = PREVIEW()
    const dock = preview.slice(preview.indexOf('ctaDock: {'))
    const block = dock.slice(0, dock.indexOf('},'))
    // Declarations only — the block's comment explains why the property is
    // absent, so a plain substring match would find the word and fail.
    const declared = block
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => !l.startsWith('*') && !l.startsWith('/*') && !l.startsWith('//'))
    expect(declared.some((l) => l.startsWith('overflow:'))).toBe(false)
  })
})

describe('what the button says', () => {
  it('says Blend in, and only ended disables', () => {
    const src = SRC()
    expect(src).toContain("join: 'Blend in'")
    expect(src).toContain('"You\'re in"')
    /*
     * `docs/CHECKIN.md:39` — "Check-in does not refuse at capacity". A full
     * event still takes people; `max_capacity` is a number the organiser
     * watches, not a door the app keeps. A capacity-disabled CTA would block an
     * interaction the product explicitly allows.
     */
    expect(src).toContain("const disabled = state === 'ended'")
  })
})

/**
 * The *shipping* screen, which is a different component from `SceneCTA`.
 *
 * `EventDetailScreen` does not use `SceneCTA` and should not: its action is a
 * three-stage morph (check in → checked in → go to chat) with loading states
 * and a secondary check-out/RSVP button beside it. `SceneCTA` is the simpler
 * control. Replacing one with the other would lose behaviour.
 *
 * What they do have to agree on is the *language*, and nothing enforced that —
 * the harness said "Blend in" while the real button said "Blend'n", and the
 * only way to notice was to sign in and look.
 */
const DETAIL = () =>
  readFileSync(
    join(__dirname, '..', 'components', 'screens', 'EventDetailScreen.tsx'),
    'utf8'
  )

describe('the shipping event screen agrees with the CTA it is not', () => {
  it('labels the check-in action with the verb, not the brand', () => {
    const detail = DETAIL()
    expect(detail).toContain('Blend in')
    /*
     * The noun as a *label* is the regression. `Blend&apos;n` is how it was
     * written — the brand, which names the product rather than the action, on
     * the one control the screen has. The other two stages of the same morph
     * are verbs ("Go to Chat"), so the noun was the odd one out.
     *
     * The brand still appears in this repo as a brand: the wordmark in
     * `PulseTopBar`, "Blend'n Match", "Start Blend'n". Only this button was
     * using it to mean "do something".
     */
    const labels = detail.slice(detail.indexOf('actionLabelStack'))
    expect(labels.slice(0, labels.indexOf('</View>'))).not.toContain('Blend&apos;n')
  })

  it('the action row is not a second sheet of glass', () => {
    /*
     * `tabBar` was a translucent tray with its own fill, hairline and radius,
     * holding two buttons that each already carry a BlurView, a sheen and a
     * border. Two nested sheets read as a smudge with two parallel outlines,
     * neither of which is the thing you press. Same defect the Scene's dock
     * had, found in the same pass.
     */
    const detail = DETAIL()
    const bar = detail.slice(detail.indexOf('tabBar: {'))
    const block = bar.slice(0, bar.indexOf('},'))
    const declared = block
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => !l.startsWith('*') && !l.startsWith('/*') && !l.startsWith('//'))
    for (const prop of ['backgroundColor:', 'borderWidth:', 'borderColor:', 'overflow:']) {
      expect(declared.some((l) => l.startsWith(prop))).toBe(false)
    }
    // The buttons keep their own glass — this is a collapse, not a strip.
    expect(detail).toContain('glassButtonBlur')
    expect(detail).toContain('glassButtonSheen')
  })

  it('keeps the behaviour SceneCTA does not have', () => {
    /*
     * Guard against a later "simplification" that swaps this for `SceneCTA` and
     * silently drops the morph, the spinners and the secondary button.
     */
    const detail = DETAIL()
    expect(detail).toContain('Go to Chat')
    expect(detail).toContain('Checked In')
    expect(detail).toContain('Checking in...')
    expect(detail).toContain('secondaryActionButton')
  })
})

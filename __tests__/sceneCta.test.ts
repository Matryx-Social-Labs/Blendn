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
  readFileSync(join(__dirname, '..', 'app', 'preview', 'scene.tsx'), 'utf8')

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

describe('the event screen IS the Scene now, and kept what the CTA lacks', () => {
  /*
   * This block used to guard the gap between the harness and the shipping
   * screen: `app/event/[id].tsx` rendered a hand-built morphing action row
   * while `components/scene/*` was reachable only from `app/preview/scene.tsx`.
   * The gap is closed — the screen renders `SceneCTA` — so these assertions
   * move to the new structure rather than being deleted. Each keeps its intent.
   */
  it('labels the check-in action with the verb, not the brand', () => {
    /*
     * Unchanged rule, new home. `SceneCTA` owns the label now, so the check
     * reads the component instead of the screen — and the brand-as-verb is
     * still what must never come back: `Blend'n` names the product, where the
     * other two states are things you can do.
     */
    const cta = SRC().slice(SRC().indexOf('const CTA_LABEL'))
    const table = cta.slice(0, cta.indexOf('}'))
    expect(table).toContain('Blend in')
    expect(table).not.toContain('Blend&apos;n')
    expect(table).not.toContain("Blend'n")
  })

  it('has one pill and no tray behind it', () => {
    /*
     * The old `tabBar` was a translucent tray with its own fill, hairline and
     * radius, holding buttons that each already carried a BlurView and a sheen
     * — two nested sheets reading as a smudge with two outlines, neither of
     * which is the thing you press.
     *
     * The screen has no action row at all now, which satisfies this by
     * construction; asserting the absence keeps a future rewrite from
     * reintroducing one.
     */
    const detail = DETAIL()
    expect(detail).not.toContain('tabBar: {')
    expect(detail).not.toContain('glassButtonBlur')
  })

  it('keeps the behaviour SceneCTA does not have', () => {
    /*
     * THE test, and it earned its place: the first draft of the render swap
     * moved check out into an overflow tray, two taps behind an ellipsis.
     * Leaving a venue is the most time-sensitive action in the app and it was
     * a visible button before, so that was a downgrade dressed as a
     * simplification — which is exactly what this was written to catch.
     *
     * `SceneCTA` has three states and no secondary control, so anything the
     * old morph carried beside it has to be placed deliberately.
     */
    const detail = DETAIL()
    // Check out: one tap, beside the CTA, only while checked in.
    expect(detail).toContain('secondaryAction')
    expect(detail).toContain('accessibilityLabel="Check out of event"')
    expect(detail).toContain('{isCheckedIn && !isEnded ? (')
    // The in-flight states the morph used to show.
    expect(detail).toContain('checkingOut ? (')
    expect(detail).toContain('checkingIn || checkingOut ? (')
    // RSVP has no home in the frame either, and is reachable rather than gone.
    expect(detail).toContain('handleToggleRsvp')
  })

  it('renders the rebuilt Scene rather than a second implementation of it', () => {
    // The whole point of the swap. If this fails, something has grown a
    // parallel Scene again — which is how the last one went unnoticed.
    const detail = DETAIL()
    for (const c of ['SceneHero', 'SceneCTA', 'SceneGallery', 'SceneLocationCard']) {
      expect(detail).toContain(c)
    }
  })
})

/**
 * The six deltas `docs/SCENE.md` recorded against the frame, and the two
 * accessibility gaps beside them.
 *
 * Every number is from `get_design_context`, not from the render.
 */
const SECTIONS = () => SRC()
const HERO = () =>
  readFileSync(join(__dirname, '..', 'components', 'scene', 'SceneHero.tsx'), 'utf8')
const THEME = () => readFileSync(join(__dirname, '..', 'lib', 'theme.ts'), 'utf8')

describe('the Location card matches 1141:4900', () => {
  it('pads the body 32/32/56, not 32 all round', () => {
    // `1141:4901` is `pt-[32px] px-[32px] pb-[56px]` — the bottom is the gap to
    // the map band, and at 32 the address crowded it.
    expect(SECTIONS()).toContain('paddingBottom: 56')
  })

  it('sets the venue name 16 below the eyebrow', () => {
    // `1141:4904` is `pt-[16px]`; the 8 came from reusing the card's own gap.
    expect(SECTIONS()).toContain('...EMBER_TYPE.cardValue, paddingTop: 16')
  })

  it('draws both lines in Plus Jakarta Regular', () => {
    /*
     * `1141:4903` and `1141:4905` are both `font-normal`, and both were built
     * Bold — because Regular was not loaded, and a `fontFamily` naming an
     * unloaded family renders the system font without throwing or warning.
     */
    const theme = THEME()
    expect(theme).toContain("displayRegular: 'PlusJakartaSans_400Regular'")
    expect(theme).toContain('cardEyebrow')
    expect(theme).toContain('cardValue')
    expect(SECTIONS()).toContain('eyebrow: EMBER_TYPE.cardEyebrow')
  })
})

describe('the amenity tiles match 1141:4917', () => {
  it('are a fixed 126 tall, so the pair cannot go ragged', () => {
    // `grid-rows-[126px]`. Content-sized, the two agreed only while their text
    // wrapped identically — which today's two fixtures happen to do.
    expect(SECTIONS()).toContain('height: 126')
  })

  it('lets each icon take its own size', () => {
    /*
     * `1141:4919` is 18 and `1141:4925` is 20, and both were built at 20. Not a
     * mistake in the design: a tall narrow martini glass and a wide round
     * camera at the same box size do not look the same size.
     */
    expect(SECTIONS()).toContain('iconSize = 20')
    expect(PREVIEW()).toContain('iconSize={18}')
  })
})

describe('the accessibility gaps docs/SCENE.md recorded', () => {
  it('caps dynamic type on the 48pt hero title', () => {
    /*
     * RN **clips** a glyph to its `lineHeight` where CSS lets it overflow. At
     * Accessibility XXXL iOS scales by ~3.1x, which asks for a 149pt glyph
     * inside a 56pt line: two rows of sliced letterforms over a photograph.
     * `numberOfLines` truncates and does not rescue the line box.
     */
    expect(HERO()).toContain('maxFontSizeMultiplier={1.2}')
  })

  it('caps the amenity tiles, which live in a fixed box', () => {
    expect(SECTIONS()).toContain('maxFontSizeMultiplier={1.5}')
  })

  it('gives the hero caption one grouped announcement', () => {
    // Ungrouped it reads as four fragments, two of which are icon-plus-text
    // pairs with stops that announce nothing.
    const hero = HERO()
    expect(hero).toContain('accessibilityRole="header"')
    expect(hero).toContain('[title, dateLabel, timeLabel, scarcity]')
  })

  it('stops the avatar row announcing the creatures', () => {
    /*
     * Unlabelled, a screen reader says "butterfly, turtle, fox" — worse than
     * silence, because it is confidently wrong about what is on screen. The
     * count is the whole message.
     */
    expect(SECTIONS()).toContain('accessibilityLabel={`${count} people interested`}')
  })
})

describe('the attendee discs carry a creature, not a letter', () => {
  it('never draws initial here', () => {
    /*
     * `.initial` is `seed[0]` and the seed is the *event* id, so all three
     * discs showed the same letter — a row reading "T T T". A varied letter
     * would be worse: a letter reads as somebody's initial, and the faces were
     * removed from this stack precisely because a face is identity.
     */
    expect(SECTIONS()).not.toContain('avatarInitial')
    expect(SECTIONS()).toContain('const { colors, character } = pseudonymAvatar')
  })

  it('picks colour and creature from different mixes of the hash', () => {
    // Taking both from `h` correlates them: with 8 hues and 16 creatures every
    // panda would be the same blue, and a row of three would repeat a pairing
    // far more often than chance.
    const lib = readFileSync(join(__dirname, '..', 'lib', 'pseudonymAvatar.ts'), 'utf8')
    expect(lib).toContain('CHARACTERS')
    expect(lib).toContain('h ^ 0x9e3779b9')
  })
})

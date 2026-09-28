import { readFileSync } from 'fs'
import { join } from 'path'

import { CONTROL, ICON, TYPE } from '../lib/theme'

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

/** Any repo file, by path segments. */
const read = (...p: string[]) => readFileSync(join(__dirname, '..', ...p), 'utf8')

const PREVIEW = () =>
  readFileSync(join(__dirname, '..', 'app', 'preview', 'scene.tsx'), 'utf8')

describe('the CTA pays for its own height', () => {
  it('SCENE_CTA_HEIGHT is the sum of what is actually in the pill', () => {
    const src = SRC()
    // The pill is the scale's primary-action height, holding a navigation-size
    // icon beside the button role's own line — all three from the tokens.
    expect(src).toContain('SCENE_CTA_HEIGHT = CONTROL.lg')
    expect(src).toContain('SCENE_CTA_ICON = ICON.lg')
    expect(src).toContain('ctaLabel: { ...TYPE.button }')
    const height = CONTROL.lg
    const icon = ICON.lg
    const lineHeight = TYPE.button.lineHeight
    const padding = Number(/paddingVertical: (\d+),/.exec(src.slice(src.indexOf('ctaFill:')))?.[1])

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

describe('the pill is solid, and nothing glows around it', () => {
  /*
   * It was frosted glass: a BlurView, a warm tint, a lit white hairline and an
   * orange bloom under it. Every effect at once, and it read as generated. The
   * event apps that get this right (Luma, District) use a flat, high-contrast
   * pill with no shadow, blur or gradient, and let contrast lift it.
   */
  const cta = () => {
    const src = SRC()
    return src.slice(src.indexOf('export function SceneCTA'), src.indexOf('export function SceneDetails'))
  }
  const style = (name: string) => {
    const src = SRC()
    const from = src.slice(src.indexOf(`${name}: {`))
    return from.slice(0, from.indexOf('},'))
  }

  it('has no blur, tint or glow left', () => {
    expect(cta()).not.toContain('BlurView')
    expect(SRC()).not.toContain('ctaTint')
    expect(SRC()).not.toContain('ctaGlow')
    expect(SRC()).not.toContain("'rgba(75,47,38,0.74)'")
  })

  it('fills the to-do states with the accent and the done states with a dark surface', () => {
    expect(style('ctaFillLoud')).toContain('backgroundColor: EMBER.accent')
    expect(style('ctaFillQuiet')).toContain('backgroundColor: EMBER.surfaceSunken')
    // Dark text on the accent — white on it fails contrast.
    expect(SRC()).toContain('ctaLabelLoud: { color: EMBER.onGradient }')
  })

  it('keeps a border in both states, so the height never changes between them', () => {
    // SCENE_CTA_HEIGHT counts 1 + 14 + 28 + 14 + 1.
    expect(style('ctaFill')).toContain('borderWidth: 1')
    expect(style('ctaFillLoud')).toContain('borderColor:')
    expect(style('ctaFillQuiet')).toContain('borderColor:')
  })

  it('casts no shadow', () => {
    const fill = style('ctaFill')
    expect(fill).not.toContain('shadow')
    expect(fill).not.toContain('elevation')
  })

  it('is content-width, not screen-width', () => {
    // A full-bleed pill is a bar, and a bar is chrome. The node is named
    // "Floating CTA"; padded to its label it can actually float.
    expect(style('ctaFill')).toContain('paddingHorizontal: SPACE.xxl')
    expect(PREVIEW()).toContain("alignItems: 'center'")
  })

  it('separates from the page with a fade behind the dock, not a glow around the pill', () => {
    const screen = readFileSync(join(__dirname, '..', 'components/screens/EventDetailScreen.tsx'), 'utf8')
    const dock = screen.slice(screen.indexOf('<View style={styles.ctaDock}'))
    expect(dock.slice(0, dock.indexOf('<SceneCTA'))).toContain('colors={[EMBER.bgClear, EMBER.bg]}')
  })

  it('does not pop on saying yes — the label and the fill are the confirmation', () => {
    expect(cta()).not.toContain('withSequence')
  })
})

describe('what the button says', () => {
  it('says Blend in, and no state is a dead end', () => {
    const src = SRC()
    expect(src).toContain("join: 'Blend in'")
    expect(src).toContain('"You\'re in"')
    /*
     * `blendn-admin/docs/CHECKIN.md:39` — "Check-in does not refuse at capacity". A full
     * event still takes people; `max_capacity` is a number the organiser
     * watches, not a door the app keeps. A capacity-disabled CTA would block an
     * interaction the product explicitly allows. And `ended` offers tonight
     * rather than greying out: a finished event is somebody looking for one.
     */
    expect(src).toContain('const disabled = !onPress')
    expect(src).toContain(`ended: "See what's on tonight"`)
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
     * THE test, and it has now caught three separate versions of the same
     * mistake while this screen was rewritten:
     *
     *   1. check out moved into an overflow tray -- two taps behind an
     *      ellipsis, for the most time-sensitive action in the app
     *   2. RSVP put a "..." in the top bar, a control the design never asked
     *      for in the screen's most prominent slot
     *   3. the secondary row deleted, taking check out's only caller with it
     *
     * The settled answer: the CTA is **one slot whose subject changes with the
     * clock**, so there is no second control on this screen at all. RSVP is
     * the CTA before the doors; check in is the CTA after; check out lives in
     * the room the CTA opens.
     */
    const detail = DETAIL()

    // The CTA is time-aware. "Blend in" before the event cannot succeed --
    // check-in requires the event to be running -- so it must not be offered.
    expect(detail).toContain('hasStarted')
    expect(detail).toContain("? (rsvpd ? 'rsvpd' : 'rsvp')")
    expect(detail).toContain('handleToggleRsvp')

    // A thrown RSVP request puts the old status back. The optimistic
    // "You're going" used to survive a timeout with no row behind it —
    // `prevStatus` lived inside the `try`, so the `catch` could not reach it.
    const handler = detail.slice(detail.indexOf('const handleToggleRsvp'), detail.indexOf('}, [id, user, rsvpStatus'))
    expect(handler).toMatch(/const prevStatus = rsvpStatus\s*\n\s*try \{/)
    expect(handler).toMatch(/\} catch \{\s*setRsvpStatus\(prevStatus\)/)

    // No second control, and no overflow in the bar.
    expect(detail).not.toContain('secondaryRow')
    expect(detail).not.toContain('ellipsis-horizontal')

    // The in-flight states the old morph showed.
    /*
     * Only check-in spins now: check out left this screen with the secondary
     * row, so `checkingOut` was a state nothing could ever set.
     */
    expect(detail).toContain('checkingIn ? (')
  })

  it('check out really is where this screen says it moved to', () => {
    /*
     * The Scene stopped carrying check out on the grounds that its CTA opens
     * the room and the room has it. That is only true while the room does --
     * so the claim is asserted rather than trusted, and this fails the day
     * somebody tidies the room's top bar. The room is the Blend'n overlay now,
     * and its Check out goes through `useRoomControls`.
     */
    const room = read('components', 'blendn', 'BlendnScreen.tsx')
    expect(room).toContain('controls.checkOut()')
    expect(room).toContain('Check out')
    expect(read('lib', 'useRoomControls.ts')).toContain('checkOutOf(eventId)')
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

describe('the Location card matches 1141:4900', () => {
  it('pads the body 32/32/56, not 32 all round', () => {
    // `1141:4901` is `pt-[32px] px-[32px] pb-[56px]` — the bottom is the gap to
    // the map band, and at 32 the address crowded it.
    expect(SECTIONS()).toContain('paddingBottom: 56')
  })

  it('sets the venue name 16 below the eyebrow', () => {
    // `1141:4904` is `pt-[16px]`; the 8 came from reusing the card's own gap.
    expect(SECTIONS()).toContain('venue: { ...TYPE.body, paddingTop: SPACE.lg }')
  })

  it('draws both lines from the type scale', () => {
    /*
     * The frame sets both in Plus Jakarta Regular; the design system maps them
     * to `label` and `body` (docs/DESIGN_SYSTEM.md), so the Regular weight is
     * no longer loaded.
     */
    expect(SECTIONS()).toContain('eyebrow: TYPE.label')
    expect(SECTIONS()).toContain('venue: { ...TYPE.body,')
  })
})

describe('the amenity tiles match 1141:4917', () => {
  it('are at least 126 tall, so the pair cannot go ragged or clip', () => {
    // `grid-rows-[126px]`. Content-sized, the two agreed only while their text
    // wrapped identically. A floor, not a fixed height: the row stretches both
    // tiles to the taller one, and large text grows the tile instead of clipping.
    expect(SECTIONS()).toContain('minHeight: 126')
    expect(SECTIONS()).not.toMatch(/\n\s+height: 126/)
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
     * count is the whole message, read with its heading ("Going, 12").
     */
    expect(SECTIONS()).toContain('accessibilityLabel={`${label}, ${count}`}')
    expect(SECTIONS()).toMatch(/style=\{styles\.stack\}\s*\n\s*accessibilityElementsHidden/)
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

describe('the Scene is a full-screen route', () => {
  /*
   * Pinned because it was lost twice — once by shipping the rebuilt screen into
   * the sheet the old one used, and once by a `git reset --hard` that discarded
   * the fix after it had been verified on device.
   *
   * A sheet insets from the top, rounds its corners and leaves the previous
   * screen visible above it. Frame `1141:4853` is a full-bleed artboard whose
   * hero dissolves into the page, and the design deliberately removed a
   * bottom-sheet panel from *inside* this screen — presenting the whole screen
   * as a sheet puts that shape straight back, one level up.
   */
  const layout = () => read('app', '_layout.tsx')

  it('presents /event/[id] as a card, never a modal', () => {
    const src = layout()
    const block = src.slice(src.indexOf('name="event/[id]"'))
    const options = block.slice(0, block.indexOf('/>'))
    expect(options).toContain("presentation: 'card'")
    expect(options).not.toContain("presentation: 'modal'")
  })

  it('does not zero the top inset, which only a sheet needs', () => {
    /*
     * `topInset={0}` is correct inside a sheet — iOS has already cleared the
     * notch, so the shared bar would pad by it twice. On a full-screen route it
     * is the opposite error: the bar rides up under the status bar.
     */
    expect(DETAIL()).not.toContain('topInset={0}')
  })
})

describe('the check-in position request has a deadline', () => {
  it('rejects with E_LOCATION_TIMEOUT rather than spinning for ever', () => {
    /*
     * getCurrentPositionAsync has no timeout option and BestForNavigation
     * waits for a fresh fix; on an emulator with no GPS stream the Blend in
     * button spun for five minutes and the "Location timeout" tray, written
     * for exactly this, could never show.
     */
    // The fix moved to `lib/locationFix.ts`, shared by the event screen and
    // the Blend'n room through `lib/useCheckInFlow.ts`.
    const src = readFileSync(join(__dirname, '..', 'lib', 'locationFix.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
    expect(src).toContain("code: 'E_LOCATION_TIMEOUT'")
    expect(src).toMatch(/export const LOCATION_FIX_TIMEOUT_MS = 1[0-9]_000/)
    expect(src).not.toContain('timeInterval: 12000')
  })
})

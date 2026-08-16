import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * The bar's shape, pinned to the frame it was measured from.
 *
 * Every fact here is one that broke on a device, was fixed, and was worth a
 * screenshot from the user to find. None of them is visible to a typecheck: all
 * four are valid style objects that render fine and simply draw the wrong thing.
 * A render test cannot see them either — `react-test-renderer` 19 returns
 * `null` for a bare `<View><Text/></View>` in this jest-expo setup, so there is
 * no tree to assert against. So this reads the source, which is crude and
 * catches exactly these.
 *
 * Frame `1141:4827`, 390×104.
 */

const read = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8')

/** Comments describe the bugs by name, so they must not satisfy the greps. */
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const NAV = () => stripComments(read('app/(tabs)/_layout.tsx'))
const TOP_BAR = () => stripComments(read('components/pulse/PulseTopBar.tsx'))
const SCREEN = () => stripComments(read('app/(tabs)/events.tsx'))

describe('the overlay header, frame 1141:4819', () => {
  /*
   * The bar the old screen had reserved its own height and sat above a bordered
   * panel. This one occupies nothing: it floats, the feed runs under it, and
   * the only thing keeping "The Pulse" out from behind it is padding on the
   * scroll content. Every fact below is one of the two halves of that.
   */
  it('floats rather than occupying layout', () => {
    const src = TOP_BAR()
    expect(src).toContain("position: 'absolute'")
    expect(src).toContain('top: 0')
  })

  it('carries the frame values, unadjusted', () => {
    const src = TOP_BAR()
    expect(src).toContain('TOP_BAR_HEIGHT = 64')
    expect(src).toContain("backgroundColor: 'rgba(15,14,14,0.8)'")
    expect(src).toContain('intensity={12}')
    expect(src).toContain('paddingHorizontal: 24')
  })

  it('the wordmark is the accent, not white', () => {
    const src = TOP_BAR()
    // Plus Jakarta Bold 16/24, `#FF906D`, letterSpacing -0.8.
    expect(src).toContain('fontFamily: EMBER_FONTS.displayBold')
    expect(src).toContain('letterSpacing: -0.8')
    expect(src).toContain('color: EMBER.accent')
    expect(src).not.toContain("color: '#FFFFFF'")
  })

  it('adds the status bar to the 64 rather than absorbing it', () => {
    /*
     * The frame is a 390pt artboard with no notch. Taking its height literally
     * is what put "The Pulse" underneath the clock on a real device.
     *
     * `topInset ?? insets.top` rather than `insets.top`: a screen presented as
     * a sheet is already below the notch, and `useSafeAreaInsets()` reads the
     * root provider, so it would otherwise pad by an inset that is not there.
     * The Grid did exactly that and drew a black band above its header. Every
     * pushed screen still takes the device inset, which is why this is a
     * defaulted override rather than a required prop.
     */
    expect(TOP_BAR()).toContain('(topInset ?? insets.top) + TOP_BAR_HEIGHT')
  })

  it('owns no control of its own', () => {
    /*
     * The frame draws a hamburger at the left and a bell at the right. The
     * hamburger still opens nothing — there is no drawer — and the bell is now
     * real, but it is passed *in* through `actions` rather than built here.
     *
     * The bar stays a presentational overlay: it knows about layout, blur and
     * the wordmark, and nothing about what its slots do. A control declared
     * inside it would be one The Scene inherits by accident, since The Scene
     * renders this same component.
     */
    const src = TOP_BAR()
    expect(src).not.toContain('Pressable')
    expect(src).not.toContain('TouchableOpacity')
    expect(src).not.toContain('onPress')
  })

  it('carries the bell, now that the bell goes somewhere', () => {
    /*
     * It was left out because "a bell that opens nothing is a dead control in
     * the most-tapped corner of the screen". `GET /notifications` exists
     * (blendn-admin #242), so it is not dead any more.
     */
    expect(SCREEN()).toContain('<PulseTopBar actions={<NotificationBell />} />')
  })

  it('the feed clears it with padding, not with a spacer', () => {
    const src = SCREEN()
    expect(src).toContain('<PulseTopBar')
    expect(src).toContain('paddingTop: insets.top + TOP_BAR_HEIGHT + 32')
  })
})

describe('the stylesheet, frame 1141:4643', () => {
  /** Everything from `const styles = ...` to the end of the file. */
  const SHEET = () => {
    const src = SCREEN()
    return src.slice(src.indexOf('const styles = StyleSheet.create({'))
  }

  it("carries Main's four numbers, unadjusted", () => {
    const src = SCREEN()
    expect(src).toContain('const MAIN_PADDING_HORIZONTAL = 12')
    expect(src).toContain('const MAIN_PADDING_BOTTOM = 128')
    expect(src).toContain('const MAIN_GAP = 48')
    expect(src).toContain('const SECTION_GAP = 24')
    expect(src).toContain('const STACK_GAP = 32')
    // 96 is the fourth, written as `TOP_BAR_HEIGHT + 32` at the render site
    // because the 32 is the part that means anything.
  })

  it('the page is one flat surface', () => {
    const sheet = SHEET()
    expect(sheet).toContain('backgroundColor: EMBER.bg')
    // No panel: the screen used to stack a bar, a bordered elevated sheet and
    // the list, and draw every card on the wrong one of the three.
    expect(sheet).not.toContain('sectionBg')
    expect(sheet).not.toContain('LinearGradient')
  })

  it('the gutter is applied once, on the scroll content', () => {
    const sheet = SHEET()
    const hits = sheet.match(/paddingHorizontal: MAIN_PADDING_HORIZONTAL/g) || []
    expect(hits).toHaveLength(1)
  })

  it('has no key nothing uses', () => {
    // It had 107 keys and 49 callers. The other 58 were two previous layouts,
    // and they were what each restyle landed beside and contradicted.
    const src = SCREEN()
    const sheet = SHEET()
    const declared = [...sheet.matchAll(/^ {2}([A-Za-z][A-Za-z0-9]*): \{/gm)].map((m) => m[1])
    const used = new Set([...src.slice(0, src.length - sheet.length).matchAll(/styles\.([A-Za-z0-9]+)/g)].map((m) => m[1]))
    expect(declared.length).toBeGreaterThan(0)
    expect(declared.filter((k) => !used.has(k))).toEqual([])
    expect([...used].filter((k) => !declared.includes(k))).toEqual([])
  })

  it('never asks for weight with fontWeight', () => {
    /*
     * The one rule in here that is a bug rather than a measurement. Custom
     * fonts on Android ignore `fontWeight` outright and silently render
     * regular, so `fontWeight: '700'` on Manrope is bold on iOS and regular on
     * Android from identical code. The old sheet did it in thirty places and no
     * simulator screenshot would ever have shown it.
     */
    expect(SCREEN()).not.toContain('fontWeight')
  })

  it('is on the shared type scale, with no local one beside it', () => {
    const src = SCREEN()
    expect(src).toContain('EMBER_TYPE')
    expect(src).not.toContain('TYPE_CARD_TITLE_SIZE')
    expect(src).not.toContain('TYPE_BODY_SIZE')
    expect(src).not.toContain('TYPE_META_SIZE')
    expect(src).not.toContain('TYPE_CAPTION_SIZE')
  })

  it('has no trace of the old blue palette', () => {
    // One import of `APP_COLORS` is enough to put a cold hairline around a warm
    // card. These four hexes were all in the sheet a release ago.
    const src = SCREEN()
    expect(src).not.toContain('APP_COLORS')
    expect(src).not.toContain('#007AFF')
    expect(src).not.toContain('#e8f5e8')
    expect(src).not.toContain('#4CAF50')
    expect(src).not.toContain('#fde7ef')
  })
})

describe('the previous designs are gone, not merely uncalled', () => {
  /*
   * Twelve render functions from three layouts lived in this file, six of them
   * with no caller — including, for one release, the *only* one built from the
   * frame. Dead code is not inert here: it is what every restyle landed next
   * to and contradicted. `expo lint` names an orphan, so these greps are the
   * half lint cannot see — that the name is gone rather than newly re-wired.
   */
  it.each([
    'renderInterestedCarousel',
    'renderCarouselWithTitle',
    'renderCarouselFancy',
    'renderInviteHero',
    'renderFeaturedHero',
  ])('%s does not exist', (name) => {
    expect(SCREEN()).not.toContain(name)
  })

  it.each([
    'interestedItems',
    'cityTopItems',
    'bestPartiesItems',
    'soonestWithImage',
  ])('%s does not exist', (name) => {
    expect(SCREEN()).not.toContain(name)
  })

  it('the hero interpolations went with the hero', () => {
    // `sectionLiftY`/`sectionOpacity` stay — the three sections still use them.
    const src = SCREEN()
    expect(src).not.toContain('heroParallaxY')
    expect(src).not.toContain('heroOpacity')
    expect(src).toContain('sectionLiftY')
  })

  it('nothing is fetched that nothing reads', () => {
    // `favoriteEvents` had one reader, `interestedItems`. Left behind, its
    // effect would fire `getUserFavorites` on every events refetch into a
    // state nothing renders.
    const src = SCREEN()
    expect(src).not.toContain('favoriteEvents')
    expect(src).not.toContain('getUserFavorites')
    expect(src).not.toContain('NIGHTLIFE_GROUPS')
  })
})

describe('the bar does not clip the button that overhangs it', () => {
  /*
   * The centre button sits at `y=-16` — sixteen points above the bar's top
   * edge. The rounded surface needs `overflow: 'hidden'` to clip its own 48pt
   * corners, and for one release both lived on the same view, so the surface
   * clipped the button as well as itself.
   */
  it('the laying-out view is not the clipping view', () => {
    const src = NAV()
    const bar = src.slice(src.indexOf('  bar: {'), src.indexOf('  barSurface: {'))
    expect(bar).not.toContain("overflow: 'hidden'")
  })

  it('the surface still clips, or the corners stop being round', () => {
    const src = NAV()
    const surface = src.slice(src.indexOf('  barSurface: {'), src.indexOf('  item: {'))
    expect(surface).toContain("overflow: 'hidden'")
    expect(surface).toContain('borderTopLeftRadius: 48')
    expect(surface).toContain('borderTopRightRadius: 48')
  })
})

describe('the items are sized by their labels', () => {
  /*
   * The frame's five slots are 40.08 / 56.23 / 56 / 52.03 / 22.98 wide with a
   * uniform 26.66 gap — space-between over content-sized children. `flex: 1`
   * gave every label the widest one's box, which is what made the row read as
   * cramped under the centre button.
   */
  it('no item claims an equal share of the row', () => {
    const src = NAV()
    const item = src.slice(src.indexOf('  item: {'), src.indexOf('  itemOn: {'))
    expect(item).not.toContain('flex: 1')
  })

  it('the row distributes by space-between, not space-around', () => {
    expect(NAV()).toContain("justifyContent: 'space-between'")
    expect(NAV()).not.toContain("justifyContent: 'space-around'")
  })
})

describe('the centre is the brand mark', () => {
  it('carries no label', () => {
    // The frame's centre slot is a 56pt circle and nothing else. A fifth word
    // under the mark made the row read as five tabs with one shouting.
    expect(NAV()).not.toContain('centreLabel')
    expect(NAV()).not.toContain('roomButtonLabel')
  })

  it('uses the monogram, in its bold cut, not a glyph', () => {
    /*
     * The bold cut is for *small* sizes only. `monogram-white.png` has strokes
     * at 4.86% of the mark's width — 1.35pt at 32 — against roughly 2pt for
     * every other glyph in this bar. The bold file is the same artwork dilated
     * to 6.40%, which lands at 1.78pt with every counter still open.
     *
     * A genuinely *filled* variant was tried by flood-filling the enclosed
     * regions: it turns the B into a blob. That ask stands with the designer.
     */
    const src = NAV()
    expect(src).toContain('monogram-white-bold.png')
    // Tinted dark-on-warm. The gradient monogram would be orange on orange.
    expect(src).not.toContain('monogram-gradient.png')
    expect(src).toContain('tintColor={BRAND_INK}')
  })

  it('tints the mark with the logo ink, not the on-gradient text token', () => {
    /*
     * `EMBER.onGradient` is `#5B1600` — the colour for *text* on a gradient
     * button. Used on the mark it rendered a muddy maroon at 6.07:1 and made a
     * thin outline logo look smudged.
     *
     * `#1B1931` is sampled from the artwork: both the mono lockup and the full
     * lockup draw the mark in it, byte-identical. 7.69:1 on `gradientFrom`.
     * Pinned because it is a value nobody can re-derive by reading the code —
     * it came from measuring two PNGs.
     */
    expect(NAV()).toContain("const BRAND_INK = '#1B1931'")
  })

  it('optically centres the mark, which is not the same as centring it', () => {
    /*
     * The asset's bounding box is exact — 8pt padding on all four sides — so
     * `contentFit: 'contain'` places it perfectly *by the box*, and it still
     * reads as sitting left. The ink is not evenly distributed inside that
     * box: the left is stacked solid bars, the right tapers to a point, so the
     * centre of mass is 9.2% left of the canvas centre and the eye follows
     * mass.
     *
     * 1.6pt is 5% of the drawn size — the midpoint between box-centred (0%)
     * and mass-centred (9%), which disagree by the whole width of the problem.
     */
    const mark = NAV().slice(NAV().indexOf('centreMark: {'))
    expect(mark.slice(0, mark.indexOf('},'))).toContain('translateX: 1.6')
  })

  it('the centre button is seated in the bar, not hanging above it', () => {
    /*
     * The frame puts the container at `y=-16`. On a real screen the Scene's
     * docked CTA and the Pulse's filter control both end just above the bar, so
     * a button that leaves the bar overlaps them and bleeds its halo onto them.
     *
     * `alignSelf: 'center'` against the row's `flex-start` is what seats it.
     */
    const src = NAV()
    expect(src).not.toContain('marginTop: -34')
    expect(src).not.toContain('top: -34')
    expect(src).toContain("centreSlot: { alignItems: 'center', alignSelf: 'center' }")
  })

  it('the mark is sized from its stroke, not from a ratio of the disc', () => {
    /*
     * `monogram-white.png` strokes measure 5.0% of the mark's width, so 28pt
     * drew a 1.18pt line against ~2pt for every other glyph in the bar — the
     * lightest thing in the row while being the most important control in it.
     * 32 puts it at 1.35pt and fits the 36.8pt square inscribed in the 52pt
     * disc, holding the same ~61% fill the disc had at 56.
     */
    const mark = NAV().slice(NAV().indexOf('centreMark: {'))
    const block = mark.slice(0, mark.indexOf('},'))
    expect(block).toContain('width: 32')
    expect(block).toContain('height: 32')
  })

  it('the bar is 88pt, the number TAB_BAR_CLEARANCE has always claimed', () => {
    /*
     * Seating the centre button made the disc — not the 48pt icon-plus-label
     * column — the row's tallest child, so the bar grew from 100 to 108 while
     * `TAB_BAR_CLEARANCE` stayed 88. Padding tolerated the drift; the Pulse's
     * hero card, which is sized against the bar's real top edge, did not.
     *
     * 8 + 52 + max(inset - 6, 20) = 88 on a home-indicator phone.
     */
    const nav = NAV()
    expect(nav).toContain('TAB_BAR_PADDING_TOP = 8')
    expect(nav).toContain('const CENTRE_SIZE = 52')
    expect(nav).toContain('export function tabBarTop')
    expect(8 + 52 + Math.max(34 - 6, 20)).toBe(88)
  })

  it('is gradient in every state, not only when something is live', () => {
    // It was a status light and is now a logo; a mark that changes colour with
    // your proximity to an event is not a mark. The status it used to carry is
    // in the badge and the breath instead.
    expect(NAV()).not.toContain('live ? (')
  })
})


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
    // The frame is a 390pt artboard with no notch. Taking its height literally
    // is what put "The Pulse" underneath the clock on a real device.
    expect(TOP_BAR()).toContain('insets.top + TOP_BAR_HEIGHT')
  })

  it('renders no control that opens nothing', () => {
    // The frame draws a hamburger at the left and a bell at the right. There is
    // no drawer, and no endpoint returns a notification.
    const src = TOP_BAR()
    expect(src).not.toContain('Pressable')
    expect(src).not.toContain('TouchableOpacity')
    expect(src).not.toContain('onPress')
  })

  it('the feed clears it with padding, not with a spacer', () => {
    const src = SCREEN()
    expect(src).toContain('<PulseTopBar />')
    expect(src).toContain('paddingTop: insets.top + TOP_BAR_HEIGHT + 32')
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

  it('uses the monogram the splash already ships, not a glyph', () => {
    const src = NAV()
    expect(src).toContain('monogram-white.png')
    // Tinted dark-on-warm. The gradient monogram would be orange on orange.
    expect(src).not.toContain('monogram-gradient.png')
    expect(src).toContain('tintColor={EMBER.onGradient}')
  })

  it('is gradient in every state, not only when something is live', () => {
    // It was a status light and is now a logo; a mark that changes colour with
    // your proximity to an event is not a mark. The status it used to carry is
    // in the badge and the breath instead.
    expect(NAV()).not.toContain('live ? (')
  })
})


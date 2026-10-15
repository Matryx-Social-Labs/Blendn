import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * The Pulse's bar and header: the layout facts that broke on a device.
 *
 * Each is a valid style object that renders fine and draws the wrong thing, so
 * neither a typecheck nor a render test sees it, and this reads the source. Colour,
 * blur, shadow, `fontWeight` and the type scale are not pinned here:
 * `npm run lint:design` enforces them (via `designTokens.test.ts`). The bar's
 * height is called for real in `featuredCardLayout.test.tsx`.
 */

const read = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8')

/** Comments describe the bugs by name, so they must not satisfy the greps. */
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const NAV = () => stripComments(read('app/(tabs)/_layout.tsx'))
const TOP_BAR = () => stripComments(read('components/pulse/PulseTopBar.tsx'))
const SCREEN = () => stripComments(read('app/(tabs)/events.tsx'))

describe('the overlay header, frame 1141:4819', () => {
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

  it('floats over the home map, and the drawer stops under it (plan v2 step 2)', () => {
    /*
     * The Pulse is the home drawer's Events pane now, so the bar moved up a
     * level with it: the shell draws it over the map, the drawer's `full`
     * stops under it, and the feed clears only the drawer's own header — with
     * padding still, never a spacer.
     */
    const shell = stripComments(read('components/home/HomeShell.tsx'))
    expect(shell).toContain('<PulseTopBar')
    expect(shell).toContain('topChrome: insets.top + TOP_BAR_HEIGHT')
    const src = SCREEN()
    expect(src).not.toContain('<PulseTopBar')
    expect(src).toContain('paddingTop: SPACE.lg,')
  })
})

describe('the stylesheet, frame 1141:4643', () => {
  /** Everything from `const styles = ...` to the end of the file. */
  const SHEET = () => {
    const src = SCREEN()
    return src.slice(src.indexOf('const styles = StyleSheet.create({'))
  }

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
    expect(surface).toContain('borderTopLeftRadius: EMBER_RADIUS.card')
    expect(surface).toContain('borderTopRightRadius: EMBER_RADIUS.card')
  })

})

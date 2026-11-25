/*
 * Who asks the tab bar to settle (SCRUM-1023, tab-bar board option B), checked in the source because each is one line in
 * a large screen: Going, Banter and Me pass their list's scroll on the UI thread; the Pulse passes its drawer's snap and
 * never the list inside the drawer; the layout picks one per tab and brings the full bar back on the board's triggers.
 */
import fs from 'fs'
import path from 'path'

const read = (file: string) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8')

describe('the lists that settle the bar', () => {
  it.each([
    ['Going', 'app/(tabs)/going.tsx'],
    ['Banter', 'app/(tabs)/chat.tsx'],
  ])('%s: its list scroll goes to useTabListScroll, set after the pull’s props so it is not replaced by them', (_, file) => {
    const src = read(file)
    expect(src).toMatch(/const onScroll = useTabListScroll\(pull\)/)
    expect(src).toMatch(/\{\.\.\.pull\.listProps\}\s*\n\s*onScroll=\{onScroll\}/)
  })

  it('Me: its own worklet handler passes every offset to trackTabBarScroll', () => {
    const src = read('app/(tabs)/profile.tsx')
    const handler = src.slice(src.indexOf('const onScroll = useAnimatedScrollHandler'))
    expect(handler.slice(0, 400)).toMatch(/trackTabBarScroll\(tabRun, e\)/)
  })

  it('the Pulse: the drawer’s snap decides (full settles, half or peek returns); the drawer’s list never does', () => {
    expect(read('components/home/HomeShell.tsx')).toMatch(/TAB_BAR_SETTLE\.drawer\.set\(snap === 'full' \? 1 : 0\)/)
    // Control for the line above: the Pulse's list and the drawer itself never touch the bar.
    for (const file of ['app/(tabs)/events.tsx', 'components/home/HomeDrawer.tsx']) expect(read(file)).not.toMatch(/tabBarSettle|TAB_BAR_SETTLE/)
  })
})

describe('the layout', () => {
  const src = read('app/(tabs)/_layout.tsx')

  it('the Pulse’s bar answers the drawer, every other tab’s its list', () => {
    expect(src).toMatch(/onPulse \? TAB_BAR_SETTLE\.drawer\.get\(\) : TAB_BAR_SETTLE\.scroll\.get\(\)/)
    expect(src).toMatch(/settle=\{settle\}/)
  })

  it('a tab switch brings the full bar back', () => {
    expect(src).toMatch(/useEffect\(\(\) => TAB_BAR_SETTLE\.scroll\.set\(0\), \[selected\]\)/)
  })

  it('so do the keyboard going, the app returning, Blend’n closing and a touch on the bar', () => {
    expect(src).toMatch(/if \(!keyboardUp\) expandTabBar\(\)/)
    expect(src).toMatch(/if \(state === 'active'\) \{[\s\S]{0,200}expandTabBar\(\)/)
    expect(src).toMatch(/if \(!blendnOpen\) expandTabBar\(\)/)
    expect(src).toMatch(/onTouch=\{expandTabBar\}/)
  })

  it('hidden while the keyboard is up; full while the disc’s coach mark shows', () => {
    expect(src).toMatch(/hidden=\{keyboardUp\}/)
    expect(src).toMatch(/holdFull=\{centreCoach\.visible\}/)
  })

  it('TAB_BAR_CLEARANCE keeps the full height, so the last row clears the bar when it comes back', () => {
    expect(src).toMatch(/export const TAB_BAR_CLEARANCE = SIZE\.tabBar \+ HOME_INDICATOR_INSET/)
  })
})

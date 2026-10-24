/**
 * Flow 6's shared chrome: the bar's thresholds (DS #30), the hero's stretch cap (DS #32), what Nights out draws (Me 04 · 05 · 06),
 * the docked tray's reach on a small phone, and the paged viewer's counter.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import { processColor, StyleSheet } from 'react-native'

const mockInsets = { top: 59, bottom: 34, left: 0, right: 0 }
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => mockInsets }))
jest.mock('../components/OptimizedImage', () => ({ OptimizedImage: () => null }))

/* eslint-disable import/first */
import { ToastDockContext } from '../components/toastDock'
import { Banner } from '../components/ds/Banner'
import { NightsOut, nightsLine, FIRST_NIGHT, NIGHTS_FAILED, NIGHTS_HELD } from '../components/profile/NightsOut'
import { BAR_GLASS_AT, BAR_TITLE_SWAP, barStateAt } from '../components/profile/ProfileBar'
import { dockClearance, ProfileDock } from '../components/profile/ProfileDock'
import { HERO_STRETCH_MAX, heroHeightFor, stretchScale } from '../components/profile/ProfileHeroStage'
import { nextPage } from '../components/profile/ProfileHeroPager'
import { counterOf, pageAt } from '../components/profile/PhotoViewer'
import { nightLabel, nightsCounts, nightsView } from '../lib/meProfile'
import { compactCount, STAT_MAX } from '../components/profile/MeSections'
import { COLOR, SIZE, SPACE } from '../lib/design/tokens'
import { tint } from '../lib/theme'
/* eslint-enable import/first */

const night = (n: number) => ({ id: `e${n}`, title: `Night ${n}`, start_time: new Date(Date.now() - n * 86_400_000).toISOString(), cover_image_url: null })

describe('the bar (DS #30)', () => {
  it('brings the glass up over the first 8 pt, and states it past them', () => {
    expect(BAR_GLASS_AT).toBe(8)
    expect(barStateAt(0).glassOpacity).toBe(0)
    expect(barStateAt(4).glassOpacity).toBeCloseTo(0.5)
    expect(barStateAt(8).glassOpacity).toBe(1)
    expect(barStateAt(80).glassOpacity).toBe(1)
    expect(barStateAt(8).glass).toBe(false)
    expect(barStateAt(9).glass).toBe(true)
  })
  it('crossfades the small title between 24 and 56 pt', () => {
    expect(barStateAt(0).titleOpacity).toBe(0)
    expect(barStateAt(24).titleOpacity).toBe(0)
    expect(barStateAt(40).titleOpacity).toBeCloseTo(0.5)
    expect(barStateAt(56).titleOpacity).toBe(1)
    expect(barStateAt(500).titleOpacity).toBe(1)
    expect(BAR_TITLE_SWAP).toBe(40)
  })
})

describe('the hero (DS #32)', () => {
  it('is 1.3 times the width, so the name sits above the fold', () => {
    expect(heroHeightFor(390)).toBe(507)
    expect(heroHeightFor(375)).toBe(488)
  })
  it('stretches with the pull, never past 1.15, never below 1', () => {
    expect(stretchScale(0, 500)).toBe(1)
    expect(stretchScale(-20, 500)).toBe(1)
    expect(stretchScale(50, 500)).toBeCloseTo(1.1)
    expect(stretchScale(400, 500)).toBe(HERO_STRETCH_MAX)
  })
  it('advances the pager and wraps', () => {
    expect(nextPage(0, 3)).toBe(1)
    expect(nextPage(2, 3)).toBe(0)
    expect(nextPage(0, 0)).toBe(0)
  })
})

describe('Nights out chooses its state (Me 04 · 05 · 06)', () => {
  it('is a skeleton grid while the first load runs', () => {
    expect(nightsView('loading', []).kind).toBe('loading')
  })
  it('is an invitation, not a grid, for someone with no night yet', () => {
    expect(nightsView('ready', []).kind).toBe('first')
  })
  it('keeps the last good tiles when a refresh failed', () => {
    expect(nightsView('failed', [night(1)])).toMatchObject({ kind: 'tiles', failed: true, locked: 0 })
  })
  it('says a failure with nothing to show without tiles', () => {
    expect(nightsView('failed', []).kind).toBe('failed')
  })
  // D-H1: "48 NIGHTS" over "Your first night isn't written yet". The free 3 can be nights still going, which the list hides.
  it('never says "first night" under a count above 0: locked nights say Blend\'n+', () => {
    expect(nightsView('ready', [], 45, 48)).toEqual({ kind: 'locked', total: 48 })
  })
  it('never says "first night" under a count above 0: nights still going say they land later', () => {
    expect(nightsView('ready', [], 0, 2)).toEqual({ kind: 'pending', total: 2 })
  })
  // Admin S-1 (fixed): a free account sees its latest 3 ended nights; the rest are `lockedCount`, said under the tiles.
  it('carries the locked nights with the tiles', () => {
    expect(nightsView('ready', [night(1), night(2), night(3)], 43, 48)).toMatchObject({ kind: 'tiles', locked: 43 })
  })
  it('is the first night only when the count is 0, or unknown', () => {
    expect(nightsView('ready', [], 0, 0).kind).toBe('first')
    expect(nightsView('ready', [], 0, null).kind).toBe('first')
  })
  it('reads the total as the shown nights plus the locked ones', () => {
    expect(nightsCounts({ pagination: { totalCount: 3 }, lockedCount: 45 })).toEqual({ locked: 45, total: 48 })
    expect(nightsCounts({ lockedCount: 2 })).toEqual({ locked: 2, total: null })
    expect(nightsCounts(null)).toEqual({ locked: 0, total: null })
  })
  it('labels a night the way the tile reads', () => {
    expect(nightLabel(new Date(2025, 9, 3, 20).toISOString())).toBe('Fri 3 Oct')
    expect(nightLabel('nope')).toBe('')
  })
  it('counts in one voice', () => {
    expect(nightsLine(1)).toBe('1 night out in the last 12 weeks')
    expect(nightsLine(6)).toBe('6 nights out in the last 12 weeks')
  })

  const draw = (status: 'loading' | 'ready' | 'failed', events: ReturnType<typeof night>[]) =>
    render(<NightsOut status={status} events={events} onOpenEvent={jest.fn()} onSeeAll={jest.fn()} onRetry={jest.fn()} onFirstNight={jest.fn()} />)

  it('renders the skeleton grid', async () => {
    await draw('loading', [])
    expect(screen.getByTestId('nights-loading')).toBeTruthy()
    expect(screen.queryByTestId('nights-grid')).toBeNull()
  })
  it('renders the first-night invitation with its button', async () => {
    const onFirst = jest.fn()
    await render(<NightsOut status="ready" events={[]} onOpenEvent={jest.fn()} onSeeAll={jest.fn()} onRetry={jest.fn()} onFirstNight={onFirst} />)
    expect(screen.getByText(FIRST_NIGHT.title)).toBeTruthy()
    fireEvent.press(screen.getByText(FIRST_NIGHT.action))
    expect(onFirst).toHaveBeenCalledTimes(1)
    expect(screen.queryByTestId('nights-grid')).toBeNull()
  })
  it('renders the failed notice over the last good tiles, with Try again', async () => {
    const onRetry = jest.fn()
    await render(<NightsOut status="failed" events={[night(1), night(2)]} onOpenEvent={jest.fn()} onSeeAll={jest.fn()} onRetry={onRetry} onFirstNight={jest.fn()} />)
    expect(screen.getByText(NIGHTS_FAILED.withTiles)).toBeTruthy()
    expect(screen.getByTestId('nights-grid')).toBeTruthy()
    fireEvent.press(screen.getByText('Try again'))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })
  it('renders the locked count with a lit See Blend\'n+, never the first-night card', async () => {
    const onUnlock = jest.fn()
    await render(
      <NightsOut status="ready" events={[]} lockedCount={1045} total={1048} onUnlock={onUnlock} onOpenEvent={jest.fn()} onSeeAll={jest.fn()} onRetry={jest.fn()} onFirstNight={jest.fn()} />
    )
    expect(screen.queryByText(FIRST_NIGHT.title)).toBeNull()
    expect(screen.getByText(NIGHTS_HELD.locked(1048))).toBeTruthy()
    expect(NIGHTS_HELD.locked(1048)).toBe('1,048 nights · the older ones are with Blend’n+')
    fireEvent.press(screen.getByText(NIGHTS_HELD.action))
    expect(onUnlock).toHaveBeenCalledTimes(1)
  })
  it('renders nights still going without the first-night card or a Blend\'n+ button', async () => {
    await render(<NightsOut status="ready" events={[]} total={1} onOpenEvent={jest.fn()} onSeeAll={jest.fn()} onRetry={jest.fn()} onFirstNight={jest.fn()} />)
    expect(screen.queryByText(FIRST_NIGHT.title)).toBeNull()
    expect(screen.getByText('1 night · it lands here once it ends')).toBeTruthy()
    expect(screen.queryByText(NIGHTS_HELD.action)).toBeNull()
  })
  it('says the locked nights under the tiles, with a lit See Blend\'n+', async () => {
    const onUnlock = jest.fn()
    await render(
      <NightsOut status="ready" events={[night(1), night(2), night(3)]} lockedCount={43} total={48} onUnlock={onUnlock} onOpenEvent={jest.fn()} onSeeAll={jest.fn()} onRetry={jest.fn()} onFirstNight={jest.fn()} />
    )
    expect(screen.getByTestId('nights-grid')).toBeTruthy()
    expect(screen.getByText('43 more nights with Blend’n+')).toBeTruthy()
    fireEvent.press(screen.getByText(NIGHTS_HELD.action))
    expect(onUnlock).toHaveBeenCalledTimes(1)
  })
  it('draws at most six tiles', async () => {
    await draw('ready', [1, 2, 3, 4, 5, 6, 7, 8].map(night))
    expect(screen.getAllByLabelText(/^Night \d/)).toHaveLength(6)
  })
})

describe('the docked tray reaches the thumb on an iPhone SE', () => {
  it('floats SPACE.lg over the bottom inset, on the screen gutters', async () => {
    await render(
      <ProfileDock testID="dock" note="Connect sends a request and reveals your name and photo.">
        <Banner kind="info" text="child" />
      </ProfileDock>
    )
    const dock = StyleSheet.flatten(screen.getByTestId('dock').props.style)
    expect(dock.position).toBe('absolute')
    expect(dock.bottom).toBe(0)
    expect(screen.getByText(/Connect sends a request/)).toBeTruthy()
  })
  it('the note and the tray sit on SOLID ink, with the fade above it ending at 100% where the dock begins (the note overprinted the interest chips)', async () => {
    await render(
      <ProfileDock testID="dock" note="Connect sends a request and reveals your name and photo.">
        <Banner kind="info" text="child" />
      </ProfileDock>
    )
    await act(async () => {
      fireEvent(screen.getByTestId('dock'), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 160 } } })
    })
    expect(StyleSheet.flatten(screen.getByTestId('dock-foot').props.style).backgroundColor).toBe(COLOR.ink)
    const fade = screen.getByTestId('dock-fade', { includeHiddenElements: true })
    // It starts where the foot ends (above the measured dock), and its last stop is the opaque ink the foot is.
    expect(StyleSheet.flatten(fade.props.style).bottom).toBe(160)
    expect(fade.props.colors[fade.props.colors.length - 1]).toBe(processColor(tint(COLOR.ink, 1)))
    expect(fade.props.colors[0]).toBe(processColor(tint(COLOR.ink, 0)))
  })
  it('a lead action stands full width above the buttons, in the same tray; with none, the tray is the one row', async () => {
    await render(
      <ProfileDock testID="dock" lead={<Banner kind="info" text="lead" />}>
        <Banner kind="info" text="child" />
      </ProfileDock>
    )
    const tray = StyleSheet.flatten(screen.getByTestId('dock-tray').props.style)
    expect(tray.flexDirection).toBe('column')
    expect(screen.getByText('lead')).toBeTruthy()
    expect(screen.getByText('child')).toBeTruthy()
    await screen.unmount()
    await render(
      <ProfileDock testID="dock">
        <Banner kind="info" text="child" />
      </ProfileDock>
    )
    expect(StyleSheet.flatten(screen.getByTestId('dock-tray').props.style).flexDirection).toBe('row')
  })
  it('keeps the tray clear of the hero: dock top sits below the name on a 667 pt phone', () => {
    // iPhone SE: 375 × 667, no island, a 0 inset. The hero's name sits 44 above its foot.
    const hero = heroHeightFor(375)
    const nameTop = hero - 44 - 40
    const dockTop = 667 - dockClearance(0) - SPACE.xl
    expect(dockTop).toBeGreaterThan(nameTop)
    // And the primary is on screen at all: its foot is inside the window.
    expect(667 - dockClearance(0) + SIZE.primary).toBeLessThan(667)
  })
  it('registers its height with the toast, so the Android snackbar stands above the tray', async () => {
    const unregister = jest.fn()
    const register = jest.fn(() => unregister)
    await render(
      <ToastDockContext.Provider value={register}>
        <ProfileDock testID="dock">
          <Banner kind="info" text="child" />
        </ProfileDock>
      </ToastDockContext.Provider>
    )
    expect(register).not.toHaveBeenCalled()
    await act(async () => {
      fireEvent(screen.getByTestId('dock'), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 160 } } })
    })
    // The toast host clears the navigation bar itself, so only what stands above the inset counts: 160 less the 34 pt inset.
    expect(register).toHaveBeenLastCalledWith(expect.any(String), 126)
  })

  it('the page’s last section scrolls clear of the fade above the dock, not into it (r7 M2)', () => {
    const page = require('fs').readFileSync(require('path').join(__dirname, '../app/user/[id].tsx'), 'utf8')
    expect(page).toMatch(/paddingBottom: \(dockHeight \|\| dockClearance\(insets\.bottom\)\) \+ DOCK_FADE \+ SPACE\.xl/)
  })

  it('clears the Android navigation bar by the inset it is given', () => {
    expect(dockClearance(48) - dockClearance(0)).toBe(48)
  })
})

describe('the paged viewer', () => {
  it('rests on the page the offset is nearest, inside the set', () => {
    expect(pageAt(0, 390, 5)).toBe(0)
    expect(pageAt(400, 390, 5)).toBe(1)
    expect(pageAt(10_000, 390, 5)).toBe(4)
    expect(pageAt(-50, 390, 5)).toBe(0)
  })
  it('names where you are for a set, and nothing for one photo', () => {
    expect(counterOf(1, 5)).toEqual({ text: '2 / 5', spoken: 'Photo 2 of 5' })
    expect(counterOf(0, 1)).toBeNull()
  })
})

describe('worst-case data (break-ui)', () => {
  it('never draws a stat past four digits: it goes compact', () => {
    expect(STAT_MAX).toBe(9999)
    expect(compactCount(9999)).toBe('9999')
    expect(compactCount(10_000)).toBe('10k')
    expect(compactCount(12_345)).toBe('12k')
    expect(compactCount(999_999)).toBe('999k')
    expect(compactCount(1_234_567)).toBe('1.2M')
    expect(compactCount(25_000_000)).toBe('25M')
  })
})

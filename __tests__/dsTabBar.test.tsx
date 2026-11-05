/*
 * <TabBar> (guidelines/components/TabBar.html; DESIGN-BRIEF §13): Pulse ·
 * Going · the disc · Banter · Me in a 64 pt bar-glass capsule, 16 in from the
 * edges; the selected pill (iOS) or indicator (Android); silent tab switches
 * (§10, §13); and the accessibility matrix.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import React from 'react'
import { AccessibilityInfo, Dimensions, Platform, StyleSheet } from 'react-native'

import * as Reanimated from 'react-native-reanimated'

import { pillX, TabBar, tabBarGeometry } from '../components/ds/TabBar'
import { COLOR, FONT_FAMILY, MATERIAL, RADIUS, SIZE, SPACE, SPRING } from '../lib/design/tokens'
import { H } from '../lib/haptics'

jest.mock('react-native-reanimated', () => {
  const actual = jest.requireActual('react-native-reanimated')
  return { ...actual, __esModule: true, useReducedMotion: jest.fn(() => false), withSpring: jest.fn(actual.withSpring), withTiming: jest.fn(actual.withTiming), withDelay: jest.fn(actual.withDelay) }
})
jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default)
jest.mock('expo-glass-effect', () => {
  const { View } = jest.requireActual('react-native')
  return {
    GlassView: (props: object) => <View {...props} testID="glass" />,
    isGlassEffectAPIAvailable: jest.fn(() => true),
    isLiquidGlassAvailable: jest.fn(() => true),
  }
})
jest.mock('expo-blur', () => {
  const { View } = jest.requireActual('react-native')
  return { BlurView: (props: object) => <View testID="blur" {...props} /> }
})
jest.mock('expo-linear-gradient', () => {
  const { View } = jest.requireActual('react-native')
  return { LinearGradient: (props: object) => <View {...props} /> }
})

const flat = (id: string) => StyleSheet.flatten(screen.getByTestId(id, { includeHiddenElements: true }).props.style)
const label = (t: string) => StyleSheet.flatten(screen.getByText(t).props.style)
const on = (os: 'ios' | 'android') => Object.defineProperty(Platform, 'OS', { value: os, configurable: true })

const IDLE = { state: 'idle', eventId: null, badge: 0 } as const

const withSpring = Reanimated.withSpring as jest.Mock
const reduceMotion = Reanimated.useReducedMotion as jest.Mock
let haptics: jest.SpyInstance[]
beforeEach(() => {
  on('ios')
  reduceMotion.mockReturnValue(false)
  withSpring.mockClear()
  haptics = (['select', 'primary', 'disc'] as const).map((k) => jest.spyOn(H, k).mockImplementation(() => {}))
})

const draw = (props: Partial<React.ComponentProps<typeof TabBar>> = {}) =>
  render(<TabBar selected="pulse" onSelect={jest.fn()} disc={{ target: IDLE, onPress: jest.fn() }} testID="tabs" {...props} />)

describe('<TabBar>', () => {
  it('is a 64 pt capsule on the bar glass, 16 pt in from the edges', async () => {
    await draw()
    expect(flat('tabs')).toMatchObject({ height: SIZE.tabBar, borderRadius: RADIUS.tabBar, left: SPACE.tabBarInset, right: SPACE.tabBarInset })
    expect(screen.getByTestId('glass')).toBeTruthy()
  })

  it('Android: the solid bar tier, 12 dp above the gesture bar', async () => {
    on('android')
    await draw()
    expect(screen.queryByTestId('glass')).toBeNull()
    expect(flat('tabs').bottom).toBe(SPACE.tabBarBottomGapAndroid)
  })

  it('four tabs around the disc, in order; the selected one is selected', async () => {
    await draw({ selected: 'banter' })
    const tabs = screen.getAllByRole('tab')
    expect(tabs.map((t) => t.props.accessibilityLabel)).toEqual(['Pulse', 'Going', 'Banter', 'Me'])
    expect(screen.getByRole('tab', { name: 'Banter' }).props.accessibilityState).toMatchObject({ selected: true })
    expect(screen.getByTestId('disc')).toBeTruthy()
  })

  it('iOS: the selected tab is a 22% white pill and a 700 label; the rest 500 in textSecondary', async () => {
    await draw()
    expect(flat('tabs-pill').backgroundColor).toBe(COLOR.tabCapsule)
    expect(label('Pulse')).toMatchObject({ fontFamily: FONT_FAMILY.brand[700], color: COLOR.textPrimary })
    expect(label('Going')).toMatchObject({ fontFamily: FONT_FAMILY.brand[500], color: COLOR.textSecondary })
  })

  it('Android: a 56 × 32 indicator behind the glyph, and the label is not bold (§13)', async () => {
    on('android')
    await draw()
    expect(flat('tabs-pill')).toMatchObject({ width: 56, height: 32 })
    expect(label('Pulse').fontFamily).toBe(FONT_FAMILY.brand[500])
  })

  it('a tab switch calls back and plays nothing (§10.1 rule 5, §13)', async () => {
    const onSelect = jest.fn()
    await draw({ onSelect })
    await fireEvent.press(screen.getByRole('tab', { name: 'Going' }))
    expect(onSelect).toHaveBeenCalledWith('going')
    await fireEvent.press(screen.getByRole('tab', { name: 'Pulse' }))
    expect(onSelect).toHaveBeenLastCalledWith('pulse')
    for (const h of haptics) expect(h).not.toHaveBeenCalled()
  })

  it('Me is your own face, ringed white when selected', async () => {
    await draw({ selected: 'me', mePhoto: 'https://example.com/me.jpg' })
    expect(flat('tabs-me-avatar-ring').backgroundColor).toBe(COLOR.textPrimary)
  })

  it('Banter carries a dot and says how many are new; with none it has neither (BAR-02)', async () => {
    await draw({ banterUnread: 3 })
    expect(screen.getByTestId('tabs-banter-dot', { includeHiddenElements: true })).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Banter, 3 new' })).toBeTruthy()
    await screen.unmount()
    await draw({ banterUnread: 0 })
    expect(screen.queryByTestId('tabs-banter-dot', { includeHiddenElements: true })).toBeNull()
    expect(screen.getByRole('tab', { name: 'Banter' })).toBeTruthy()
  })

  it('labels cap at 1.3× in the fixed bar', async () => {
    await draw()
    expect(screen.getByText('Pulse').props.maxFontSizeMultiplier).toBe(1.3)
  })

  it('the bar is a tab list', async () => {
    await draw()
    expect(screen.getByTestId('tabs-row').props.accessibilityRole).toBe('tablist')
  })
})

describe('Increase Contrast and Bold Text', () => {
  it('Increase Contrast adds the 50% outline to the capsule', async () => {
    jest.spyOn(AccessibilityInfo, 'isDarkerSystemColorsEnabled').mockResolvedValue(true)
    await draw()
    await act(async () => {})
    expect(flat('tabs-contrast')).toMatchObject({ borderColor: MATERIAL.hairlineIncreaseContrast, borderRadius: RADIUS.tabBar })
  })

  it('Bold Text makes every label 700, so the pill alone tells them apart', async () => {
    jest.spyOn(AccessibilityInfo, 'isBoldTextEnabled').mockResolvedValue(true)
    await draw()
    await act(async () => {})
    expect(label('Pulse').fontFamily).toBe(FONT_FAMILY.brand[700])
    expect(label('Going').fontFamily).toBe(FONT_FAMILY.brand[700])
  })
})

describe('geometry: five equal slots, the disc in the middle one (owner override on #401)', () => {
  const { tabBarGeometry } = require('../components/ds/TabBar') as typeof import('../components/ds/TabBar')

  it.each([360, 393, 430, 440])('at %i pt all five centres are equally spaced, the disc at the middle of the screen', (width) => {
    const { cell, centres } = tabBarGeometry(width)
    expect(cell).toBeCloseTo((width - 40) / 5, 6)
    expect(centres[2]).toBeCloseTo(width / 2, 6)
    const gaps = centres.slice(1).map((c, i) => c - centres[i])
    gaps.forEach((g) => expect(g).toBeCloseTo(cell, 6))
    // Every 56 pt target, and the 56 pt disc, fits its slot.
    expect(cell).toBeGreaterThanOrEqual(56)
  })

  it('draws all five slots at the same width, the disc slot included', async () => {
    await draw()
    const width = (id: string) => StyleSheet.flatten(screen.getByTestId(id).props.style).width
    const slots = ['pulse', 'going', 'banter', 'me'].map((k) => width(`tabs-${k}-cell`)).concat(width('tabs-disc-slot'))
    expect(new Set(slots).size).toBe(1)
  })
})


describe('the selection pill slides (DS #2: the capsule moves on M.snap)', () => {
  const WIDTH = 402 // the jest window
  const { cell } = tabBarGeometry(Dimensions.get('window').width)
  const translateX = () => (Reanimated.getAnimatedStyle(screen.getByTestId('tabs-pill', { includeHiddenElements: true })) as { transform: { translateX: number }[] }).transform[0].translateX

  it('is one pill, not one per tab', async () => {
    await draw({ selected: 'going' })
    expect(screen.getAllByTestId(/-pill$/, { includeHiddenElements: true })).toHaveLength(1)
    expect(screen.queryByTestId('tabs-going-pill')).toBeNull()
  })

  it('rests under the selected tab’s slot: its centre, the disc’s slot skipped', async () => {
    await draw({ selected: 'banter' })
    // Slot 3 (the disc owns 2), centred, after the row’s 4 pt of padding.
    expect(translateX()).toBe(SPACE.xs + cell * 3.5 - SIZE.primary / 2)
    expect(pillX('pulse', cell, SIZE.primary)).toBe(SPACE.xs + cell * 0.5 - SIZE.primary / 2)
    expect(pillX('me', cell, SIZE.primary)).toBe(SPACE.xs + cell * 4.5 - SIZE.primary / 2)
    void WIDTH
  })

  // The pill springs its slot (Me is slot 4, the disc owns 2), so it lands on the cell at any width, full or compact.
  it('a new selection springs to the new slot on M.snap, from where it is', async () => {
    const view = await draw({ selected: 'pulse' })
    expect(withSpring).not.toHaveBeenCalled()
    await view.rerender(<TabBar selected="me" onSelect={jest.fn()} disc={{ target: IDLE, onPress: jest.fn() }} testID="tabs" />)
    expect(withSpring).toHaveBeenCalledWith(4, expect.objectContaining({ stiffness: SPRING.snap.stiffness, damping: SPRING.snap.damping }))
  })

  it('a second switch mid-flight retargets: each selection springs to its own slot', async () => {
    const view = await draw({ selected: 'pulse' })
    for (const to of ['going', 'me'] as const) await view.rerender(<TabBar selected={to} onSelect={jest.fn()} disc={{ target: IDLE, onPress: jest.fn() }} testID="tabs" />)
    expect(withSpring.mock.calls.map(([x]) => x)).toEqual([1, 4])
  })

  it('Reduce Motion: it jumps, with no spring', async () => {
    reduceMotion.mockReturnValue(true)
    const view = await draw({ selected: 'pulse' })
    await view.rerender(<TabBar selected="me" onSelect={jest.fn()} disc={{ target: IDLE, onPress: jest.fn() }} testID="tabs" />)
    expect(withSpring).not.toHaveBeenCalled()
  })

  it('Android: the 56 × 32 indicator slides the same way', async () => {
    on('android')
    const view = await draw({ selected: 'pulse' })
    await view.rerender(<TabBar selected="going" onSelect={jest.fn()} disc={{ target: IDLE, onPress: jest.fn() }} testID="tabs" />)
    expect(withSpring).toHaveBeenCalledWith(1, expect.any(Object))
    expect(flat('tabs-pill')).toMatchObject({ width: 56, height: 32 })
  })

  it('the tabs’ content crossfades, never slides (source check on the layout)', () => {
    const src = require('fs').readFileSync(require('path').join(__dirname, '../app/(tabs)/_layout.tsx'), 'utf8')
    expect(src).toMatch(/animation: 'fade'/)
    expect(src).toMatch(/transitionSpec: \{ animation: 'timing'/)
    expect(src).not.toMatch(/animation: 'shift'/)
  })
})


describe('settling into the compact pill (SCRUM-1023, tab-bar board option B)', () => {
  const W = Dimensions.get('window').width
  const FULL = W - 2 * SPACE.tabBarInset
  const animated = (id: string) => Reanimated.getAnimatedStyle(screen.getByTestId(id, { includeHiddenElements: true })) as Record<string, unknown>
  const tx = (id: string) => (animated(id).transform as Record<string, number>[]).reduce((o, t) => ({ ...o, ...t }), {} as Record<string, number>)
  const withTiming = Reanimated.withTiming as unknown as jest.Mock
  const withDelay = Reanimated.withDelay as unknown as jest.Mock
  const settle = (to = 0) => Reanimated.makeMutable(to)
  // Springs land at once, so a still of the end state can be read.
  const land = () => withSpring.mockImplementation((to: number) => to)
  /*
   * A mapper's first run is scheduled, not synchronous, and in jest a value written inside one (the bar's reaction moving
   * its progress) reaches the mappers that read it on the next run only: a frame, then a nudge, as a device's next frame.
   */
  const frame = () => act(() => new Promise((r) => setTimeout(r, 32)))
  // An equal value notifies nobody, so the nudge steps off it and back.
  const nudge = (s: Reanimated.SharedValue<number>) =>
    act(async () => {
      const v = s.get()
      s.set(v + 1e-9)
      s.set(v)
    })
  /** Ask, and let the bar answer: a frame for the reaction, a nudge and a frame for what reads its progress. */
  const ask = async (s: Reanimated.SharedValue<number>, to: number, progress?: Reanimated.SharedValue<number>) => {
    await act(async () => s.set(to))
    await frame()
    if (progress) await nudge(progress)
    await frame()
  }
  /** Drawn full, then asked to settle, with the springs landing at once: the compact still. */
  const compact = async (props: Partial<React.ComponentProps<typeof TabBar>> = {}) => {
    land()
    const s = settle(0)
    const progress = props.progress ?? Reanimated.makeMutable(0)
    const view = await draw({ settle: s, progress, ...props })
    await frame()
    await ask(s, 1, progress)
    return { view, s }
  }
  afterEach(() => withSpring.mockImplementation(jest.requireActual('react-native-reanimated').withSpring))
  beforeEach(() => {
    withTiming.mockClear()
    withDelay.mockClear()
    jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(false)
  })

  // The capsule is read on the solid tier: the same animated style as the glass, on a view jest can see.
  it('at rest it is the full bar: the capsule fills the 64 pt bar, radius 32', async () => {
    on('android')
    await draw({ settle: settle(0) })
    expect(animated('tabs-capsule')).toMatchObject({ left: 0, top: 0, width: FULL, height: SIZE.tabBar, borderRadius: SIZE.tabBar / 2 })
  })

  it('settles on SPRING.settle when asked, and comes back on SPRING.snap', async () => {
    const s = settle(0)
    await draw({ settle: s })
    await ask(s, 1)
    expect(withSpring).toHaveBeenCalledWith(1, expect.objectContaining({ stiffness: SPRING.settle.stiffness, damping: SPRING.settle.damping }))
    await ask(s, 0)
    expect(withSpring).toHaveBeenLastCalledWith(0, expect.objectContaining({ stiffness: SPRING.snap.stiffness, damping: SPRING.snap.damping }))
  })

  it('compact: a 288 × 52 pill, centred, its bottom edge where the full bar’s was', async () => {
    on('android')
    await compact({ selected: 'going' })
    expect(animated('tabs-capsule')).toMatchObject({ width: 288, height: SIZE.tabBarCompact, top: SIZE.tabBar - SIZE.tabBarCompact, borderRadius: SIZE.tabBarCompact / 2 })
    expect(animated('tabs-capsule').left).toBeCloseTo((FULL - 288) / 2, 6)
    // Control: the bar itself (its bottom) does not move.
    expect(flat('tabs')).toMatchObject({ height: SIZE.tabBar, bottom: SPACE.tabBarBottomGapAndroid })
  })

  it('compact: five 56 pt cells — each tab slides in to its own, the disc stays centred', async () => {
    await compact()
    const { cell } = tabBarGeometry(W)
    // Pulse is two cells left of the middle: it comes in by 2 × (cell − 56); Me goes the other way.
    expect(tx('tabs-pulse-cell').translateX).toBeCloseTo(-2 * (SIZE.primary - cell), 6)
    expect(tx('tabs-me-cell').translateX).toBeCloseTo(2 * (SIZE.primary - cell), 6)
    expect(tx('tabs-going-cell').translateY).toBe(6)
    expect(tx('tabs-disc-slot').translateY).toBe(6)
  })

  it('compact: labels faded, glyphs dropped to the middle, the disc at 44', async () => {
    await compact()
    expect(animated('tabs-going-label').opacity).toBe(0)
    expect(tx('disc-sized').scale).toBeCloseTo(SIZE.discCompact / SIZE.disc, 6)
    // The check-in pill does not shrink with the disc; it only follows its top edge down.
    expect(tx('disc-sized').scale).not.toBe(1)
  })

  it('compact: the check-in pill keeps its size and rides down on the disc’s top edge', async () => {
    await compact({ disc: { target: { state: 'checkin', eventId: 'e1', badge: 0 }, onPress: jest.fn(), venue: 'Toit' } })
    // The disc's top edge comes down (1 − 44/56) × 28 = 6 pt inside its slot; the slot itself drops 6 with the row.
    expect(tx('disc-label-slot').translateY).toBeCloseTo((1 - SIZE.discCompact / SIZE.disc) * (SIZE.disc / 2), 6)
    expect(tx('disc-label-slot').scale).toBeUndefined()
    expect(screen.getByText('Check in · Toit', { includeHiddenElements: true })).toBeTruthy()
  })

  it('compact: the tabs keep their names as accessibility labels, and 56 pt targets', async () => {
    await compact({ banterUnread: 2 })
    expect(screen.getAllByRole('tab').map((t) => t.props.accessibilityLabel)).toEqual(['Pulse', 'Going', 'Banter, 2 new', 'Me'])
    expect(flat('tabs-going')).toMatchObject({ width: SIZE.primary, height: SIZE.primary })
  })

  it('iOS pill: 48 × 44 in the compact pill, centred under the cell', async () => {
    await compact({ selected: 'pulse' })
    expect(animated('tabs-pill')).toMatchObject({ width: 48, height: 44 })
    expect(tx('tabs-pill').translateX).toBeCloseTo(FULL / 2 - 2 * SIZE.primary - 24, 6)
    expect(tx('tabs-pill').translateY).toBeCloseTo(SIZE.tabBar - 52 + 4, 6)
  })

  it('Android indicator: centred on the glyph, full and compact (the board’s `.ind`)', async () => {
    on('android')
    land()
    const s = settle(0)
    const progress = Reanimated.makeMutable(0)
    await draw({ settle: s, progress })
    await frame()
    const shift = 16 / 2 // the caption's 16 pt line under the glyph, no gap, halved
    expect(tx('tabs-pill').translateY).toBeCloseTo(32 - shift - 16, 6)
    await ask(s, 1, progress)
    // Compact: the glyph sits at the pill's middle, 26 pt above its foot, i.e. 38 from the full bar's top.
    expect(tx('tabs-pill').translateY).toBeCloseTo(38 - 16, 6)
  })

  it('VoiceOver or TalkBack on: it never settles', async () => {
    ;(AccessibilityInfo.isScreenReaderEnabled as jest.Mock).mockResolvedValue(true)
    const s = settle(0)
    await draw({ settle: s })
    await act(async () => {})
    await frame()
    await ask(s, 1)
    expect(withSpring).not.toHaveBeenCalledWith(1, expect.anything())
  })

  it('held full (the disc’s coach mark): it never settles; let go, it does', async () => {
    const s = settle(1)
    const view = await draw({ settle: s, holdFull: true })
    await frame()
    expect(withSpring).not.toHaveBeenCalledWith(1, expect.anything())
    await view.rerender(<TabBar selected="pulse" onSelect={jest.fn()} disc={{ target: IDLE, onPress: jest.fn() }} testID="tabs" settle={s} />)
    await frame()
    expect(withSpring).toHaveBeenCalledWith(1, expect.anything())
  })

  it('Reduce Motion: the labels dissolve over 200 ms, then the pill steps in one frame; back, it steps then the labels return', async () => {
    reduceMotion.mockReturnValue(true)
    const s = settle(0)
    await draw({ settle: s })
    await ask(s, 1)
    expect(withSpring).not.toHaveBeenCalled()
    expect(withTiming).toHaveBeenCalledWith(0, expect.objectContaining({ duration: 200 }))
    expect(withDelay).toHaveBeenCalledWith(200, expect.anything(), expect.anything())
    expect(withTiming).toHaveBeenCalledWith(1, expect.objectContaining({ duration: 0 }))
    withTiming.mockClear()
    await ask(s, 0)
    expect(withTiming).toHaveBeenCalledWith(1, expect.objectContaining({ duration: 200 }))
  })

  it('hidden while the keyboard is up: kept mounted, not drawn', async () => {
    await draw({ hidden: true })
    expect(flat('tabs').display).toBe('none')
    expect(screen.getByTestId('disc', { includeHiddenElements: true })).toBeTruthy()
  })

  it('a touch anywhere on the bar reports itself (a tap opens the pill)', async () => {
    const onTouch = jest.fn()
    await draw({ onTouch })
    await fireEvent(screen.getByTestId('tabs'), 'touchEnd')
    expect(onTouch).toHaveBeenCalled()
  })

  it('writes its progress for what rides on its top edge', async () => {
    const progress = Reanimated.makeMutable(0)
    await compact({ progress })
    expect(progress.get()).toBe(1)
  })
})

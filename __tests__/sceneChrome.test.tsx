/**
 * The event page's chrome and poster: back plus three media circles with the ⋯ holding Report; the glass bar that
 * mounts at 8 pt of scroll, or with a poster as the title reaches it (Flow 4 E-B); the poster and its stamp; the day strip.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import React from 'react'
import { Platform, StyleSheet } from 'react-native'
import { getAnimatedStyle, makeMutable } from 'react-native-reanimated'

import { SceneBar, sceneBarTitleSpan } from '../components/scene/SceneBar'
import { SceneHero, posterSide } from '../components/scene/SceneHero'
import { SceneDayStrip, dayStripOffset } from '../components/scene/SceneChange'
import { H } from '../lib/haptics'

jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 47, bottom: 34, left: 0, right: 0 }) }))
jest.mock('expo-linear-gradient', () => {
  const { View } = jest.requireActual('react-native')
  return { LinearGradient: (props: object) => <View {...props} /> }
})
jest.mock('../components/scene/SceneHeroMedia', () => ({ SceneHeroMedia: () => null, HERO_CAPTION_FOOT: 40 }))

const on = (os: 'ios' | 'android') => Object.defineProperty(Platform, 'OS', { value: os, configurable: true })
const bar = (props: Partial<React.ComponentProps<typeof SceneBar>> = {}) => (
  <SceneBar title="Vinyl Night" saved={false} onBack={jest.fn()} onSave={jest.fn()} onShare={jest.fn()} onMore={jest.fn()} {...props} />
)

beforeEach(() => on('ios'))

describe('SceneBar', () => {
  it('is Back, then Save, Share and More: four named buttons, Back first in the tree', async () => {
    await render(bar())
    const names = screen.getAllByRole('button').map((b) => b.props.accessibilityLabel)
    expect(names).toEqual(['Back', 'Save', 'Share', 'More options'])
  })

  it('names the save by its state, and it is the one toggle: selected, and H.select on a press', async () => {
    const select = jest.spyOn(H, 'select').mockImplementation(() => {})
    const onSave = jest.fn()
    await render(bar({ saved: true, onSave }))
    const saved = screen.getByRole('button', { name: 'Saved' })
    expect(saved.props.accessibilityState).toMatchObject({ selected: true })
    await fireEvent.press(saved)
    expect(onSave).toHaveBeenCalledTimes(1)
    expect(select).toHaveBeenCalledTimes(1)
    // Back, Share and More are navigation: silent.
    await fireEvent.press(screen.getByRole('button', { name: 'Share' }))
    expect(select).toHaveBeenCalledTimes(1)
  })

  it('draws Android\'s arrow where iOS has the chevron, with the same name', async () => {
    on('android')
    await render(bar())
    expect(screen.getByRole('button', { name: 'Back' })).toBeTruthy()
  })

  it('with a poster (Flow 4 E-B) the glass and the title wait for the page title, then fade in over 40 pt', async () => {
    const scrollY = makeMutable(0)
    await render(bar({ scrollY, reveal: 345 }))
    const glass = () => getAnimatedStyle(screen.getByTestId('scene-bar-glass', { includeHiddenElements: true })).opacity
    const title = () => getAnimatedStyle(screen.getByTestId('scene-bar-title', { includeHiddenElements: true })).opacity
    const at = async (y: number) => {
      await act(async () => {
        scrollY.set(y)
      })
      await act(async () => jest.runOnlyPendingTimers())
    }
    // Control: past 8 pt, the bar without a poster is glass; with one it is still clear.
    await at(20)
    expect(glass()).toBe(0)
    await at(365)
    expect(glass()).toBeCloseTo(0.5)
    expect(title()).toBeCloseTo(0.5)
    await at(400)
    expect(glass()).toBe(1)
    expect(title()).toBe(1)
  })

  it('keeps the glass mounted and clear at rest, and fully there past 8 pt (no pop)', async () => {
    const scrollY = makeMutable(0)
    await render(bar({ scrollY }))
    const opacity = () => getAnimatedStyle(screen.getByTestId('scene-bar-glass', { includeHiddenElements: true })).opacity
    expect(opacity()).toBe(0)
    // Mounted from the first frame: scrolling changes only its opacity, so there is no mount to pop.
    expect(screen.getByTestId('scene-bar-glass', { includeHiddenElements: true })).toBeTruthy()
    await act(async () => {
      scrollY.set(20)
    })
    await act(async () => jest.runOnlyPendingTimers())
    expect(opacity()).toBe(1)
    expect(screen.getAllByTestId('scene-bar-glass', { includeHiddenElements: true })).toHaveLength(1)
  })

  it('keeps the small title out of the reading order', async () => {
    await render(bar())
    expect(screen.getByTestId('scene-bar-title', { includeHiddenElements: true }).props.accessibilityElementsHidden).toBe(true)
  })
})

describe('the small title\'s room', () => {
  it.each([
    [360, 'ios', 44],
    [393, 'ios', 44],
    [412, 'android', 48],
  ] as const)('%i wide (%s): back on the left, three circles on the right, at least 100 pt between', (width, _os, side) => {
    const span = sceneBarTitleSpan(width, side)
    expect(span.left).toBe(16 + side + 12)
    expect(span.right).toBe(16 + 3 * side + 2 * 8 + 12)
    expect(span.width).toBe(width - span.left - span.right)
    expect(span.width).toBeGreaterThanOrEqual(100)
  })

  it('is 145 pt on a 393 pt iPhone, not the 41 a symmetric inset left', () => {
    expect(sceneBarTitleSpan(393, 44).width).toBe(145)
  })

  it('the title View stands in that span', async () => {
    jest.spyOn(require('react-native'), 'useWindowDimensions').mockReturnValue({ width: 393, height: 852, scale: 3, fontScale: 1 })
    await render(bar())
    expect(StyleSheet.flatten(screen.getByTestId('scene-bar-title', { includeHiddenElements: true }).props.style)).toMatchObject({ left: 72, right: 176 })
  })
})

describe('SceneHero: the poster, lit from behind (Flow 4 E-B)', () => {
  const STILL = [{ kind: 'image' as const, url: 'https://example.com/c.jpg' }]
  const STAMP = { dow: 'TUE', dd: '11', mon: 'NOV', spoken: 'Tuesday 11 November' }
  const hero = (props: Partial<React.ComponentProps<typeof SceneHero>> = {}) => (
    <SceneHero playlist={STILL} title="Vinyl Night" stamp={STAMP} venueLine="Toit · Indiranagar" category="music" {...props} />
  )

  it('is a square the width of the page’s column (24 in each side), with the ember underglow behind it', async () => {
    await render(hero())
    const style = StyleSheet.flatten(screen.getByTestId('scene-hero').props.style)
    expect(style.width).toBe(posterSide(393))
    expect(style.height).toBe(style.width)
    expect(posterSide(393)).toBe(345)
  })

  it('a cover is one image to a screen reader: "Cover for …"', async () => {
    await render(hero())
    expect(screen.getByLabelText('Cover for Vinyl Night')).toBeTruthy()
    expect(screen.queryByTestId('scene-hero-stamp')).toBeNull()
  })

  // Negative control: with a cover there is no stamp (above); without one, never a grey box.
  it('no cover is the stamp poster: the date in Geist Mono, the category’s glyph and the venue, read as the date and place', async () => {
    await render(hero({ playlist: [] }))
    const stamp = screen.getByTestId('scene-hero-stamp')
    expect(stamp.props.accessibilityLabel).toBe('Tuesday 11 November, Toit · Indiranagar')
    for (const t of ['TUE', '11', 'NOV']) expect(screen.getByText(t, { includeHiddenElements: true })).toBeTruthy()
    expect(JSON.stringify(screen.toJSON())).toContain('music-2')
  })

  it('a long venue line stays on one line in its own slot', async () => {
    await render(hero({ playlist: [], venueLine: 'The Courtyard at Jayamahal Palace Hotel · Thiruvananthapuram' }))
    expect(screen.getByText(/Jayamahal/, { includeHiddenElements: true }).props.numberOfLines).toBe(1)
  })
})

/*
 * TG-07 (B-S8, D18): the day strip opened on an offset between two chips near the end of a run (initialScrollIndex clamps
 * to the end), so its first chip was cut mid-word. Negative control: `first * slot` (the old offset) fails the end case.
 */
describe('the day strip opens on a whole chip, and fades at its edge', () => {
  const SLOT = 72 + 8 // DAY_WIDTH + SPACE.sm

  it('opens on the day before the current one when the list can reach it', () => {
    expect(dayStripOffset(3, 31, 350)).toBe(3 * SLOT)
  })

  it('near the end, opens on the furthest whole chip the list reaches, never between two', () => {
    // 6 chips, 470 wide content, 350 viewport: the list reaches 120, which is 1 whole chip (80) and part of the next.
    const offset = dayStripOffset(4, 6, 350)
    expect(offset % SLOT).toBe(0)
    expect(offset).toBe(SLOT)
    expect(dayStripOffset(0, 6, 350)).toBe(0)
  })

  it('snaps by chip and draws the edge fade over a scrolling strip', async () => {
    const days = Array.from({ length: 8 }, (_, i) => ({ date: `2026-10-${String(10 + i)}`, cancelled: false, startTime: '', endTime: '', cancelledAt: null }))
    await render(<SceneDayStrip days={{ days, dayCount: 8, daysFrom: 1, dayNumber: 7 } as never} today testID="strip" />)
    expect(screen.getByTestId('strip').props.snapToInterval).toBe(SLOT)
    expect(screen.getByTestId('strip-fade', { includeHiddenElements: true })).toBeTruthy()
  })
})

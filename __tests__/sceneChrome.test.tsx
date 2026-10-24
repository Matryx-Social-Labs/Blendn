/**
 * The Scene's chrome and hero (Flow 3 `scene`): back plus three media circles with the ⋯ holding Report; the glass
 * bar that mounts at 8 pt of scroll; the hero's pills and words; no cover is the brand orbs.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import React from 'react'
import { Platform, StyleSheet } from 'react-native'
import { getAnimatedStyle, makeMutable } from 'react-native-reanimated'

import { SceneBar, sceneBarTitleSpan } from '../components/scene/SceneBar'
import { SceneHero } from '../components/scene/SceneHero'
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

describe('SceneHero', () => {
  const hero = (props: Partial<React.ComponentProps<typeof SceneHero>> = {}) => (
    <SceneHero source={{ uri: 'https://example.com/c.jpg' }} title="Vinyl Night" when="Sat 24 Oct · 9 PM" place="at Toit, Bengaluru" {...props} />
  )

  it('is one header for a screen reader: what, when, the pills, where', async () => {
    await render(hero({ pills: [{ key: 'age', text: '21+' }, { key: 'people', text: '42 going' }] }))
    const header = screen.getByRole('header')
    expect(header.props.accessibilityLabel).toBe('Vinyl Night. Sat 24 Oct · 9 PM. 21+. 42 going. at Toit, Bengaluru')
  })

  it('is 420 tall, with the head and foot scrims that carry the circles and the words', async () => {
    await render(hero())
    expect(screen.getByTestId('scene-hero').props.style).toEqual(expect.arrayContaining([expect.objectContaining({ height: 420 })]))
    expect(screen.getByTestId('scene-hero-head')).toBeTruthy()
    expect(screen.getByTestId('scene-hero-foot')).toBeTruthy()
  })

  // TG-06 (B-S3, D8). Negative control: the old orbs branch has no `scene-hero-plate`, so the first two expects fail.
  it('draws its category plate where there is no cover, not a grey box and not the brand orbs', async () => {
    await render(hero({ source: undefined, category: 'music' }))
    expect(screen.getByTestId('scene-hero-plate', { includeHiddenElements: true })).toBeTruthy()
    expect(JSON.stringify(screen.toJSON())).toContain('music-2')
    // No category: the hue's fill alone, still never an empty box.
    await render(hero({ source: undefined }))
    expect(screen.getByTestId('scene-hero-plate', { includeHiddenElements: true })).toBeTruthy()
    await render(hero({ category: 'music' }))
    expect(screen.queryByTestId('scene-hero-plate', { includeHiddenElements: true })).toBeNull()
  })

  it('a cancelled event: the DS TimeBadge strikes the time but never the middot (DS-20, B-S16), and a white Cancelled pill', async () => {
    await render(hero({ struck: true, pills: [{ key: 'cancelled', text: 'Cancelled', white: true }] }))
    const hidden = { includeHiddenElements: true }
    expect(screen.getByTestId('scene-when', hidden)).toBeTruthy()
    expect(StyleSheet.flatten(screen.getByText(' · ', hidden).props.style).textDecorationLine).toBeUndefined()
    expect(StyleSheet.flatten(screen.getByText(/^9 PM$/, hidden).props.style).textDecorationLine).toBe('line-through')
    expect(screen.getByTestId('scene-pill-cancelled')).toBeTruthy()
  })

  it('shows the live badge as the DS TimeBadge', async () => {
    await render(hero({ when: 'Live' }))
    expect(screen.getByTestId('scene-when-dot', { includeHiddenElements: true })).toBeTruthy()
  })
})

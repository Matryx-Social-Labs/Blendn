/**
 * The Scene's chrome and hero (Flow 3 `scene`): back plus three media circles with the ⋯ holding Report; the glass
 * bar that mounts at 8 pt of scroll; the hero's pills and words; no cover is the brand orbs.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import React from 'react'
import { Platform } from 'react-native'
import { makeMutable } from 'react-native-reanimated'

import { SceneBar } from '../components/scene/SceneBar'
import { SceneHero } from '../components/scene/SceneHero'
import { H } from '../lib/haptics'

jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 47, bottom: 34, left: 0, right: 0 }) }))
jest.mock('expo-linear-gradient', () => {
  const { View } = jest.requireActual('react-native')
  return { LinearGradient: (props: object) => <View {...props} /> }
})
jest.mock('../components/scene/SceneHeroMedia', () => ({ SceneHeroMedia: () => null }))

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

  it('mounts the glass bar only once the page has scrolled past 8 pt (never at rest)', async () => {
    const scrollY = makeMutable(0)
    await render(bar({ scrollY }))
    expect(screen.queryByTestId('scene-bar-glass')).toBeNull()
    await act(async () => {
      scrollY.set(20)
    })
    expect(await screen.findByTestId('scene-bar-glass')).toBeTruthy()
  })

  it('keeps the small title out of the reading order', async () => {
    await render(bar())
    expect(screen.getByTestId('scene-bar-title', { includeHiddenElements: true }).props.accessibilityElementsHidden).toBe(true)
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

  it('draws the brand orbs where there is no cover, not a grey box', async () => {
    await render(hero({ source: undefined }))
    expect(screen.getByTestId('scene-hero-orbs')).toBeTruthy()
    await render(hero())
    expect(screen.queryByTestId('scene-hero-orbs')).toBeNull()
  })

  it('a cancelled event: the date struck through and a white Cancelled pill', async () => {
    await render(hero({ struck: true, pills: [{ key: 'cancelled', text: 'Cancelled', white: true }] }))
    expect(screen.getByText('Sat 24 Oct · 9 PM', { includeHiddenElements: true }).props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ textDecorationLine: 'line-through' })])
    )
    expect(screen.getByTestId('scene-pill-cancelled')).toBeTruthy()
    expect(screen.queryByTestId('scene-when')).toBeNull()
  })

  it('shows the live badge as the DS TimeBadge', async () => {
    await render(hero({ when: 'Live' }))
    expect(screen.getByTestId('scene-when-dot', { includeHiddenElements: true })).toBeTruthy()
  })
})

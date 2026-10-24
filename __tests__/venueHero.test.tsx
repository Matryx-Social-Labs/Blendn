/*
 * The venue hero's stretch (DS #32, audit P2): pulled past the top, the picture
 * grows from its foot by exactly what the bounce uncovers, and is still at rest.
 */
import { act, render, screen } from '@testing-library/react-native'
import React from 'react'
import { Animated, Dimensions, StyleSheet } from 'react-native'

import { PLATE_FADE_BY, plateFade, stretchScale, VENUE_HERO_HEIGHT, VenueHero } from '../components/venue/VenueHero'
import { PageWash, PAGE_WASH } from '../components/ui/GradientFill'
import { COLOR } from '../lib/design/tokens'

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'))
jest.mock('react-native-reanimated', () => {
  const actual = jest.requireActual('react-native-reanimated')
  return { ...actual, __esModule: true, useReducedMotion: jest.fn(() => true) }
})
jest.mock('expo-linear-gradient', () => {
  const { View } = jest.requireActual('react-native')
  return { LinearGradient: (props: object) => <View {...props} /> }
})

const live = { open: true, closedReason: null, eventId: null, liveNow: '5-9' as const, youAreLive: false }
const hero = (scrollY?: Animated.Value) => (
  <VenueHero hero={{ kind: 'plate', plate: 'bar' }} name="Toit" typeLabel="Brewery" area="Indiranagar" km={0.35} live={live} onZero={jest.fn()} scrollY={scrollY} />
)

describe('stretchScale', () => {
  it('is 1 at rest and while scrolled down, and 1 + pull / height past the top', () => {
    const y = new Animated.Value(0)
    const scale = stretchScale(y)
    const at = (v: number) => {
      y.setValue(v)
      return (scale as unknown as { __getValue: () => number }).__getValue()
    }
    expect(at(0)).toBe(1)
    expect(at(200)).toBe(1)
    expect(at(-VENUE_HERO_HEIGHT / 2)).toBeCloseTo(1.5)
    expect(at(-VENUE_HERO_HEIGHT)).toBeCloseTo(2)
    // Past the end of the range it keeps covering rather than stopping short.
    expect(at(-VENUE_HERO_HEIGHT * 1.5)).toBeCloseTo(2.5)
  })
})

describe('the hero', () => {
  it('stretches from its foot, and under Reduce Motion too: it follows the finger', async () => {
    await render(hero(new Animated.Value(0)))
    const style = StyleSheet.flatten(screen.getByTestId('venue-hero-media').props.style)
    expect(style.transformOrigin).toBe('bottom')
    expect(style.transform).toHaveLength(1)
  })

  it('without a scroll offset (a gallery) it is still', async () => {
    await render(hero())
    expect(StyleSheet.flatten(screen.getByTestId('venue-hero-media').props.style).transform).toBeUndefined()
  })

  it('is not clipped, so the stretched picture can grow past its top edge', async () => {
    await render(hero(new Animated.Value(0)))
    expect(StyleSheet.flatten(screen.getByTestId('venue-hero').props.style).overflow).toBeUndefined()
  })
})

describe('the hero as it scrolls under the circles (r7 L2, L3)', () => {
  const value = (v: Animated.AnimatedInterpolation<number>) => (v as unknown as { __getValue: () => number }).__getValue()

  it('a plate is gone by a quarter of the hero, before its glyph reaches the back and share circles', () => {
    const y = new Animated.Value(0)
    const fade = plateFade(y)
    expect(value(fade)).toBe(1)
    y.setValue(PLATE_FADE_BY / 2)
    expect(value(fade)).toBeCloseTo(0.5)
    y.setValue(PLATE_FADE_BY)
    expect(value(fade)).toBe(0)
    expect(PLATE_FADE_BY).toBe(VENUE_HERO_HEIGHT / 4)
  })

  it('a photograph does not fade', async () => {
    await render(
      <VenueHero hero={{ kind: 'cover', uri: 'https://x/y.jpg' }} name="Toit" typeLabel="Brewery" area={null} km={null} live={live} onZero={jest.fn()} scrollY={new Animated.Value(0)} />
    )
    expect(StyleSheet.flatten(screen.getByTestId('venue-hero-media').props.style).opacity).toBeUndefined()
  })

  it('the wash under the hero rises out of the ink the hero ends on, with no step', async () => {
    await render(<PageWash testID="w" color="#3A2A20" />)
    const wash = screen.getByTestId('w')
    expect(wash.props.colors[0]).toBe(COLOR.ink)
    expect(wash.props.colors[wash.props.colors.length - 1]).toBe(COLOR.ink)
    expect(wash.props.locations).toEqual([0, PAGE_WASH.leadIn, 1])
  })
})

describe('at AX XXXL (GO-05, audit C5/C37)', () => {
  const window = Dimensions.get('window')
  const atScale = (fontScale: number) => act(async () => Dimensions.set({ window: { ...window, fontScale }, screen: { ...window, fontScale } }))
  afterEach(() => atScale(2))
  /** The header reads what the hero shows: the name, then its line. */
  const words = () => screen.getByRole('header').props.accessibilityLabel as string

  it('the plate’s glyph rises to the top third, out of the way of the words that grow up into it', async () => {
    await atScale(1)
    await render(hero(new Animated.Value(0)))
    expect(StyleSheet.flatten(screen.getByTestId('venue-hero-plate-frame', { includeHiddenElements: true }).props.style).top).toBe(0)
    await screen.unmount()
    await atScale(3.571)
    await render(hero(new Animated.Value(0)))
    const frame = StyleSheet.flatten(screen.getByTestId('venue-hero-plate-frame', { includeHiddenElements: true }).props.style)
    // A frame from -H/3 to the foot is centred on H/3: the glyph's centre is a third of the way down.
    expect(frame.top).toBeCloseTo(-VENUE_HERO_HEIGHT / 3)
    expect(frame.bottom).toBe(0)
  })

  it('drops the address (Where has it in full) and caps what is left', async () => {
    await atScale(3.571)
    await render(hero())
    expect(words()).not.toContain('Indiranagar')
    expect(words()).toContain('Brewery')
    // Every outermost Text is capped (a nested run is drawn at its parent's scale).
    const uncapped: string[] = []
    const walk = (n: { type: string; props: Record<string, unknown>; children: unknown[] | null }) => {
      if (n.type === 'Text') return void (n.props.maxFontSizeMultiplier ? null : uncapped.push(JSON.stringify(n.children)))
      ;(n.children ?? []).forEach((c) => typeof c === 'object' && c && walk(c as never))
    }
    walk(screen.toJSON() as never)
    expect(uncapped).toEqual([])
  })

  it('at ordinary sizes the address stays', async () => {
    await atScale(1)
    await render(hero())
    expect(words()).toContain('Indiranagar')
  })
})

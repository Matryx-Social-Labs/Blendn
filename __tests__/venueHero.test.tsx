/*
 * The venue hero's stretch (DS #32, audit P2): pulled past the top, the picture
 * grows from its foot by exactly what the bounce uncovers, and is still at rest.
 */
import { render, screen } from '@testing-library/react-native'
import React from 'react'
import { Animated, StyleSheet } from 'react-native'

import { stretchScale, VENUE_HERO_HEIGHT, VenueHero } from '../components/venue/VenueHero'

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

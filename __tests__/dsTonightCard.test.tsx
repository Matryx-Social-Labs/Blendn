/*
 * <TonightCard> (guidelines/components/TonightCard.html): Tonight's deck. The
 * hero EventCard with a 2 pt ink outline, up to two fanned back-cards (−5°
 * and 4°), pips. A swipe moves the deck on M.snap and H.select plays as the
 * card settles; Reduce Motion cuts. A screen reader adjusts it.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import React from 'react'
import { StyleSheet } from 'react-native'
import { getByGestureTestId } from 'react-native-gesture-handler/jest-utils'
import * as Reanimated from 'react-native-reanimated'

import { TonightCard } from '../components/ds/TonightCard'
import { COLOR, RADIUS, SPRING } from '../lib/design/tokens'
import { H } from '../lib/haptics'

jest.mock('react-native-reanimated', () => {
  const actual = jest.requireActual('react-native-reanimated')
  return {
    ...actual,
    __esModule: true,
    useReducedMotion: jest.fn(() => false),
    withSpring: jest.fn(actual.withSpring),
    withTiming: jest.fn(actual.withTiming),
  }
})
jest.mock('expo-linear-gradient', () => {
  const { View } = jest.requireActual('react-native')
  return { LinearGradient: (props: object) => <View {...props} /> }
})

const reduceMotion = Reanimated.useReducedMotion as jest.Mock
const flat = (id: string) => StyleSheet.flatten(screen.getByTestId(id, { includeHiddenElements: true }).props.style)
const query = (id: string) => screen.queryByTestId(id, { includeHiddenElements: true })

const EVENT = (title: string) => ({ title, time: '9 PM', venue: 'Toit', distance: '1.2 km', going: 42 })
const DECK = [EVENT('Vinyl Night'), EVENT('Open mic'), EVENT('Quiz night')]

let select: jest.SpyInstance
beforeEach(() => {
  reduceMotion.mockReturnValue(false)
  select = jest.spyOn(H, 'select').mockImplementation(() => {})
})
afterEach(() => jest.useRealTimers())

const draw = (props: Partial<React.ComponentProps<typeof TonightCard>> = {}) =>
  render(<TonightCard events={DECK} index={0} onIndexChange={jest.fn()} onOpen={jest.fn()} width={322} height={280} testID="t" {...props} />)

const swipe = (dx: number, vx = 0) =>
  act(async () => {
    const h = getByGestureTestId('t-swipe').handlers as unknown as Record<string, (e: object, ok?: boolean) => void>
    h.onUpdate({ translationX: dx })
    h.onEnd({ translationX: dx, velocityX: vx }, true)
  })

describe('the deck', () => {
  it('one card: no fan, no pips', async () => {
    await draw({ events: DECK.slice(0, 1) })
    expect(query('t-back-0')).toBeNull()
    expect(query('t-pips')).toBeNull()
  })

  it('three: two back-cards at −5° and 4°, surface, and pips with the first one long', async () => {
    await draw()
    expect(flat('t-back-0')).toMatchObject({ backgroundColor: COLOR.surface, borderRadius: RADIUS.card })
    expect(flat('t-back-0').transform).toContainEqual({ rotate: '-5deg' })
    expect(flat('t-back-1').transform).toContainEqual({ rotate: '4deg' })
    expect(flat('t-pip-0').width).toBe(16)
    expect(flat('t-pip-1').width).toBe(6)
  })

  it('two: one back-card', async () => {
    await draw({ events: DECK.slice(0, 2) })
    expect(query('t-back-0')).toBeTruthy()
    expect(query('t-back-1')).toBeNull()
  })

  it('the top card is the hero EventCard with a 2 pt ink outline', async () => {
    await draw()
    expect(flat('t-top')).toMatchObject({ borderWidth: 2, borderColor: COLOR.ink, borderRadius: RADIUS.card + 2 })
    expect(screen.getByText('Vinyl Night', { includeHiddenElements: true })).toBeTruthy()
    expect(screen.queryByText('Open mic', { includeHiddenElements: true })).toBeNull()
  })
})

describe('moving it', () => {
  it('a swipe past 56 pt moves to the next card and plays H.select as it settles', async () => {
    jest.useFakeTimers()
    const onIndexChange = jest.fn()
    await draw({ onIndexChange })
    jest.mocked(Reanimated.withSpring).mockClear()
    await swipe(-80)
    expect(Reanimated.withSpring).toHaveBeenCalledWith(-322, expect.objectContaining({ stiffness: SPRING.snap.stiffness }), expect.any(Function))
    expect(select).not.toHaveBeenCalled()
    await act(async () => jest.advanceTimersByTime(1500))
    expect(onIndexChange).toHaveBeenCalledWith(1)
    expect(select).toHaveBeenCalledTimes(1)
  })

  it('a short drag springs back on M.snap and moves nothing', async () => {
    const onIndexChange = jest.fn()
    await draw({ onIndexChange })
    jest.mocked(Reanimated.withSpring).mockClear()
    await swipe(-20)
    expect(Reanimated.withSpring).toHaveBeenCalledWith(0, expect.objectContaining({ stiffness: SPRING.snap.stiffness }))
    expect(onIndexChange).not.toHaveBeenCalled()
    expect(select).not.toHaveBeenCalled()
  })

  it('a pan the system cancels moves nothing, however far it went', async () => {
    // Reduce Motion settles at once, so a wrongly accepted cancel would show here.
    reduceMotion.mockReturnValue(true)
    const onIndexChange = jest.fn()
    await draw({ onIndexChange })
    await act(async () => {
      const h = getByGestureTestId('t-swipe').handlers as unknown as Record<string, (e: object, ok?: boolean) => void>
      h.onUpdate({ translationX: -120 })
      h.onEnd({ translationX: -120, velocityX: 0 }, false)
    })
    await act(async () => {})
    expect(onIndexChange).not.toHaveBeenCalled()
  })

  it('a flick from the card the parent moved to: from 1 it goes to 2', async () => {
    jest.useFakeTimers()
    const onIndexChange = jest.fn()
    await draw({ onIndexChange, index: 1 })
    await swipe(-20, -800)
    await act(async () => jest.advanceTimersByTime(1500))
    expect(onIndexChange).toHaveBeenCalledWith(2)
  })

  it('nothing before the first card', async () => {
    const onIndexChange = jest.fn()
    await draw({ onIndexChange })
    await swipe(120)
    expect(onIndexChange).not.toHaveBeenCalled()
  })

  it('Reduce Motion: the deck cuts to the next card', async () => {
    reduceMotion.mockReturnValue(true)
    const onIndexChange = jest.fn()
    await draw({ onIndexChange })
    jest.mocked(Reanimated.withSpring).mockClear()
    await swipe(-80)
    await act(async () => {})
    expect(Reanimated.withSpring).not.toHaveBeenCalled()
    expect(onIndexChange).toHaveBeenCalledWith(1)
    expect(select).toHaveBeenCalledTimes(1)
  })

  it('a tap opens the event, silently', async () => {
    const onOpen = jest.fn()
    await draw({ onOpen, index: 1 })
    await fireEvent.press(screen.getByTestId('t-card', { includeHiddenElements: true }))
    expect(onOpen).toHaveBeenCalledWith(1)
    expect(select).not.toHaveBeenCalled()
  })
})

describe('a screen reader', () => {
  it('hears the card and where it is in the deck, and adjusts it', async () => {
    const onIndexChange = jest.fn()
    const onOpen = jest.fn()
    await draw({ onIndexChange, onOpen })
    const deck = screen.getByLabelText('Vinyl Night, 9 PM, at Toit, 1.2 km, 42 going')
    expect(deck.props.accessibilityRole).toBe('adjustable')
    // The value is what VoiceOver speaks after each adjust; the actions are named for TalkBack's menu.
    expect(deck.props.accessibilityValue).toEqual({ text: '1 of 3' })
    expect(deck.props.accessibilityActions).toEqual(
      expect.arrayContaining([
        { name: 'increment', label: 'Next event' },
        { name: 'decrement', label: 'Previous event' },
      ])
    )
    await act(async () => deck.props.onAccessibilityAction({ nativeEvent: { actionName: 'increment' } }))
    expect(onIndexChange).toHaveBeenCalledWith(1)
    await act(async () => deck.props.onAccessibilityAction({ nativeEvent: { actionName: 'decrement' } }))
    expect(onIndexChange).toHaveBeenCalledTimes(1)
    await act(async () => deck.props.onAccessibilityAction({ nativeEvent: { actionName: 'activate' } }))
    expect(onOpen).toHaveBeenCalledWith(0)
  })
})

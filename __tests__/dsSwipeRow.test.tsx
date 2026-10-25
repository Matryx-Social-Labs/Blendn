/*
 * <SwipeRow> (guidelines/components/SwipeRow.html, ROUND3 D 5.11): a row
 * dragged left reveals 72 pt actions under it; it settles open past halfway
 * and springs back short of it on M.snap; H.threshold as it crosses halfway;
 * the actions are the row's custom actions, so nobody has to swipe; Reduce
 * Motion snaps without the spring.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import React from 'react'
import { StyleSheet, Text } from 'react-native'
import { State } from 'react-native-gesture-handler'
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils'
import * as Reanimated from 'react-native-reanimated'

import { SWIPE_ACTION_WIDTH, SwipeRow, type SwipeAction } from '../components/ds/SwipeRow'
import { COLOR, SPRING } from '../lib/design/tokens'
import { H } from '../lib/haptics'

jest.mock('react-native-reanimated', () => {
  const actual = jest.requireActual('react-native-reanimated')
  return { ...actual, __esModule: true, useReducedMotion: jest.fn(() => false), withSpring: jest.fn(actual.withSpring) }
})

const reduceMotion = Reanimated.useReducedMotion as jest.Mock
const withSpring = Reanimated.withSpring as jest.Mock
const W = SWIPE_ACTION_WIDTH * 2
const actions = (mute = jest.fn(), leave = jest.fn()): SwipeAction[] => [
  { icon: 'bell-off', label: 'Mute', onPress: mute },
  { icon: 'log-out', label: 'Leave', destructive: true, onPress: leave },
]
const row = (props: Partial<React.ComponentProps<typeof SwipeRow>> = {}) => (
  <SwipeRow actions={actions()} accessibilityLabel="Bass Thursday, Brave Turtle: that drop though, Tuesday" onPress={jest.fn()} testID="s" {...props}>
    <Text>Bass Thursday</Text>
  </SwipeRow>
)
const drag = (to: number, velocityX = 0) =>
  act(async () =>
    fireGestureHandler(getByGestureTestId('s-swipe'), [
      { state: State.BEGAN, translationX: 0 },
      { state: State.ACTIVE, translationX: 0 },
      { state: State.ACTIVE, translationX: to },
      { state: State.END, translationX: to, velocityX },
    ])
  )
const offset = () => (Reanimated.getAnimatedStyle(screen.getByTestId('s-row')) as { transform: { translateX: number }[] }).transform[0].translateX

let detent: jest.SpyInstance // H.threshold: a gesture crossing its line
beforeEach(() => {
  reduceMotion.mockReturnValue(false)
  detent = jest.spyOn(H, 'threshold').mockImplementation(() => {})
})

describe('<SwipeRow>', () => {
  it('a hold opens the same tray with H.longPress, once, and does not open the thread', async () => {
    const onPress = jest.fn()
    const onOpenChange = jest.fn()
    const longPress = jest.spyOn(H, 'longPress').mockImplementation(() => {})
    await render(row({ onPress, onOpenChange }))
    const el = screen.getByRole('button', { name: 'Bass Thursday, Brave Turtle: that drop though, Tuesday' })
    await act(async () => fireEvent(el, 'longPress'))
    expect(longPress).toHaveBeenCalledTimes(1)
    expect(onOpenChange).toHaveBeenLastCalledWith(true)
    expect(onPress).not.toHaveBeenCalled()
  })

  it('an open row ignores a second hold: no second cue', async () => {
    const longPress = jest.spyOn(H, 'longPress').mockImplementation(() => {})
    await render(row({ open: true }))
    await act(async () => fireEvent(screen.getByRole('button', { name: /Bass Thursday/ }), 'longPress'))
    expect(longPress).not.toHaveBeenCalled()
  })

  it('one element: the row, with its actions in the rotor', async () => {
    const mute = jest.fn()
    await render(row({ actions: actions(mute) }))
    const el = screen.getByRole('button', { name: 'Bass Thursday, Brave Turtle: that drop though, Tuesday' })
    expect(el.props.accessibilityActions).toEqual([
      { name: 'Mute', label: 'Mute' },
      { name: 'Leave', label: 'Leave' },
    ])
    await fireEvent(el, 'accessibilityAction', { nativeEvent: { actionName: 'Mute' } })
    expect(mute).toHaveBeenCalledTimes(1)
  })

  it('the tray: 72 pt each; the destructive one on destructiveFill', async () => {
    await render(row())
    expect(StyleSheet.flatten(screen.getByTestId('s-action-1', { includeHiddenElements: true }).props.style)).toMatchObject({
      width: SWIPE_ACTION_WIDTH,
      backgroundColor: COLOR.destructiveFill,
    })
  })

  it('past halfway: H.threshold once, and it settles open on M.snap', async () => {
    const onOpenChange = jest.fn()
    await render(row({ onOpenChange }))
    await drag(-(W / 2 + 10))
    expect(detent).toHaveBeenCalledTimes(1)
    expect(withSpring).toHaveBeenLastCalledWith(-W, expect.objectContaining({ stiffness: SPRING.snap.stiffness }))
    expect(onOpenChange).toHaveBeenLastCalledWith(true)
  })

  it('short of halfway: springs back, nothing plays', async () => {
    await render(row())
    await drag(-(W / 2 - 10))
    expect(detent).not.toHaveBeenCalled()
    expect(withSpring).toHaveBeenLastCalledWith(0, expect.objectContaining({ stiffness: SPRING.snap.stiffness }))
  })

  it('open: an action runs and the row closes', async () => {
    const mute = jest.fn()
    const onOpenChange = jest.fn()
    await render(row({ actions: actions(mute), open: true, onOpenChange }))
    expect(offset()).toBe(-W)
    await fireEvent.press(screen.getByTestId('s-action-0', { includeHiddenElements: true }))
    expect(mute).toHaveBeenCalledTimes(1)
    expect(onOpenChange).toHaveBeenLastCalledWith(false)
  })

  it('open: a tap on the row closes it instead of opening the thread', async () => {
    const onPress = jest.fn()
    const onOpenChange = jest.fn()
    await render(row({ onPress, open: true, onOpenChange }))
    await fireEvent.press(screen.getByRole('button', { name: /Bass Thursday/ }))
    expect(onPress).not.toHaveBeenCalled()
    expect(onOpenChange).toHaveBeenLastCalledWith(false)
  })

  it('closed: a tap opens the thread', async () => {
    const onPress = jest.fn()
    await render(row({ onPress }))
    await fireEvent.press(screen.getByRole('button', { name: /Bass Thursday/ }))
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('controlled: an owner who keeps it closed gets it back closed after a drag', async () => {
    reduceMotion.mockReturnValue(true)
    const onOpenChange = jest.fn()
    await render(row({ open: false, onOpenChange }))
    await drag(-(W / 2 + 10))
    expect(onOpenChange).toHaveBeenLastCalledWith(true)
    expect(offset()).toBe(0)
  })

  it('a cancelled drag (a system interrupt) goes back and answers nothing', async () => {
    reduceMotion.mockReturnValue(true)
    const onOpenChange = jest.fn()
    await render(row({ onOpenChange }))
    await act(async () =>
      fireGestureHandler(getByGestureTestId('s-swipe'), [
        { state: State.BEGAN, translationX: 0 },
        { state: State.ACTIVE, translationX: 0 },
        { state: State.ACTIVE, translationX: -W },
        { state: State.CANCELLED, translationX: -W },
      ])
    )
    expect(onOpenChange).not.toHaveBeenCalled()
    expect(offset()).toBe(0)
  })

  it('Reduce Motion: the drag is kept; it snaps without the spring', async () => {
    reduceMotion.mockReturnValue(true)
    withSpring.mockClear()
    await render(row())
    await drag(-(W / 2 + 10))
    expect(withSpring).not.toHaveBeenCalled()
    expect(offset()).toBe(-W)
  })
})


describe('the release keeps the flick’s speed (audit M15)', () => {
  it('a fling hands its velocity to the spring, and the re-render that follows does not restart it', async () => {
    const onOpenChange = jest.fn()
    await render(row({ onOpenChange }))
    withSpring.mockClear()
    // A fast flick that did not even reach halfway still opens: speed decides.
    await drag(-60, -1500)
    expect(withSpring).toHaveBeenCalledWith(-W, expect.objectContaining({ velocity: -1500 }))
    // The owner's answer re-renders the row; its effect asks for the same rest and must not spring again from nothing.
    expect(withSpring.mock.calls.filter(([to]) => to === -W)).toHaveLength(1)
  })

  it('an owner who refuses (open stays false) still gets it sprung back', async () => {
    const onOpenChange = jest.fn()
    await render(row({ open: false, onOpenChange }))
    withSpring.mockClear()
    await drag(-(W / 2 + 10))
    const springs = withSpring.mock.calls.map(([to]) => to)
    expect(springs[0]).toBe(-W)
    expect(springs).toContain(0)
  })

  it('pulling past the closed edge stretches a little and pulls back, never a wall', async () => {
    await render(row())
    withSpring.mockClear()
    await act(async () =>
      fireGestureHandler(getByGestureTestId('s-swipe'), [
        { state: State.BEGAN, translationX: 0 },
        { state: State.ACTIVE, translationX: 0 },
        { state: State.ACTIVE, translationX: 80 },
      ])
    )
    expect(offset()).toBeGreaterThan(0)
    expect(offset()).toBeLessThan(80)
  })

  it('crosses its threshold with H.threshold, once per crossing, and never H.detent', async () => {
    const wrongOne = jest.spyOn(H, 'detent').mockImplementation(() => {})
    await render(row())
    await drag(-(W / 2 + 10))
    expect(detent).toHaveBeenCalledTimes(1)
    expect(wrongOne).not.toHaveBeenCalled()
  })
})

/*
 * <ReactionBar> and <ReactionPill> (guidelines/components/ReactionBar.html,
 * motion #36, #37): the six server emoji in a control-glass capsule, yours on
 * white; a tap gives or takes back; scrubbing ticks H.reaction('scrub') per
 * emoji and lets go on one; a reaction you give lands with H.reaction('land')
 * and its pill pops on M.pop; the pill reads "fire, 3, including you".
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import React from 'react'
import { Platform, StyleSheet } from 'react-native'
import { State } from 'react-native-gesture-handler'
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils'
import * as Reanimated from 'react-native-reanimated'

import { REACTION_CELL, ReactionBar, ReactionPill } from '../components/ds/ReactionBar'
import { CHAT_REACTIONS } from '../lib/chatReactions'
import { COLOR, FONT_FAMILY, SPACE, SPRING } from '../lib/design/tokens'
import { H } from '../lib/haptics'

jest.mock('react-native-reanimated', () => {
  const actual = jest.requireActual('react-native-reanimated')
  return { ...actual, __esModule: true, useReducedMotion: jest.fn(() => false), withSpring: jest.fn(actual.withSpring) }
})
jest.mock('expo-glass-effect', () => {
  const { View } = jest.requireActual('react-native')
  return { GlassView: (props: object) => <View {...props} testID="glass" />, isGlassEffectAPIAvailable: () => true, isLiquidGlassAvailable: () => true }
})

const reduceMotion = Reanimated.useReducedMotion as jest.Mock
const withSpring = Reanimated.withSpring as jest.Mock
const on = (os: 'ios' | 'android') => Object.defineProperty(Platform, 'OS', { value: os, configurable: true })
/** The centre of the i-th emoji, in the bar's own coordinates. */
const cellX = (i: number) => SPACE.xs + REACTION_CELL() * i + REACTION_CELL() / 2

let reaction: jest.SpyInstance
beforeEach(() => {
  on('ios')
  reduceMotion.mockReturnValue(false)
  reaction = jest.spyOn(H, 'reaction').mockImplementation(() => {})
})

describe('<ReactionBar>', () => {
  it('the six the server accepts, each a button; yours selected, on white', async () => {
    await render(<ReactionBar mine={['🔥']} onPick={jest.fn()} testID="r" />)
    expect(screen.getAllByRole('button').map((b) => b.props.accessibilityLabel)).toEqual([
      'React, thumbs up',
      'React, heart',
      'React, laughing',
      'React, surprised',
      'React, sad',
      'React, fire',
    ])
    expect(screen.getByRole('button', { name: 'React, fire' }).props.accessibilityState).toMatchObject({ selected: true })
    expect(StyleSheet.flatten(screen.getByTestId('r-disc-5').props.style).backgroundColor).toBe(COLOR.selectionFill)
  })

  it('a tap gives it, and it lands with H.reaction(land); taking yours back plays nothing', async () => {
    const onPick = jest.fn()
    await render(<ReactionBar mine={['🔥']} onPick={onPick} />)
    await fireEvent.press(screen.getByRole('button', { name: 'React, heart' }))
    expect(onPick).toHaveBeenLastCalledWith('❤️')
    expect(reaction).toHaveBeenCalledWith('land')
    reaction.mockClear()
    await fireEvent.press(screen.getByRole('button', { name: 'React, fire' }))
    expect(onPick).toHaveBeenLastCalledWith('🔥')
    expect(reaction).not.toHaveBeenCalled()
  })

  it('scrubbing ticks once per emoji crossed, and letting go picks the one under the finger', async () => {
    const onPick = jest.fn()
    await render(<ReactionBar mine={[]} onPick={onPick} testID="r" />)
    await act(async () =>
      fireGestureHandler(getByGestureTestId('r-scrub'), [
        { state: State.BEGAN, x: cellX(0) },
        { state: State.ACTIVE, x: cellX(0) },
        { state: State.ACTIVE, x: cellX(1) },
        { state: State.ACTIVE, x: cellX(1) + 2 },
        { state: State.ACTIVE, x: cellX(2) },
        { state: State.END, x: cellX(2) },
      ])
    )
    expect(reaction.mock.calls.filter(([p]) => p === 'scrub')).toHaveLength(2)
    expect(onPick).toHaveBeenCalledWith(CHAT_REACTIONS[2])
    expect(reaction).toHaveBeenLastCalledWith('land')
  })

  it('iOS: control glass. Android: the solid tier', async () => {
    await render(<ReactionBar mine={[]} onPick={jest.fn()} />)
    expect(screen.getByTestId('glass')).toBeTruthy()
    on('android')
    await render(<ReactionBar mine={[]} onPick={jest.fn()} />)
    expect(screen.queryByTestId('glass')).toBeNull()
  })

  it('springs in on M.snap; under Reduce Motion it fades in', async () => {
    withSpring.mockClear()
    await render(<ReactionBar mine={[]} onPick={jest.fn()} />)
    expect(withSpring).toHaveBeenCalledWith(1, expect.objectContaining({ stiffness: SPRING.snap.stiffness }))
    withSpring.mockClear()
    reduceMotion.mockReturnValue(true)
    await render(<ReactionBar mine={[]} onPick={jest.fn()} />)
    expect(withSpring).not.toHaveBeenCalled()
  })
})

describe('<ReactionPill>', () => {
  it('the emoji and a Geist Mono count past one; yours outlined; read with “including you”', async () => {
    await render(<ReactionPill emoji="🔥" count={3} mine onPress={jest.fn()} testID="p" />)
    expect(StyleSheet.flatten(screen.getByText('3').props.style).fontFamily).toBe(FONT_FAMILY.mono[500])
    expect(StyleSheet.flatten(screen.getByTestId('p').props.style).borderColor).toBe(COLOR.textPrimary)
    expect(screen.getByRole('button', { name: 'fire, 3, including you' })).toBeTruthy()
  })

  it('one: no count', async () => {
    await render(<ReactionPill emoji="😂" count={1} mine={false} />)
    expect(screen.queryByText('1')).toBeNull()
  })

  it('a tap toggles it, silently (the landing plays the haptic)', async () => {
    const onPress = jest.fn()
    await render(<ReactionPill emoji="😂" count={1} mine={false} onPress={onPress} />)
    await fireEvent.press(screen.getByRole('button'))
    expect(onPress).toHaveBeenCalledTimes(1)
    expect(reaction).not.toHaveBeenCalled()
  })

  it('#37: yours lands with a pop on M.pop; under Reduce Motion it just appears', async () => {
    withSpring.mockClear()
    await render(<ReactionPill emoji="❤️" count={1} mine landed />)
    expect(withSpring).toHaveBeenCalledWith(1, expect.objectContaining({ stiffness: SPRING.pop.stiffness }))
    withSpring.mockClear()
    reduceMotion.mockReturnValue(true)
    await render(<ReactionPill emoji="❤️" count={1} mine landed />)
    expect(withSpring).not.toHaveBeenCalled()
  })
})

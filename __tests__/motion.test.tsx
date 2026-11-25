/*
 * Motion runs on the redesign's tokens, Reduce Motion reads from its own
 * table, and ScalePress squashes on the UI thread with no haptic unless given
 * one.
 */
import { fireEvent, render, screen } from '@testing-library/react-native'
import React from 'react'
import { Text } from 'react-native'
import * as Haptics from 'expo-haptics'
import * as Reanimated from 'react-native-reanimated'

import ScalePress from '../components/motion/ScalePress'
import { DURATION, motionTokens, SPRING } from '../lib/motion'

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(async () => {}),
  selectionAsync: jest.fn(async () => {}),
  notificationAsync: jest.fn(async () => {}),
  performAndroidHapticsAsync: jest.fn(async () => {}),
}))
jest.mock('react-native-reanimated', () => {
  const actual = jest.requireActual('react-native-reanimated')
  return { ...actual, withSpring: jest.fn(actual.withSpring) }
})

describe('motionTokens', () => {
  it('uses the base values normally', () => {
    const m = motionTokens(false)
    expect([m.duration.base, m.rise.list, m.orbs.drift, m.shake.distance]).toEqual([220, 8, 40, 8])
  })

  it('lays Reduce Motion’s table over them: shorter, no rise, no drift, no shake', () => {
    const m = motionTokens(true)
    expect([m.duration.base, m.duration.long, m.rise.list, m.orbs.drift, m.shake.distance]).toEqual([200, 200, 0, 0, 0])
  })

  it('keeps what Reduce Motion must not touch: fades still fade, the hold keeps its speed', () => {
    const m = motionTokens(true)
    expect([m.duration.quick, m.duration.hold, m.shake.duration]).toEqual([160, DURATION.hold, 320])
  })
})

describe('ScalePress', () => {
  const press = async (props: Partial<React.ComponentProps<typeof ScalePress>> = {}) => {
    await render(
      <ScalePress onPress={() => {}} {...props}>
        <Text>Go</Text>
      </ScalePress>
    )
    fireEvent(screen.getByText('Go'), 'pressIn')
  }

  it('plays no haptic by default: most taps are silent', async () => {
    // It used to play `selectionAsync` on every press: a 50 ms buzz on Android.
    await press()
    for (const fn of [Haptics.impactAsync, Haptics.selectionAsync, Haptics.notificationAsync, Haptics.performAndroidHapticsAsync]) {
      expect(fn).not.toHaveBeenCalled()
    }
  })

  it('plays the haptic it is given, on press-in', async () => {
    const haptic = jest.fn()
    await press({ haptic })
    expect(haptic).toHaveBeenCalledTimes(1)
  })

  it('squashes on M.press, and Reduce Motion does not stop it', async () => {
    await press({ pressedScale: 0.9 })
    expect(Reanimated.withSpring).toHaveBeenCalledWith(
      0.9,
      expect.objectContaining({ ...SPRING.press, reduceMotion: Reanimated.ReduceMotion.Never })
    )
  })
})

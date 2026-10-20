/*
 * You're all set (audit U-H4): on the server's yes the one celebration plays, and it plays the success haptic itself as its
 * mark completes, so the haptic is never the only cue. On a refusal nothing plays here (the toast plays the one error).
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import React from 'react'
import { Pressable, Text } from 'react-native'
import * as Reanimated from 'react-native-reanimated'

import { H } from '../lib/haptics'

const mockFinish = jest.fn()
jest.mock('expo-router', () => ({ router: { replace: jest.fn(), back: jest.fn(), push: jest.fn() } }))
jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default)
jest.mock('react-native-reanimated', () => ({ ...jest.requireActual('react-native-reanimated'), __esModule: true, useReducedMotion: jest.fn(() => false) }))
jest.mock('../lib/useOnboarding', () => ({
  useOnboarding: () => ({ draft: { name: 'Sam', photos: [], interests: [] }, saving: false, finish: mockFinish, goBack: jest.fn(), jumpTo: jest.fn() }),
}))
jest.mock('../components/OptimizedImage', () => ({ OptimizedImage: () => null }))
jest.mock('../components/onboarding/OnboardingScreen', () => {
  const { Pressable, Text, View } = jest.requireActual('react-native')
  return {
    OnboardingScreen: ({ onContinue, children }: { onContinue: () => void; children: React.ReactNode }) => (
      <View>
        {children}
        <Pressable accessibilityRole="button" accessibilityLabel="Start" onPress={onContinue}>
          <Text>Start</Text>
        </Pressable>
      </View>
    ),
  }
})
jest.mock('expo-linear-gradient', () => ({ LinearGradient: jest.requireActual('react-native').View }))
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }))

import { router } from 'expo-router'
import ReadyScreen from '../app/onboarding/ready'

const rm = Reanimated.useReducedMotion as jest.Mock
const press = async () => {
  await act(async () => fireEvent.press(screen.getByLabelText('Start')))
}

let success: jest.SpyInstance
let error: jest.SpyInstance
beforeEach(() => {
  jest.useFakeTimers()
  jest.clearAllMocks()
  rm.mockReturnValue(false)
  success = jest.spyOn(H, 'success').mockImplementation(() => {})
  error = jest.spyOn(H, 'error').mockImplementation(() => {})
})
afterEach(() => jest.useRealTimers())

it('on the server’s yes the celebration mounts over the screen, and the screen plays no haptic of its own', async () => {
  mockFinish.mockResolvedValue(true)
  await render(<ReadyScreen />)
  expect(screen.queryByTestId('ready-moment')).toBeNull()
  await press()
  expect(screen.getByTestId('ready-moment')).toBeTruthy()
  expect(success).not.toHaveBeenCalled()
  expect(router.replace).not.toHaveBeenCalled()
})

it('the success lands as the mark completes, once, and the replace to Bring your friends follows at 1.3 s', async () => {
  mockFinish.mockResolvedValue(true)
  await render(<ReadyScreen />)
  await press()
  await act(async () => jest.advanceTimersByTime(600))
  expect(success).toHaveBeenCalledTimes(1)
  expect(success).toHaveBeenCalledWith({ important: true })
  await act(async () => jest.advanceTimersByTime(800))
  expect(router.replace).toHaveBeenCalledWith('/onboarding/friends')
  expect(success).toHaveBeenCalledTimes(1)
})

it('Reduce Motion: the mark fades, the haptic is at once, the replace follows at 500 ms', async () => {
  rm.mockReturnValue(true)
  mockFinish.mockResolvedValue(true)
  await render(<ReadyScreen />)
  await press()
  await act(async () => jest.advanceTimersByTime(10))
  expect(success).toHaveBeenCalledTimes(1)
  await act(async () => jest.advanceTimersByTime(500))
  expect(router.replace).toHaveBeenCalledWith('/onboarding/friends')
})

it('a refusal stays on the screen: no celebration, no replace, and no haptic from here (the toast plays the error)', async () => {
  mockFinish.mockResolvedValue(false)
  await render(<ReadyScreen />)
  await press()
  await act(async () => jest.advanceTimersByTime(2000))
  expect(screen.queryByTestId('ready-moment')).toBeNull()
  expect(router.replace).not.toHaveBeenCalled()
  expect(success).not.toHaveBeenCalled()
  expect(error).not.toHaveBeenCalled()
})

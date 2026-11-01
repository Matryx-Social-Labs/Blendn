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
let mockDraft: Record<string, unknown> = { name: 'Sam', photos: [], interests: [] }
let mockUser: { name?: string } | null = null
jest.mock('expo-router', () => ({ router: { replace: jest.fn(), back: jest.fn(), push: jest.fn() } }))
jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default)
jest.mock('react-native-reanimated', () => ({ ...jest.requireActual('react-native-reanimated'), __esModule: true, useReducedMotion: jest.fn(() => false) }))
jest.mock('../lib/useOnboarding', () => ({
  useOnboarding: () => ({ draft: mockDraft, saving: false, finish: mockFinish, goBack: jest.fn() }),
}))
jest.mock('../lib/useAuth', () => ({ useAuth: () => ({ user: mockUser }) }))
jest.mock('../components/OptimizedImage', () => ({ OptimizedImage: () => null }))
jest.mock('../components/onboarding/OnboardingScreen', () => {
  const { Pressable, Text, View } = jest.requireActual('react-native')
  return {
    OnboardingScreen: ({
      title,
      titleAccent,
      onContinue,
      secondaryLabel,
      onSecondary,
      children,
    }: {
      title: string
      titleAccent?: string
      onContinue: () => void
      secondaryLabel?: string
      onSecondary?: () => void
      children: React.ReactNode
    }) => (
      <View>
        <Text testID="title">{`${title}${titleAccent ?? ''}`}</Text>
        {children}
        <Pressable accessibilityRole="button" accessibilityLabel="Start" onPress={onContinue}>
          <Text>Start</Text>
        </Pressable>
        {secondaryLabel ? (
          <Pressable accessibilityRole="button" accessibilityLabel={secondaryLabel} onPress={onSecondary}>
            <Text>{secondaryLabel}</Text>
          </Pressable>
        ) : null}
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
  mockDraft = { name: 'Sam', photos: [], interests: [] }
  mockUser = null
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

describe('the card (GO-02, audit A3)', () => {
  it('with no name in the draft it shows the account’s name, and with no photo the person’s creature, never "Your name"', async () => {
    mockDraft = { photos: [], interests: [] }
    mockUser = { name: 'Maya' }
    await render(<ReadyScreen />)
    expect(screen.getByText('Maya')).toBeTruthy()
    expect(screen.queryByText('Your name')).toBeNull()
    expect(screen.getByTestId('ready-avatar', { includeHiddenElements: true })).toBeTruthy()
  })

  it('the draft’s name wins over the account’s', async () => {
    mockUser = { name: 'Maya' }
    await render(<ReadyScreen />)
    expect(screen.getByText('Sam')).toBeTruthy()
    expect(screen.queryByText('Maya')).toBeNull()
  })

  it('with no name anywhere it draws no placeholder name', async () => {
    mockDraft = { photos: [], interests: [] }
    await render(<ReadyScreen />)
    expect(screen.queryByText('Your name')).toBeNull()
    expect(screen.getByTestId('ready-avatar', { includeHiddenElements: true })).toBeTruthy()
  })
})

it('says the chosen intent with the tile\'s own words under "Why you go out", and nothing when there is none', async () => {
  mockDraft = { name: 'Sam', photos: [], interests: [], intent_default: ['just_here'] }
  await render(<ReadyScreen />)
  expect(screen.getByLabelText('Why you go out, Just here for the event')).toBeTruthy()
  await screen.unmount()
  mockDraft = { name: 'Sam', photos: [], interests: [] }
  await render(<ReadyScreen />)
  expect(screen.queryByText('Why you go out')).toBeNull()
})

describe('the payoff (Flow 2, SCRUM-1002)', () => {
  it('greets by first name only: "You’re in, Émilie."', async () => {
    mockDraft = { name: 'Émilie Tremblay', photos: [], interests: [] }
    await render(<ReadyScreen />)
    expect(screen.getByTestId('title').props.children).toBe('You’re in, Émilie.')
  })

  it('without a name it still reads as a sentence (control for the comma)', async () => {
    mockDraft = { photos: [], interests: [] }
    await render(<ReadyScreen />)
    expect(screen.getByTestId('title').props.children).toBe('You’re in.')
  })

  it('Edit my details finishes, then opens the one edit screen over the tabs, not step 1', async () => {
    mockFinish.mockResolvedValue(true)
    await render(<ReadyScreen />)
    await act(async () => fireEvent.press(screen.getByLabelText('Edit my details')))
    expect(mockFinish).toHaveBeenCalledTimes(1)
    expect(router.replace).toHaveBeenCalledWith('/(tabs)/events')
    expect(router.push).toHaveBeenCalledWith('/edit-profile')
    expect(screen.queryByTestId('ready-moment')).toBeNull()
  })

  it('Edit my details stays put when the server says no, as Start does', async () => {
    mockFinish.mockResolvedValue(false)
    await render(<ReadyScreen />)
    await act(async () => fireEvent.press(screen.getByLabelText('Edit my details')))
    expect(router.replace).not.toHaveBeenCalled()
    expect(router.push).not.toHaveBeenCalled()
  })

  it('once one way out has gone, the other does nothing: one PUT, one navigation', async () => {
    let resolve!: (ok: boolean) => void
    mockFinish.mockReturnValue(new Promise<boolean>((r) => (resolve = r)))
    await render(<ReadyScreen />)
    await act(async () => fireEvent.press(screen.getByLabelText('Edit my details')))
    await act(async () => fireEvent.press(screen.getByLabelText('Start')))
    await act(async () => resolve(true))
    expect(mockFinish).toHaveBeenCalledTimes(1)
    expect(screen.queryByTestId('ready-moment')).toBeNull()
    expect(router.push).toHaveBeenCalledWith('/edit-profile')
  })
})

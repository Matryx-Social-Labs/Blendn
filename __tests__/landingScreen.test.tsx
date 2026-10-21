/*
 * `/` (Flow 1 landing 01 to 10): auth resolving (the mark alone), unreachable (Try again, answered once when it fails
 * again), the three ways in on the glass dock, Google and Apple busy (the others dim), a refusal inline with its one
 * H.error (a cancelled chooser has none), and the session-ended notice.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import React from 'react'
import { Platform, StyleSheet } from 'react-native'

import { H } from '../lib/haptics'

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'))
const mockAuth = jest.fn()
const mockRetry = jest.fn()
const mockGoogle = jest.fn()
const mockSignInWithGoogle = jest.fn()
const mockNotice = jest.fn()
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }))
jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default)
jest.mock('../lib/perf', () => ({ ScreenProfiler: ({ children }: { children: React.ReactNode }) => children }))
jest.mock('../lib/logger', () => ({ Logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } }))
jest.mock('../lib/useAuth', () => ({
  useAuth: () => mockAuth(),
  retryAuth: () => mockRetry(),
  signInWithGoogle: (...args: unknown[]) => mockSignInWithGoogle(...args),
  signInWithApple: jest.fn(),
}))
jest.mock('../lib/sessionEvents', () => ({
  SESSION_ENDED_NOTICE: 'You were signed out. Sign in again to continue.',
  consumeSessionEndedNotice: () => mockNotice(),
}))
jest.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: { configure: jest.fn(), hasPlayServices: jest.fn(), signIn: (...args: unknown[]) => mockGoogle(...args) },
  statusCodes: { SIGN_IN_CANCELLED: 'CANCELLED', IN_PROGRESS: 'IN_PROGRESS', PLAY_SERVICES_NOT_AVAILABLE: 'NO_PLAY' },
}))
jest.mock('expo-apple-authentication', () => {
  const { View } = jest.requireActual('react-native')
  return {
    isAvailableAsync: jest.fn(async () => true),
    signInAsync: jest.fn(),
    AppleAuthenticationButton: (props: object) => <View testID="apple-button" {...props} />,
    AppleAuthenticationButtonType: { SIGN_IN: 0 },
    AppleAuthenticationButtonStyle: { WHITE: 0 },
    AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
  }
})
jest.mock('../components/friends/PendingInvite', () => {
  const { Text } = jest.requireActual('react-native')
  return { PendingInvite: () => <Text>Priya invited you</Text> }
})

import { router } from 'expo-router'
import Index from '../app/index'

const signedOut = { user: null, loading: false, unreachable: false }
const on = (os: 'ios' | 'android') => Object.defineProperty(Platform, 'OS', { value: os, configurable: true })
let error: jest.SpyInstance
beforeEach(() => {
  jest.clearAllMocks()
  jest.useFakeTimers()
  on('ios')
  mockAuth.mockReturnValue(signedOut)
  mockNotice.mockResolvedValue(false)
  error = jest.spyOn(H, 'error').mockImplementation(() => {})
  jest.spyOn(H, 'primary').mockImplementation(() => {})
})
afterEach(() => jest.useRealTimers())

const draw = async () => {
  await render(<Index />)
  await act(async () => {})
}
const google = () => screen.getByLabelText('Continue with Google')

describe('holding states', () => {
  it('auth resolving is the mark alone, announced as loading, with no way in', async () => {
    mockAuth.mockReturnValue({ ...signedOut, loading: true })
    await draw()
    expect(screen.getByTestId('auth-resolving').props.accessibilityState).toMatchObject({ busy: true })
    expect(screen.queryByLabelText('Continue with Google')).toBeNull()
  })

  it('a signed-in person sees the same frame until the root layout routes them', async () => {
    mockAuth.mockReturnValue({ ...signedOut, user: { id: 'u1' } })
    await draw()
    expect(screen.getByTestId('auth-resolving')).toBeTruthy()
  })

  it('unreachable keeps the session and offers Try again, not sign-in', async () => {
    mockAuth.mockReturnValue({ ...signedOut, unreachable: true })
    await draw()
    expect(screen.getByText('Can’t reach Blend’n')).toBeTruthy()
    expect(screen.getByText('You’re still signed in. Check your connection and try again.')).toBeTruthy()
    expect(screen.queryByLabelText('Continue with Google')).toBeNull()
  })

  it('Try again that fails again is answered once; one that works is silent', async () => {
    mockAuth.mockReturnValue({ ...signedOut, unreachable: true })
    mockRetry.mockResolvedValue({ unreachable: true })
    await draw()
    await fireEvent.press(screen.getByLabelText('Try again'))
    expect(mockRetry).toHaveBeenCalledTimes(1)
    expect(error).toHaveBeenCalledTimes(1)
    mockRetry.mockResolvedValue({ unreachable: false })
    await fireEvent.press(screen.getByLabelText('Try again'))
    expect(error).toHaveBeenCalledTimes(1)
  })
})

describe('the ways in', () => {
  it('iOS: Google, Apple, then email, and the legal line', async () => {
    await draw()
    expect(google()).toBeTruthy()
    expect(screen.getByTestId('apple-button')).toBeTruthy()
    expect(screen.getByLabelText('Continue with email')).toBeTruthy()
    expect(screen.getByText(/By continuing you/)).toBeTruthy()
    expect(screen.getByText('Same place. Same vibe. Instant connections.')).toBeTruthy()
    expect(screen.getByText('Priya invited you')).toBeTruthy()
  })

  it('Android has no Apple button', async () => {
    on('android')
    await draw()
    expect(screen.queryByTestId('apple-button')).toBeNull()
    expect(google()).toBeTruthy()
  })

  it('email carries the session-ended notice to the form', async () => {
    mockNotice.mockResolvedValue(true)
    await draw()
    expect(screen.getByText('You were signed out. Sign in again to continue.')).toBeTruthy()
    await fireEvent.press(screen.getByLabelText('Continue with email'))
    expect(router.push).toHaveBeenCalledWith({ pathname: '/sign-in', params: { notice: 'You were signed out. Sign in again to continue.' } })
  })

  it('email without a notice is a plain push', async () => {
    await draw()
    await fireEvent.press(screen.getByLabelText('Continue with email'))
    expect(router.push).toHaveBeenCalledWith('/sign-in')
  })
})

describe('Google', () => {
  it('the server’s refusal is shown inline as an alert with one H.error, and it replaces the notice', async () => {
    mockNotice.mockResolvedValue(true)
    mockGoogle.mockResolvedValue({ data: { idToken: 't' } })
    mockSignInWithGoogle.mockResolvedValue({ success: false, error: 'Your account is suspended.', errorCode: 'FORBIDDEN' })
    await draw()
    await fireEvent.press(google())
    expect(screen.getByText('Your account is suspended.')).toBeTruthy()
    expect(screen.getByRole('alert', { name: 'Your account is suspended.' })).toBeTruthy()
    expect(screen.queryByText('You were signed out. Sign in again to continue.')).toBeNull()
    expect(error).toHaveBeenCalledTimes(1)
  })

  it('a cancelled chooser is a choice: no sentence, no haptic', async () => {
    mockGoogle.mockRejectedValue({ code: 'CANCELLED' })
    await draw()
    await fireEvent.press(google())
    expect(screen.queryByRole('alert')).toBeNull()
    expect(error).not.toHaveBeenCalled()
  })

  it('anything else is the generic line, once', async () => {
    mockGoogle.mockRejectedValue(new Error('boom'))
    await draw()
    await fireEvent.press(google())
    expect(screen.getByText("Couldn't sign in with Google. Try again.")).toBeTruthy()
    expect(error).toHaveBeenCalledTimes(1)
  })

  it('while it runs it is busy in place and the other ways dim to 45% and cannot be pressed', async () => {
    let finish: (value: unknown) => void = () => {}
    mockGoogle.mockReturnValue(new Promise((resolve) => (finish = resolve)))
    await draw()
    // The handler stays pending until `finish`, so the press is not awaited.
    void fireEvent.press(google())
    await act(async () => {})
    expect(google().props.accessibilityState).toMatchObject({ busy: true })
    expect(StyleSheet.flatten(screen.getByLabelText('Continue with email').props.style).opacity).toBe(0.45)
    expect(screen.getByLabelText('Continue with email').props.accessibilityState).toMatchObject({ disabled: true })
    await act(async () => {
      finish({ data: {} })
    })
  })
})

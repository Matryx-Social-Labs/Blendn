/*
 * `/` (Flow 1 landing 01 to 10): auth resolving (the mark alone), unreachable (Try again, answered once when it fails
 * again), the three ways in on the glass dock, Google and Apple busy (the others dim), a refusal inline with its one
 * H.error (a cancelled chooser has none), and the session-ended notice.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import React from 'react'
import { AppState, Platform, StyleSheet } from 'react-native'

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
// What the last session's end was: null, or `{ reason, sentence? }` (Flow 15 #1 to #4).
jest.mock('../lib/sessionEvents', () => ({ consumeSessionEnd: () => mockNotice() }))
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
import { setAccountState } from '../lib/accountState'
import { openWhenReady, resetPendingRoute } from '../lib/pendingRoute'

const signedOut = { user: null, loading: false, unreachable: false }
const on = (os: 'ios' | 'android') => Object.defineProperty(Platform, 'OS', { value: os, configurable: true })
let error: jest.SpyInstance
beforeEach(() => {
  jest.clearAllMocks()
  jest.useFakeTimers()
  on('ios')
  mockAuth.mockReturnValue(signedOut)
  mockNotice.mockResolvedValue(null)
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
    expect(screen.getByText('You’re still signed in. Nothing you saved or said has gone anywhere.')).toBeTruthy()
    expect(screen.getByText('Retries on its own every 30 s')).toBeTruthy()
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
    mockNotice.mockResolvedValue({ reason: 'expired' })
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
    mockNotice.mockResolvedValue({ reason: 'expired' })
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
    // The handler stays pending until `finish`: the press is made inside one act, which does not wait for it.
    await act(async () => {
      fireEvent.press(google())
    })
    expect(google().props.accessibilityState).toMatchObject({ busy: true })
    expect(StyleSheet.flatten(screen.getByLabelText('Continue with email').props.style).opacity).toBe(0.45)
    expect(screen.getByLabelText('Continue with email').props.accessibilityState).toMatchObject({ disabled: true })
    await act(async () => {
      finish({ data: {} })
    })
  })
})

describe('the account states (Flow 15 15.1 to 15.4)', () => {
  const SUSPENDED = "This account has been suspended. Contact support@blendn.app if you think that's a mistake."
  const STAFF = 'This app is for attendees. Organisers, venue owners and sponsors sign in at the dashboard.'

  beforeEach(() => setAccountState(null))

  it('a suspended Google account is a screen of its own, the server’s sentence split into title and body, no way in', async () => {
    mockGoogle.mockResolvedValue({ data: { idToken: 't' } })
    mockSignInWithGoogle.mockResolvedValue({ success: false, error: SUSPENDED, errorCode: 'FORBIDDEN' })
    await draw()
    await fireEvent.press(google())
    await act(async () => {})
    expect(screen.getByText('This account has been suspended.')).toBeTruthy()
    expect(screen.getByTestId('account-suspended')).toBeTruthy()
    expect(screen.getByText(/Contact/)).toBeTruthy()
    expect(screen.queryByLabelText('Continue with Google')).toBeNull()
    expect(screen.queryByLabelText('Continue with email')).toBeNull()
    expect(error).toHaveBeenCalledTimes(1)
  })

  it('Back to start returns to the landing', async () => {
    setAccountState({ kind: 'suspended', sentence: SUSPENDED })
    await draw()
    await fireEvent.press(screen.getByRole('button', { name: 'Back to start' }))
    expect(google()).toBeTruthy()
  })

  it('a suspension that ended the session mid-use goes straight to the screen, not a notice', async () => {
    mockNotice.mockResolvedValue({ reason: 'suspended', sentence: SUSPENDED })
    await draw()
    expect(screen.getByTestId('account-suspended')).toBeTruthy()
    expect(screen.queryByText('You were signed out. Sign in again to continue.')).toBeNull()
  })

  it('a staff account says where to sign in, and opens the dashboard', async () => {
    mockNotice.mockResolvedValue({ reason: 'staff', sentence: STAFF })
    await draw()
    expect(screen.getByText('Sign in at the dashboard')).toBeTruthy()
    expect(screen.getByText(STAFF)).toBeTruthy()
    expect(screen.getByText('dashboard.blendn.app')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Open the dashboard' })).toBeTruthy()
  })

  it('a deleted Apple or Google account is told, once, that it cannot be signed into again', async () => {
    mockGoogle.mockResolvedValue({ data: { idToken: 't' } })
    mockSignInWithGoogle.mockResolvedValue({ success: false, error: 'Account not found', errorCode: 'UNAUTHORIZED' })
    await draw()
    await fireEvent.press(google())
    await act(async () => {})
    expect(screen.getByText('We couldn’t sign you in with that account')).toBeTruthy()
    expect(screen.queryByText(/try again/i)).toBeNull()
    expect(screen.getByRole('button', { name: 'Use a different account' })).toBeTruthy()
  })

  it.each([
    ['elsewhere', 'You were signed out on another device. Sign in again to continue.'],
    ['reset', 'Your password was reset. Sign in with the new one.'],
    ['expired', 'You were signed out. Sign in again to continue.'],
  ] as const)('%s is a notice in the dock, with the sign-in buttons still there', async (reason, line) => {
    mockNotice.mockResolvedValue({ reason })
    await draw()
    expect(screen.getByText(line)).toBeTruthy()
    expect(google()).toBeTruthy()
  })

  it('a session end the server worded itself shows its own sentence', async () => {
    mockNotice.mockResolvedValue({ reason: 'expired', sentence: 'Please sign in again.' })
    await draw()
    expect(screen.getByText('Please sign in again.')).toBeTruthy()
  })
})

describe('can’t reach, retrying, maintenance (Flow 15 15.13)', () => {
  it('counts its tries and keeps going by itself every 30 s, silently', async () => {
    // Mid-jitter: exactly 30 s (the wait is 24 to 36 s).
    jest.spyOn(Math, 'random').mockReturnValue(0.5)
    Object.defineProperty(AppState, 'currentState', { configurable: true, get: () => 'active' })
    mockAuth.mockReturnValue({ ...signedOut, unreachable: true })
    mockRetry.mockResolvedValue({ unreachable: true })
    await draw()
    expect(screen.getByText('Retries on its own every 30 s')).toBeTruthy()
    await act(async () => {
      jest.advanceTimersByTime(30_000)
    })
    expect(mockRetry).toHaveBeenCalledTimes(1)
    expect(screen.getByText('Tried 1× · retries on its own every 30 s')).toBeTruthy()
    await act(async () => {
      jest.advanceTimersByTime(30_000)
    })
    expect(screen.getByText('Tried 2× · retries on its own every 30 s')).toBeTruthy()
    // An automatic try plays nothing.
    expect(error).not.toHaveBeenCalled()
  })

  it('maintenance says it is being worked on, when it is expected back, and is the secondary', async () => {
    const until = new Date(2026, 9, 21, 2, 30).getTime()
    mockAuth.mockReturnValue({ ...signedOut, unreachable: true, outage: { kind: 'maintenance', until } })
    await draw()
    expect(screen.getByText('Back in a moment')).toBeTruthy()
    expect(screen.getByText(/Blend’n is being worked on\. You’re still signed in\. Expected back by /)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy()
  })

  it('maintenance with no time named says only what it knows', async () => {
    mockAuth.mockReturnValue({ ...signedOut, unreachable: true, outage: { kind: 'maintenance', until: null } })
    await draw()
    expect(screen.getByText('Blend’n is being worked on. You’re still signed in.')).toBeTruthy()
  })
})

describe('a link held through sign-in (Flow 15 15.12 02)', () => {
  afterEach(() => resetPendingRoute())

  it('an event link says Sign in to open this', async () => {
    openWhenReady('/event/e1' as never)
    await draw()
    expect(screen.getByText('Sign in to open this')).toBeTruthy()
    expect(screen.getByText('An event · held for you')).toBeTruthy()
  })

  it('no held link, no pill', async () => {
    await draw()
    expect(screen.queryByTestId('held-link')).toBeNull()
  })
})

describe('one try at a time on the can’t-reach screen', () => {
  it('a press while a try is running (by hand or by itself) is dropped, not stacked', async () => {
    mockAuth.mockReturnValue({ ...signedOut, unreachable: true })
    let finish: (v: unknown) => void = () => {}
    mockRetry.mockReturnValue(new Promise((resolve) => (finish = resolve)))
    await draw()
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Try again'))
    })
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Try again'))
    })
    expect(mockRetry).toHaveBeenCalledTimes(1)
    await act(async () => {
      finish({ unreachable: true })
    })
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Try again'))
    })
    expect(mockRetry).toHaveBeenCalledTimes(2)
  })
})

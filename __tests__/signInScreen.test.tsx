/*
 * /sign-in (Flow 1 sign-in 01 to 15, R4.1 1.1): every problem under its own field, focus on the first, one shake and one
 * H.error; the server's refusal as a tinted card (the wait with a clock); busy; the keyboard up; the invite pill.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import React from 'react'
import { Keyboard, ScrollView, TextInput } from 'react-native'

import { H } from '../lib/haptics'

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'))
const mockSignIn = jest.fn()
const mockSignUp = jest.fn()
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: jest.fn(() => ({})),
}))
jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default)
jest.mock('../lib/useAuth', () => ({
  signInWithEmail: (...args: unknown[]) => mockSignIn(...args),
  signUp: (...args: unknown[]) => mockSignUp(...args),
}))
jest.mock('../lib/logger', () => ({ Logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } }))
jest.mock('../components/friends/PendingInvite', () => ({ PendingInvite: () => null }))

import { router, useLocalSearchParams } from 'expo-router'
import SignIn from '../app/sign-in'

let error: jest.SpyInstance
beforeEach(() => {
  jest.clearAllMocks()
  jest.useFakeTimers()
  error = jest.spyOn(H, 'error').mockImplementation(() => {})
  jest.spyOn(H, 'primary').mockImplementation(() => {})
  jest.spyOn(H, 'select').mockImplementation(() => {})
  ;(useLocalSearchParams as jest.Mock).mockReturnValue({})
})
afterEach(() => jest.useRealTimers())

const type = (testID: string, text: string) => fireEvent.changeText(screen.getByTestId(`${testID}-input`), text)
const submit = () => fireEvent.press(screen.getByTestId('sign-in-primary'))
const createAccount = () => fireEvent.press(screen.getByRole('tab', { name: 'Create account' }))

describe('mode', () => {
  it('opens on Sign in with email and password only, and the forgot link under the primary', async () => {
    await render(<SignIn />)
    expect(screen.getByRole('tab', { name: 'Sign in' }).props.accessibilityState).toMatchObject({ selected: true })
    expect(screen.getByTestId('sign-in-primary').props.accessibilityLabel).toBe('Sign in')
    expect(screen.queryByTestId('sign-in-name')).toBeNull()
    expect(screen.queryByTestId('sign-in-age')).toBeNull()
    expect(screen.getByText('Forgot your password?')).toBeTruthy()
  })

  it('Create account adds the name first and the age last, and the legal line replaces the forgot link', async () => {
    await render(<SignIn />)
    await createAccount()
    expect(screen.getByTestId('sign-in-name')).toBeTruthy()
    expect(screen.getByTestId('sign-in-age')).toBeTruthy()
    expect(screen.queryByText('Forgot your password?')).toBeNull()
    expect(screen.getByText(/By creating an account you/)).toBeTruthy()
  })
})

describe('validation, each under its own field (R4.1 sign-in 06)', () => {
  it('names every problem at once, plays one H.error, and takes no round trip', async () => {
    await render(<SignIn />)
    await createAccount()
    await type('sign-in-email', 'sam@example')
    await type('sign-in-password', 'hunter2')
    await type('sign-in-age', '17')
    await submit()
    expect(screen.getByText('Enter your name.')).toBeTruthy()
    expect(screen.getByText('Use at least 12 characters. Length beats symbols.')).toBeTruthy()
    expect(screen.getByText("Blend'n is for people 18 and over.")).toBeTruthy()
    expect(error).toHaveBeenCalledTimes(1)
    expect(mockSignUp).not.toHaveBeenCalled()
  })

  it('a one-letter name gets the length sentence under it, a blank one still "Enter your name."', async () => {
    await render(<SignIn />)
    await createAccount()
    await type('sign-in-name', 'S')
    await type('sign-in-email', 'sam@example.com')
    await type('sign-in-password', 'a-long-enough-pass')
    await type('sign-in-age', '30')
    await submit()
    expect(screen.getByText('Use 2 to 100 letters.')).toBeTruthy()
    expect(screen.queryByText('Enter your name.')).toBeNull()
    expect(mockSignUp).not.toHaveBeenCalled()
  })

  it('a bad email says so under the email, not at the foot', async () => {
    await render(<SignIn />)
    await type('sign-in-email', 'nobody')
    await type('sign-in-password', 'whatever')
    await submit()
    expect(screen.getByText('Enter a valid email address.')).toBeTruthy()
    expect(mockSignIn).not.toHaveBeenCalled()
  })

  it('a field’s sentence goes when its value changes, and the others stay', async () => {
    await render(<SignIn />)
    await submit()
    expect(screen.getByText('Enter a valid email address.')).toBeTruthy()
    expect(screen.getByText('Enter your password.')).toBeTruthy()
    await type('sign-in-email', 'sam@example.com')
    expect(screen.queryByText('Enter a valid email address.')).toBeNull()
    expect(screen.getByText('Enter your password.')).toBeTruthy()
  })
})

describe('the server answers', () => {
  const fill = async () => {
    await render(<SignIn />)
    await type('sign-in-email', ' Sam@Example.com ')
    await type('sign-in-password', 'correct horse battery')
  }

  it('signs in with the trimmed, lower-cased address and shows nothing on success', async () => {
    mockSignIn.mockResolvedValue({ success: true })
    await fill()
    await submit()
    expect(mockSignIn).toHaveBeenCalledWith('sam@example.com', 'correct horse battery', expect.any(Object))
    expect(screen.queryByTestId('sign-in-error')).toBeNull()
    expect(error).not.toHaveBeenCalled()
  })

  it('stays busy after success, until the root layout replaces the screen (no idle form for the blank frame)', async () => {
    mockSignIn.mockResolvedValue({ success: true })
    await fill()
    await submit()
    expect(screen.getByTestId('sign-in-primary').props.accessibilityState).toMatchObject({ busy: true })
  })

  it('is released after 8 s if the screen was never replaced, so a routing that never came does not leave the form dead', async () => {
    mockSignIn.mockResolvedValue({ success: true })
    await fill()
    await submit()
    const primary = () => screen.getByTestId('sign-in-primary').props.accessibilityState
    await act(async () => {
      jest.advanceTimersByTime(7_900)
    })
    expect(primary()).toMatchObject({ busy: true })
    await act(async () => {
      jest.advanceTimersByTime(200)
    })
    expect(primary()).toMatchObject({ busy: false })
  })

  it('is free again after a refusal', async () => {
    mockSignIn.mockResolvedValue({ success: false, error: 'Invalid email or password' })
    await fill()
    await submit()
    expect(screen.getByTestId('sign-in-primary').props.accessibilityState).toMatchObject({ busy: false })
  })

  it('its sentence is a tinted card, with one H.error (the primary’s refusal)', async () => {
    mockSignIn.mockResolvedValue({ success: false, error: 'Invalid email or password' })
    await fill()
    await submit()
    expect(screen.getByText('Invalid email or password')).toBeTruthy()
    expect(screen.getByTestId('sign-in-error').props.accessibilityRole).toBe('alert')
    expect(error).toHaveBeenCalledTimes(1)
  })

  it('the wait the server names is the same card, in the server’s words', async () => {
    mockSignIn.mockResolvedValue({ success: false, error: 'Too many sign-in attempts. Try again in 14 minutes.', errorCode: 'RATE_LIMITED' })
    await fill()
    await submit()
    expect(screen.getByText('Too many sign-in attempts. Try again in 14 minutes.')).toBeTruthy()
  })

  it('a thrown request is “Something went wrong”, in the card', async () => {
    mockSignIn.mockRejectedValue(new Error('offline'))
    await fill()
    await submit()
    expect(screen.getByText('Something went wrong. Please try again.')).toBeTruthy()
    expect(error).toHaveBeenCalledTimes(1)
  })

  it('switching mode drops the old attempt’s sentence', async () => {
    mockSignIn.mockResolvedValue({ success: false, error: 'Invalid email or password' })
    await fill()
    await submit()
    await createAccount()
    expect(screen.queryByText('Invalid email or password')).toBeNull()
  })

  it('the segments are off while the request runs', async () => {
    let finish: (value: { success: boolean }) => void = () => {}
    mockSignIn.mockReturnValue(new Promise((resolve) => (finish = resolve)))
    await fill()
    await submit()
    expect(screen.getByTestId('sign-in-primary').props.accessibilityState).toMatchObject({ busy: true })
    expect(screen.getByRole('tab', { name: 'Create account' }).props.accessibilityState).toMatchObject({ disabled: true })
    await act(async () => {
      finish({ success: true })
    })
  })
})

describe('haptics', () => {
  it('the press-in is silent: a refusal plays its one H.error, so nothing fires twice', async () => {
    const primary = jest.spyOn(H, 'primary')
    await render(<SignIn />)
    await fireEvent(screen.getByTestId('sign-in-primary'), 'pressIn')
    expect(primary).not.toHaveBeenCalled()
  })
})

describe('the entry screen’s notice', () => {
  it('is shown on the form, and goes when the server refuses something', async () => {
    ;(useLocalSearchParams as jest.Mock).mockReturnValue({ notice: 'You were signed out. Sign in again to continue.' })
    mockSignIn.mockResolvedValue({ success: false, error: 'Invalid email or password' })
    await render(<SignIn />)
    expect(screen.getByText('You were signed out. Sign in again to continue.')).toBeTruthy()
    await type('sign-in-email', 'sam@example.com')
    await type('sign-in-password', 'pw')
    await submit()
    expect(screen.queryByText('You were signed out. Sign in again to continue.')).toBeNull()
  })
})

describe('forgot and the keyboard', () => {
  it('forgot takes the typed address with it', async () => {
    await render(<SignIn />)
    await type('sign-in-email', 'Sam@Example.com')
    await fireEvent.press(screen.getByText('Forgot your password?'))
    expect(router.push).toHaveBeenCalledWith({ pathname: '/forgot-password', params: { email: 'sam@example.com' } })
  })

  it('with the keyboard up the dock is the primary alone, on glass', async () => {
    const listeners: Record<string, () => void> = {}
    jest.spyOn(Keyboard, 'addListener').mockImplementation(((event: string, cb: () => void) => {
      listeners[event] = cb
      return { remove: jest.fn() }
    }) as never)
    await render(<SignIn />)
    expect(screen.getByText('Forgot your password?')).toBeTruthy()
    await act(async () => {
      listeners.keyboardWillShow()
    })
    expect(screen.queryByText('Forgot your password?')).toBeNull()
    expect(screen.getByTestId('sign-in-primary')).toBeTruthy()
  })
})

describe('the focused field stays above the dock', () => {
  it('sign-up: Age takes the page with it even when the Strong Password sheet holds first responder as the keyboard grows', async () => {
    const scrollTo = jest.fn()
    jest.spyOn(ScrollView.prototype as unknown as { scrollTo: () => void }, 'scrollTo').mockImplementation(scrollTo)
    await render(<SignIn />)
    await createAccount()
    const age = { measureLayout: (_to: unknown, ok: (x: number, y: number, w: number, h: number) => void) => ok(0, 420, 340, 56) }
    const focused = jest.spyOn(TextInput.State, 'currentlyFocusedInput').mockReturnValue(age as never)
    await fireEvent(screen.getByTestId('sign-in-scroll'), 'layout', { nativeEvent: { layout: { height: 560, x: 0, y: 0, width: 390 } } })
    await fireEvent(screen.getByTestId('sign-in-age-input'), 'focus')
    focused.mockReturnValue(null as never)
    scrollTo.mockClear()
    await fireEvent(screen.getByTestId('sign-in-scroll'), 'layout', { nativeEvent: { layout: { height: 200, x: 0, y: 0, width: 390 } } })
    expect(scrollTo).toHaveBeenCalledWith({ y: 420 + 56 + 72 - 200, animated: true })
  })
})

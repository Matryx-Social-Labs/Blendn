/*
 * /sign-in (Flow 1 sign-in 01 to 15, R4.1 1.1): every problem under its own field, focus on the first, one shake and one
 * H.error; the server's refusal as a tinted card (the wait with a clock); busy; the keyboard up; the invite pill.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import React from 'react'
import { KeyboardEvents } from 'react-native-keyboard-controller'

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
import { forgetHeldForm } from '../lib/heldSignInForm'

let error: jest.SpyInstance
beforeEach(() => {
  jest.clearAllMocks()
  jest.useFakeTimers()
  error = jest.spyOn(H, 'error').mockImplementation(() => {})
  jest.spyOn(H, 'primary').mockImplementation(() => {})
  jest.spyOn(H, 'select').mockImplementation(() => {})
  ;(useLocalSearchParams as jest.Mock).mockReturnValue({})
  // Each test is a fresh form: what one typed is held across a remount (M4), not across tests.
  forgetHeldForm()
})

describe('a remount (a text-size change re-lays the screen out, Opus review M4)', () => {
  it('keeps the mode and what was typed, never the password', async () => {
    const first = await render(<SignIn />)
    await createAccount()
    await type('sign-in-name', 'Asha')
    await type('sign-in-email', 'asha@example.com')
    await type('sign-in-password', 'correct horse battery')
    await type('sign-in-age', '27')
    await first.unmount()
    await render(<SignIn />)
    expect(screen.getByRole('tab', { name: 'Create account' }).props.accessibilityState).toMatchObject({ selected: true })
    expect(screen.getByDisplayValue('Asha')).toBeTruthy()
    expect(screen.getByDisplayValue('asha@example.com')).toBeTruthy()
    expect(screen.getByDisplayValue('27')).toBeTruthy()
    expect(screen.queryByDisplayValue('correct horse battery')).toBeNull()
  })
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
    expect(screen.getByText("Blend’n is for people 18 and over.")).toBeTruthy()
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

  it('with the keyboard up the dock keeps the primary and "Forgot your password?", on glass (GO-15, A29)', async () => {
    const listeners: Record<string, () => void> = {}
    ;(KeyboardEvents.addListener as jest.Mock).mockImplementation(((event: string, cb: () => void) => {
      listeners[event] = cb
      return { remove: jest.fn() }
    }) as never)
    await render(<SignIn />)
    expect(screen.getByText('Forgot your password?')).toBeTruthy()
    await act(async () => {
      listeners.keyboardWillShow()
    })
    // The way out of a forgotten password is not under the keyboard: it rides with the primary.
    expect(screen.getByText('Forgot your password?')).toBeTruthy()
    expect(screen.getByTestId('sign-in-primary')).toBeTruthy()
  })
})

describe('an empty form (GO-15, D10)', () => {
  it('Sign in stays pressable on empty fields and refuses with its reasons, one H.error, no round trip', async () => {
    await render(<SignIn />)
    expect(screen.getByTestId('sign-in-primary').props.accessibilityState).not.toMatchObject({ disabled: true })
    await submit()
    expect(screen.getByText('Enter a valid email address.')).toBeTruthy()
    expect(screen.getByText('Enter your password.')).toBeTruthy()
    expect(error).toHaveBeenCalledTimes(1)
    expect(mockSignIn).not.toHaveBeenCalled()
  })

  it('the age asks for a number, not a yes: "Your age" (A31)', async () => {
    await render(<SignIn />)
    await createAccount()
    expect(screen.getByTestId('sign-in-age-input').props.placeholder).toBe('Your age')
  })
})

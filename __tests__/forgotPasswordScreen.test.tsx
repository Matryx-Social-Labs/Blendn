/*
 * /forgot-password (Flow 1 forgot 01 to 09): the entry with its address prefilled, the invalid address under the field, the
 * server's failure and the wait as a tinted card, the one H.success on the server's yes, the Check your inbox page with its
 * draining Resend, the toasts, and the refusals' one H.error each.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import React from 'react'
import { Linking } from 'react-native'

import { H } from '../lib/haptics'

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'))
const mockForgot = jest.fn()
const mockToast = jest.fn()
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn() },
  useLocalSearchParams: jest.fn(() => ({})),
}))
jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default)
jest.mock('../lib/apiClient', () => ({ apiClient: { forgotPassword: (...args: unknown[]) => mockForgot(...args) } }))
jest.mock('../lib/logger', () => ({ Logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } }))
jest.mock('../components/Toast', () => ({ useToast: () => ({ showToast: mockToast }) }))

import { useLocalSearchParams } from 'expo-router'
import ForgotPassword from '../app/forgot-password'

let success: jest.SpyInstance
let error: jest.SpyInstance
beforeEach(() => {
  jest.clearAllMocks()
  jest.useFakeTimers()
  success = jest.spyOn(H, 'success').mockImplementation(() => {})
  error = jest.spyOn(H, 'error').mockImplementation(() => {})
  jest.spyOn(H, 'primary').mockImplementation(() => {})
  ;(useLocalSearchParams as jest.Mock).mockReturnValue({ email: 'sam@example.com' })
  mockForgot.mockResolvedValue({ success: true })
})
afterEach(() => jest.useRealTimers())

const send = () => fireEvent.press(screen.getByTestId('forgot-send'))
const sent = async () => {
  await render(<ForgotPassword />)
  await send()
}
/** The cooldown is one timer a second, each set by the render the last one caused: so it is run a second at a time. */
const wait = async (seconds: number) => {
  for (let i = 0; i < seconds; i++) {
    await act(async () => {
      jest.advanceTimersByTime(1000)
    })
  }
}

describe('the entry', () => {
  it('shows the question in the design’s words, with the address from sign-in already in', async () => {
    await render(<ForgotPassword />)
    expect(screen.getByText('Forgot your password?')).toBeTruthy()
    expect(screen.getByText('Enter your email and we’ll send a link to reset it. The link opens in your browser.')).toBeTruthy()
    expect(screen.getByTestId('forgot-email-input').props.value).toBe('sam@example.com')
  })

  it('the press-in is silent: the server’s answer plays the one haptic', async () => {
    const primary = jest.spyOn(H, 'primary')
    await render(<ForgotPassword />)
    await fireEvent(screen.getByTestId('forgot-send'), 'pressIn')
    expect(primary).not.toHaveBeenCalled()
  })

  it('an address that is not one is told under the field, shakes the primary once, and goes nowhere', async () => {
    ;(useLocalSearchParams as jest.Mock).mockReturnValue({})
    await render(<ForgotPassword />)
    await fireEvent.changeText(screen.getByTestId('forgot-email-input'), 'nobody')
    await send()
    expect(screen.getByText('Enter a valid email address.')).toBeTruthy()
    expect(error).toHaveBeenCalledTimes(1)
    expect(mockForgot).not.toHaveBeenCalled()
    await fireEvent.changeText(screen.getByTestId('forgot-email-input'), 'nobody@')
    expect(screen.queryByText('Enter a valid email address.')).toBeNull()
  })

  it('the server’s failure is a tinted card with one H.error, and the page stays', async () => {
    mockForgot.mockResolvedValue({ success: false, error: 'Boom', errorCode: 'SERVER' })
    await sent()
    expect(screen.getByTestId('forgot-error')).toBeTruthy()
    expect(error).toHaveBeenCalledTimes(1)
    expect(success).not.toHaveBeenCalled()
    expect(screen.queryByText('Check your inbox')).toBeNull()
  })

  it('a rate limit says the wait in the card', async () => {
    mockForgot.mockResolvedValue({ success: false, error: 'Too many requests', errorCode: 'RATE_LIMITED', retryAfter: 720 })
    await sent()
    expect(screen.getByText('Too many reset requests. Try again in 12 minutes.')).toBeTruthy()
  })

  it('a thrown request is the design’s sentence', async () => {
    mockForgot.mockRejectedValue(new Error('offline'))
    await sent()
    expect(screen.getByText("Couldn't send the reset link. Try again.")).toBeTruthy()
  })
})

describe('Check your inbox', () => {
  it('plays the one H.success on the server’s yes, and names the address the answer is about', async () => {
    await sent()
    expect(success).toHaveBeenCalledTimes(1)
    expect(screen.getByText('Check your inbox')).toBeTruthy()
    expect(screen.getByText('sam@example.com')).toBeTruthy()
    expect(screen.getByTestId('forgot-sent-well', { includeHiddenElements: true })).toBeTruthy()
  })

  it('a short address stays in the sentence; a long one gets its own line (no lone "If", no mid-token break)', async () => {
    await sent()
    expect(screen.getByTestId('forgot-sent-body').props.children).not.toContain('\n')
    await screen.unmount()
    ;(useLocalSearchParams as jest.Mock).mockReturnValue({ email: 'someone.with.a.long.name@subdomain.example.app' })
    await sent()
    expect(screen.getByTestId('forgot-sent-body').props.children.filter((c: unknown) => c === '\n')).toHaveLength(2)
  })

  it('Resend counts down from 30 with a draining ring, then is ready', async () => {
    await sent()
    const resend = screen.getByTestId('forgot-resend')
    expect(resend.props.accessibilityLabel).toBe('Resend in 30s')
    expect(resend.props.accessibilityState).toMatchObject({ disabled: true })
    expect(screen.getByTestId('forgot-ring', { includeHiddenElements: true })).toBeTruthy()
    await wait(12)
    expect(screen.getByTestId('forgot-resend').props.accessibilityLabel).toBe('Resend in 18s')
    await wait(18)
    expect(screen.getByTestId('forgot-resend').props.accessibilityLabel).toBe('Resend link')
    expect(screen.queryByTestId('forgot-ring', { includeHiddenElements: true })).toBeNull()
  })

  it('Resend, once it can, says so in a success toast that plays the outcome haptic', async () => {
    await sent()
    await wait(30)
    await fireEvent.press(screen.getByTestId('forgot-resend'))
    expect(mockForgot).toHaveBeenCalledTimes(2)
    expect(mockToast).toHaveBeenCalledWith('Sent again. Give it a minute to arrive.', 'success', { haptic: 'success' })
  })

  it('a refused Resend is the card and one H.error on Resend, with the page kept', async () => {
    await sent()
    await wait(30)
    mockForgot.mockResolvedValue({ success: false, error: 'No', errorCode: 'SERVER' })
    await fireEvent.press(screen.getByTestId('forgot-resend'))
    expect(screen.getByTestId('forgot-error')).toBeTruthy()
    expect(error).toHaveBeenCalledTimes(1)
    expect(screen.getByText('Check your inbox')).toBeTruthy()
  })

  it('Open mail app falls back to mailto, and says so when there is no mail app', async () => {
    jest.spyOn(Linking, 'openURL').mockRejectedValue(new Error('none'))
    await sent()
    await fireEvent.press(screen.getByTestId('forgot-open-mail'))
    expect(mockToast).toHaveBeenCalledWith('No mail app found. Open your email to find the link.', 'info')
  })

  it('Use a different email returns to the entry', async () => {
    await sent()
    await fireEvent.press(screen.getByTestId('forgot-different'))
    expect(screen.getByText('Forgot your password?')).toBeTruthy()
  })
})

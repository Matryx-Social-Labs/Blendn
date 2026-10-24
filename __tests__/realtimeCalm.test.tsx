/*
 * "Realtime disconnected" only when it is true, and a phone back from the
 * background gets its messages (SCRUM-407).
 *
 * The banner showed the instant the socket was anything but connected, so
 * every return to the app flashed it for the second a reconnect takes. And a
 * socket that iOS had suspended still said "connected" when the app came back,
 * on a connection that was dead: no messages, no banner, until the ping timed
 * out about 85 seconds later.
 */
import React from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react-native'

jest.mock('../lib/apiClient', () => ({ apiClient: {}, TokenStorage: {} }))
jest.mock('../lib/logger', () => ({ Logger: { debug: jest.fn(), warn: jest.fn(), error: jest.fn(), info: jest.fn() } }))
jest.mock('../lib/socketClient', () => ({ connect: jest.fn() }))
const mockConnect = jest.requireMock('../lib/socketClient').connect as jest.Mock

// eslint-disable-next-line import/first
import RealtimeStatusBanner, { realtimeBannerKind } from '../components/RealtimeStatusBanner'
// eslint-disable-next-line import/first
import { markOffline, markOnline } from '../lib/networkStatus'

const status = (state: 'connected' | 'reconnecting' | 'disconnected') =>
  ({ state, connected: state === 'connected' }) as never

beforeEach(() => {
  jest.useFakeTimers()
  markOnline()
})
afterEach(() => jest.useRealTimers())

describe('RealtimeStatusBanner', () => {
  it('says nothing for a reconnect that finishes within the grace period', async () => {
    await render(<RealtimeStatusBanner status={status('reconnecting')} />)
    expect(screen.queryByText(/Updates paused/)).toBeNull()
    await act(async () => {
      jest.advanceTimersByTime(2500)
    })
    await screen.rerender(<RealtimeStatusBanner status={status('connected')} />)
    await act(async () => {
      jest.advanceTimersByTime(5000)
    })
    expect(screen.queryByText(/Updates paused/)).toBeNull()
  })

  it('speaks once the socket has been down past the grace period', async () => {
    await render(<RealtimeStatusBanner status={status('disconnected')} />)
    await act(async () => {
      jest.advanceTimersByTime(3100)
    })
    expect(screen.getByText('Updates paused. Trying to reconnect.')).toBeTruthy()
    expect(screen.getByText('Try again')).toBeTruthy()
  })

  it('says offline at once — actions will fail, and that is worth saying now', async () => {
    markOffline()
    await render(<RealtimeStatusBanner status={status('disconnected')} />)
    expect(screen.getByText('Offline. Some actions won’t work until you’re back.')).toBeTruthy()
    // Nothing to retry while offline: the action would fail too.
    expect(screen.queryByText('Try again')).toBeNull()
  })
})

describe('reconnecting (Flow 7 pieces 03)', () => {
  it('past the grace, a reconnect under way says Reconnecting… in the warning tint with nothing to press', async () => {
    await render(<RealtimeStatusBanner status={status('reconnecting')} />)
    await act(async () => {
      jest.advanceTimersByTime(3100)
    })
    expect(screen.getByText('Reconnecting…')).toBeTruthy()
    expect(screen.queryByText('Try again')).toBeNull()
    expect(screen.queryByText(/Updates paused/)).toBeNull()
  })

  it('Try again turns the paused banner into the reconnecting one while it runs, then back', async () => {
    let finish: () => void = () => {}
    mockConnect.mockReturnValue(new Promise<void>((resolve) => (finish = resolve)))
    await render(<RealtimeStatusBanner status={status('disconnected')} />)
    await act(async () => {
      jest.advanceTimersByTime(3100)
    })
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Try again' }))
    })
    expect(screen.getByText('Reconnecting…')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull()
    await act(async () => {
      finish()
    })
    expect(screen.getByText('Updates paused. Trying to reconnect.')).toBeTruthy()
  })

  it('picks the banner: offline wins, a socket within grace says nothing, down is paused or reconnecting', () => {
    expect(realtimeBannerKind({ offline: true, socketIssue: true, reconnecting: true })).toBe('offline')
    expect(realtimeBannerKind({ offline: false, socketIssue: false, reconnecting: true })).toBeNull()
    expect(realtimeBannerKind({ offline: false, socketIssue: true, reconnecting: false })).toBe('paused')
    expect(realtimeBannerKind({ offline: false, socketIssue: true, reconnecting: true })).toBe('reconnecting')
  })
})

describe('beside a full error state (rc7 D4)', () => {
  it('the paused banner offers no second Try again when the screen has its own', async () => {
    await render(<RealtimeStatusBanner status={status('disconnected')} withoutRetry />)
    await act(async () => {
      jest.advanceTimersByTime(3100)
    })
    expect(screen.getByText('Updates paused. Trying to reconnect.')).toBeTruthy()
    expect(screen.queryByText('Try again')).toBeNull()
  })
})

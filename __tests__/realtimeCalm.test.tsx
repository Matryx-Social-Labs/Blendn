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
import { act, render, screen } from '@testing-library/react-native'

jest.mock('../lib/apiClient', () => ({ apiClient: {}, TokenStorage: {} }))
jest.mock('../lib/logger', () => ({ Logger: { debug: jest.fn(), warn: jest.fn(), error: jest.fn(), info: jest.fn() } }))
jest.mock('../lib/socketClient', () => ({ connect: jest.fn() }))

// eslint-disable-next-line import/first
import RealtimeStatusBanner from '../components/RealtimeStatusBanner'
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
    expect(screen.queryByText(/Reconnecting|Live updates paused/)).toBeNull()
    await act(async () => {
      jest.advanceTimersByTime(2500)
    })
    await screen.rerender(<RealtimeStatusBanner status={status('connected')} />)
    await act(async () => {
      jest.advanceTimersByTime(5000)
    })
    expect(screen.queryByText(/Reconnecting|Live updates paused/)).toBeNull()
  })

  it('speaks once the socket has been down past the grace period', async () => {
    await render(<RealtimeStatusBanner status={status('disconnected')} />)
    await act(async () => {
      jest.advanceTimersByTime(3100)
    })
    expect(screen.getByText('Live updates paused.')).toBeTruthy()
  })

  it('says offline at once — actions will fail, and that is worth saying now', async () => {
    markOffline()
    await render(<RealtimeStatusBanner status={status('disconnected')} />)
    expect(screen.getByText("You're offline. Some actions won't work until you're back.")).toBeTruthy()
  })
})

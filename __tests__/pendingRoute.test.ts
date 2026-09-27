/*
 * A notification tapped before the app can open it waits, and opens once.
 *
 * Signed out, or on a cold start before the session is back, the tap used to
 * push at once and the root guard threw the screen away (`lib/pendingRoute.ts`).
 */
const mockPush = jest.fn()
jest.mock('expo-router', () => ({ router: { push: (...a: unknown[]) => mockPush(...a) } }))
jest.mock('../lib/apiClient', () => ({ apiClient: {}, TokenStorage: {} }))
jest.mock('../lib/logger', () => ({ Logger: { debug: jest.fn(), warn: jest.fn(), error: jest.fn(), info: jest.fn() } }))

import { readFileSync } from 'fs'
import { join } from 'path'
import { navigateFromNotificationData, notificationTarget } from '../lib/notifications'
import { openWhenReady, resetPendingRoute, setRouteReady, takePendingRoute } from '../lib/pendingRoute'

beforeEach(() => {
  resetPendingRoute()
  mockPush.mockClear()
})

describe('openWhenReady', () => {
  it('holds a target until the app is ready', () => {
    openWhenReady('/(tabs)/chat')
    expect(mockPush).not.toHaveBeenCalled()
    expect(takePendingRoute()).toBe('/(tabs)/chat')
    // Taken once.
    expect(takePendingRoute()).toBeNull()
  })

  it('keeps only the latest tap', () => {
    openWhenReady('/(tabs)/chat')
    openWhenReady('/(tabs)/events')
    expect(takePendingRoute()).toBe('/(tabs)/events')
  })

  it('pushes straight away once ready', () => {
    setRouteReady(true)
    openWhenReady('/(tabs)/chat')
    expect(mockPush).toHaveBeenCalledWith('/(tabs)/chat')
    expect(takePendingRoute()).toBeNull()
  })
})

describe('a notification tapped while signed out', () => {
  it('waits for sign-in instead of navigating', () => {
    navigateFromNotificationData({ type: 'private_message', conversationId: 'c1' })
    expect(mockPush).not.toHaveBeenCalled()
    expect(takePendingRoute()).toEqual({
      pathname: '/private-chat/[conversationId]',
      params: { conversationId: 'c1' },
    })
  })
})

describe('notificationTarget', () => {
  it('opens the event for the one-hour reminder', () => {
    // `scheduleEventReminder` sends `event_reminder`, which had no case.
    expect(notificationTarget({ type: 'event_reminder', eventId: 'e1' })).toEqual({
      pathname: '/event/[id]',
      params: { id: 'e1' },
    })
  })

  it('goes nowhere for an unknown or empty payload', () => {
    expect(notificationTarget(undefined)).toBeNull()
    expect(notificationTarget({})).toBeNull()
    expect(notificationTarget({ type: 'something_new' })).toBeNull()
  })
})

describe('the root guard', () => {
  const layout = () => readFileSync(join(__dirname, '..', 'app', '_layout.tsx'), 'utf8')

  it('opens the waiting target on an ordinary screen', () => {
    expect(layout()).toContain('const waiting = takePendingRoute();')
  })

  it('does not let a superseded run replace a screen pushed during its await', () => {
    const src = layout()
    const afterRead = src.slice(src.indexOf('await readOnboarding(user.id)'))
    expect(afterRead.slice(0, 120)).toContain('if (superseded) return;')
  })
})

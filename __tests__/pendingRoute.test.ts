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
import { queryCache } from '../lib/queryCache'
import { openWhenReady, pendingEventId, pendingInviteToken, resetPendingRoute, setRouteReady, takePendingRoute } from '../lib/pendingRoute'

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

  it('pushes straight away once ready (once any modal is closed: none here, so within the same turn)', async () => {
    setRouteReady(true)
    openWhenReady('/(tabs)/chat')
    // The microtasks of `dismissModals` (no hold, no modal): settled before anything else runs.
    await new Promise((resolve) => setImmediate(resolve))
    expect(mockPush).toHaveBeenCalledWith('/(tabs)/chat')
    expect(takePendingRoute()).toBeNull()
  })
})

describe('pendingInviteToken', () => {
  it('reads the token of an invite link waiting for sign-in, without taking it', () => {
    openWhenReady('/f/abc123' as never)
    expect(pendingInviteToken()).toBe('abc123')
    // Still there for the guard to open after sign-in.
    expect(takePendingRoute()).toBe('/f/abc123')
    expect(pendingInviteToken()).toBeNull()
  })

  it('reads the object form too', () => {
    openWhenReady({ pathname: '/f/[token]', params: { token: 'tok9' } } as never)
    expect(pendingInviteToken()).toBe('tok9')
  })

  it('is null for anything that is not an invite', () => {
    expect(pendingInviteToken()).toBeNull()
    openWhenReady('/(tabs)/chat')
    expect(pendingInviteToken()).toBeNull()
    openWhenReady('/friends/add' as never)
    expect(pendingInviteToken()).toBeNull()
  })
})

describe('pendingEventId', () => {
  it('reads the id of an event link waiting for sign-in, without taking it', () => {
    openWhenReady('/event/e%2D1?ref=x' as never)
    expect(pendingEventId()).toBe('e-1')
    expect(takePendingRoute()).toBe('/event/e%2D1?ref=x')
    expect(pendingEventId()).toBeNull()
  })

  it('reads the object form too, and a malformed escape is no id (L1)', () => {
    openWhenReady({ pathname: '/event/[id]', params: { id: 'e9' } } as never)
    expect(pendingEventId()).toBe('e9')
    openWhenReady('/event/%E0%A4%A' as never)
    expect(pendingEventId()).toBeNull()
  })

  it('is null for anything that is not an event link', () => {
    expect(pendingEventId()).toBeNull()
    openWhenReady('/f/abc123' as never)
    expect(pendingEventId()).toBeNull()
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

  it('opens the rating screen for an event-ended or rating push, whatever the server names it', () => {
    for (const type of ['event_ended', 'event_rating', 'rate_event', 'peer_rating', 'rate_peers', 'rating_request']) {
      expect(notificationTarget({ type, eventId: 'e1' })).toEqual({
        pathname: '/rate/[eventId]',
        params: { eventId: 'e1' },
      })
    }
    // No event, nothing to rate: Going's Past rows are the way in.
    expect(notificationTarget({ type: 'event_ended' })).toBe('/(tabs)/going')
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

describe('View on a request notification (SCRUM-907)', () => {
  const KEY = 'message_requests_u1'
  beforeEach(() => queryCache.set(KEY, { incoming: [], outgoing: [] }, 60_000))

  it('lands on the Banter and drops its cached requests, so the request is read when it arrives', () => {
    navigateFromNotificationData({ type: 'message_request', requestId: 'r1' })
    expect(takePendingRoute()).toBe('/(tabs)/chat')
    expect(queryCache.get(KEY)).toBeNull()
  })

  it('a notification that goes elsewhere leaves them', () => {
    navigateFromNotificationData({ type: 'rating_request', eventId: 'e1' })
    expect(queryCache.get(KEY)).not.toBeNull()
  })
})

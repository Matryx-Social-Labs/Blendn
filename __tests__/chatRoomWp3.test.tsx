import React from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react-native'

/**
 * The room's WP3 states, rendered: the pre-event countdown header and its composer (C1), and the warning above
 * the field before contact details (C2). The harness is chatNotLive's.
 */
const mockEnded: Array<(d: { eventId: string; reason: string }) => void> = []
const mockChanged = new Set<() => void>()
const mockBanned: Array<(d: { userId: string; banned: boolean }) => void> = []
const mockRejoin = jest.fn()
let mockParams: Record<string, string> = { id: 'g1' }

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
)
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
  Stack: { Screen: () => null },
  useLocalSearchParams: () => mockParams,
  // The room reads a Blend's chrome on focus; a room that is not a Blend's reads nothing.
  useIsFocused: () => true,
  useFocusEffect: (effect: () => void) => {
    const { useEffect } = require('react')
    useEffect(effect, [effect])
  },
}))
jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default)
jest.mock('expo-video', () => ({ useVideoPlayer: () => ({ addListener: () => ({ remove: () => {} }), play: () => {} }), VideoView: () => null }))
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }))
jest.mock('../lib/perf', () => ({ ScreenProfiler: ({ children }: { children: React.ReactNode }) => children }))
jest.mock('../lib/logger', () => ({ Logger: { debug: jest.fn(), warn: jest.fn(), error: jest.fn(), info: jest.fn(), journey: jest.fn() } }))
// One user object: the room adjusts state in render when the user changes identity.
const mockAuth = { user: { id: 'u1', name: 'Sneha' }, loading: false }
jest.mock('../lib/useAuth', () => ({ useAuth: () => mockAuth }))
jest.mock('../lib/apiClient', () => ({
  apiClient: {
    getChatMessages: jest.fn(),
    getChatGroups: jest.fn(),
    sendChatMessage: jest.fn(),
    reactToChatMessage: jest.fn(),
    rejoinChatGroup: jest.fn(),
    // The Blend's sides (crewsApi) read through the queue; nothing here is a Blend that loads.
    queuedRequest: jest.fn().mockResolvedValue({ success: false, errorCode: 'NOT_FOUND', error: 'Not found' }),
  },
}))
jest.mock('../lib/socketClient', () => {
  const noop = () => () => {}
  return {
    subscribeToLiveEnded: (cb: never) => {
      mockEnded.push(cb)
      return () => {}
    },
    subscribeToChatMessage: noop,
    subscribeToChatTyping: noop,
    subscribeToChatReaction: noop,
    subscribeToChatMessageDeleted: noop,
    subscribeToChatMemberBanned: (_room: string, cb: never) => {
      mockBanned.push(cb)
      return () => {}
    },
    subscribeToChatMemberLeft: noop,
    subscribeToChatMemberMuted: noop,
    rejoinChatSocket: (...a: unknown[]) => mockRejoin(...a),
    startTyping: jest.fn(),
    stopTyping: jest.fn(),
  }
})
jest.mock('../lib/checkIn', () => ({
  subscribeCheckInChanged: (f: () => void) => {
    mockChanged.add(f)
    return () => mockChanged.delete(f)
  },
}))
const mockLiveSync = jest.fn((_opts: { enabled?: boolean }) => ({ state: 'connected', connected: true }))
jest.mock('../lib/useLiveSync', () => ({ useLiveSync: (opts: { enabled?: boolean }) => mockLiveSync(opts) }))
jest.mock('../components/RealtimeStatusBanner', () => ({ __esModule: true, default: () => null }))
jest.mock('../components/chat/RoomGuidelinesBanner', () => ({ RoomGuidelinesBanner: () => null }))
jest.mock('../components/Toast', () => ({ useToast: () => ({ showToast: jest.fn() }) }))
jest.mock('../lib/notifications', () => ({ useActiveThread: jest.fn() }))

/* eslint-disable import/first */
import { router } from 'expo-router'
import { noteBlocked } from '../lib/blockEpoch'
import GroupChat from '../app/chat/[id]'
import { apiClient } from '../lib/apiClient'
/* eslint-enable import/first */

const refuse = (errorCode: string, error = 'No.') => ({ success: false, errorCode, error })
const served = { success: true, data: { messages: [], pagination: { hasMore: false, nextCursor: null } } }
const HOUR = 60 * 60 * 1000
const eventRow = (over: Record<string, unknown> = {}, event: Record<string, unknown> = {}) => ({
  id: 'g1',
  memberCount: 18,
  event: { id: 'e1', kind: 'event', title: 'Neon Nights', startTime: new Date(Date.now() + 27 * HOUR + 20 * 60 * 1000).toISOString(), ...event },
  ...over,
})

const flush = async () => {
  await act(async () => {
    for (let i = 0; i < 6; i++) await Promise.resolve()
  })
}

beforeEach(() => {
  mockEnded.length = 0
  mockBanned.length = 0
  mockChanged.clear()
  mockParams = { id: 'g1' }
  ;(apiClient.getChatMessages as jest.Mock).mockResolvedValue(served)
  ;(apiClient.getChatGroups as jest.Mock).mockResolvedValue({ success: true, data: { groups: [eventRow()] } })
})

describe('the pre-event room (C1, Flow 15 #8)', () => {
  it('counts down in the header and locks the composer before any send is refused', async () => {
    await render(<GroupChat />)
    await flush()
    expect(screen.getByLabelText(/^Opens in 3 hours 20 minutes, 18 in the room/)).toBeTruthy()
    expect(screen.getByText('Not open yet')).toBeTruthy()
    expect(screen.queryByLabelText('Message')).toBeNull()
  })

  it('says no count under five', async () => {
    ;(apiClient.getChatGroups as jest.Mock).mockResolvedValue({ success: true, data: { groups: [eventRow({ memberCount: 3 })] } })
    await render(<GroupChat />)
    await flush()
    expect(screen.getByLabelText('Opens in 3 hours 20 minutes')).toBeTruthy()
  })

  it('is an ordinary room once it is open: the live count, the field', async () => {
    ;(apiClient.getChatGroups as jest.Mock).mockResolvedValue({
      success: true,
      data: { groups: [eventRow({}, { startTime: new Date(Date.now() + 2 * HOUR).toISOString() })] },
    })
    await render(<GroupChat />)
    await flush()
    expect(screen.queryByText(/Opens in/)).toBeNull()
    expect(screen.getByLabelText('Message')).toBeTruthy()
    expect(screen.getByText(/in the room/)).toBeTruthy()
  })

  it('a place has no pre-event window', async () => {
    ;(apiClient.getChatGroups as jest.Mock).mockResolvedValue({
      success: true,
      data: { groups: [{ id: 'g1', name: 'Toit', event: { id: 'd1', kind: 'venue_day', venueId: 'v1', startTime: new Date(Date.now() + 40 * HOUR).toISOString() } }] },
    })
    await render(<GroupChat />)
    await flush()
    expect(screen.queryByText(/Opens in/)).toBeNull()
    expect(screen.getByLabelText('Message')).toBeTruthy()
  })
})

describe('a warning before contact details (C2, 5.10)', () => {
  beforeEach(() => {
    ;(apiClient.getChatGroups as jest.Mock).mockResolvedValue({
      success: true,
      data: { groups: [eventRow({}, { startTime: new Date(Date.now() + 2 * HOUR).toISOString() })] },
    })
  })

  it('appears while the text looks like a phone number, keeps Send enabled, and goes when it does not', async () => {
    await render(<GroupChat />)
    await flush()
    const field = screen.getByLabelText('Message')
    expect(screen.queryByTestId('room-composer-warning')).toBeNull()
    await fireEvent.changeText(field, 'call me on 9876543210')
    expect(screen.getByText(/This looks like a phone number\. This room is anonymous/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Send' }).props.accessibilityState).toMatchObject({ disabled: false })
    await fireEvent.changeText(field, 'see you there')
    expect(screen.queryByTestId('room-composer-warning')).toBeNull()
  })

  it('a crew room says its own sentence', async () => {
    mockParams = { id: 'g1', kind: 'crew', crewId: 'c1' }
    await render(<GroupChat />)
    await flush()
    await fireEvent.changeText(screen.getByLabelText('Message'), 'add me on insta')
    expect(screen.getByText(/People in this crew know who you are/)).toBeTruthy()
  })
})

describe('closed and removed rooms of a crew or a Blend (C3, C4)', () => {
  const crewRow = { rooms: [{ id: 'g1', name: 'Nebula', kind: 'crew', crewId: 'c1' }], groups: [] }
  beforeEach(() => {
    mockParams = { id: 'g1', kind: 'crew', crewId: 'c1' }
    ;(apiClient.getChatGroups as jest.Mock).mockResolvedValue({ success: true, data: crewRow })
  })

  it('a dissolved crew is the shared "isn’t here any more" card, not a read-only room', async () => {
    ;(apiClient.getChatMessages as jest.Mock).mockResolvedValue(refuse('NOT_FOUND'))
    await render(<GroupChat />)
    await flush()
    expect(screen.getByTestId('room-gone-card')).toBeTruthy()
    expect(screen.getByText('This crew isn’t here any more')).toBeTruthy()
    expect(screen.queryByLabelText('Message')).toBeNull()
  })

  it('a closed Blend is the "This Blend closed" card', async () => {
    mockParams = { id: 'g1', kind: 'blend', blendId: 'b1' }
    ;(apiClient.getChatMessages as jest.Mock).mockResolvedValue(refuse('CHAT_CLOSED'))
    await render(<GroupChat />)
    await flush()
    expect(screen.getByText('This Blend closed')).toBeTruthy()
  })

  it('being removed from a crew’s chat is its own line, not the card', async () => {
    ;(apiClient.getChatMessages as jest.Mock).mockResolvedValue(refuse('USER_BANNED', 'The organiser removed you.'))
    await render(<GroupChat />)
    await flush()
    expect(screen.getByText('You’re no longer in this crew’s chat')).toBeTruthy()
    expect(screen.queryByTestId('room-gone-card')).toBeNull()
  })

  it('removed live from a crew says the crew’s sentence, not the organiser’s', async () => {
    await render(<GroupChat />)
    await flush()
    await act(async () => mockBanned.forEach((f) => f({ userId: 'u1', banned: true })))
    expect(screen.getByText('You’re no longer in this crew’s chat')).toBeTruthy()
    expect(screen.queryByText(/organiser/)).toBeNull()
  })

  it('removed live from an event room still says the organiser did', async () => {
    mockParams = { id: 'g1' }
    ;(apiClient.getChatGroups as jest.Mock).mockResolvedValue({ success: true, data: { groups: [eventRow({}, { startTime: new Date(Date.now() + HOUR).toISOString() })] } })
    await render(<GroupChat />)
    await flush()
    await act(async () => mockBanned.forEach((f) => f({ userId: 'u1', banned: true })))
    expect(screen.getByText('You were removed from this room')).toBeTruthy()
  })

  it('a crew room you are not in does not tell you to check in at an event', async () => {
    ;(apiClient.getChatMessages as jest.Mock).mockResolvedValue(refuse('FORBIDDEN'))
    await render(<GroupChat />)
    await flush()
    expect(screen.getByText('You’re not in this crew’s chat')).toBeTruthy()
    expect(screen.queryByText(/check in at the event/i)).toBeNull()
    expect(screen.getByLabelText('Rejoin')).toBeTruthy()
  })

  it('an event room keeps its wording', async () => {
    mockParams = { id: 'g1' }
    ;(apiClient.getChatGroups as jest.Mock).mockResolvedValue({ success: true, data: { groups: [eventRow({}, { startTime: new Date(Date.now() + HOUR).toISOString() })] } })
    ;(apiClient.getChatMessages as jest.Mock).mockResolvedValue(refuse('FORBIDDEN'))
    await render(<GroupChat />)
    await flush()
    expect(screen.getByText('You’re not in this room')).toBeTruthy()
  })
})

describe('every live:ended reason has its own calm state (C6, 11.5)', () => {
  const place = { id: 'g1', name: 'Toit', event: { id: 'day-1', kind: 'venue_day', venueId: 'v1', title: 'Venue day · Toit', endTime: new Date(Date.now() + 5 * HOUR).toISOString() } }
  const NOT_LIVE = { success: false, errorCode: 'NOT_LIVE', error: 'You’re not live here any more.' }
  beforeEach(() => {
    ;(apiClient.getChatGroups as jest.Mock).mockResolvedValue({ success: true, data: { groups: [place] } })
  })
  const ended = async (reason: string) => {
    await render(<GroupChat />)
    await flush()
    ;(apiClient.getChatMessages as jest.Mock).mockResolvedValue(NOT_LIVE)
    await act(async () => mockEnded.forEach((f) => f({ eventId: 'day-1', reason })))
    await flush()
  }

  it('an event taking the place over hands off to the place', async () => {
    await ended('event_started')
    expect(screen.getByText('An event just started at Toit')).toBeTruthy()
    await act(async () => fireEvent.press(screen.getByLabelText('See what’s on here')))
    expect(router.push).toHaveBeenCalledWith('/venue/v1')
  })

  it('leaving the area, ending it yourself and switching are three different states', async () => {
    await ended('left_area')
    expect(screen.getByText('You left Toit')).toBeTruthy()
  })

  it('switching to another place goes back, with no way to "go live again" here', async () => {
    await ended('switched_event')
    expect(screen.getByText('You went live somewhere else')).toBeTruthy()
    expect(screen.queryByLabelText('Go live again')).toBeNull()
    await act(async () => fireEvent.press(screen.getByLabelText('Back to Banter')))
    expect(router.back).toHaveBeenCalled()
  })

  it('a read refused with NOT_LIVE and no socket reason is the plain state', async () => {
    ;(apiClient.getChatMessages as jest.Mock).mockResolvedValue(NOT_LIVE)
    await render(<GroupChat />)
    await flush()
    expect(screen.getByText('You’re not live here any more')).toBeTruthy()
  })
})

describe('a block made on another screen purges the feed (H2)', () => {
  const msg = (id: string, userId: string, name: string, content: string) => ({ id, userId, user: { name }, content, type: 'text', createdAt: '2026-10-22T20:00:00.000Z' })
  const feed = (...m: object[]) => ({ success: true, data: { messages: m, pagination: { hasMore: false, nextCursor: null } } })

  it('Room info blocks somebody, you come back, and their messages are gone — the loaded pages and all', async () => {
    ;(apiClient.getChatGroups as jest.Mock).mockResolvedValue({
      success: true,
      data: { groups: [eventRow({}, { startTime: new Date(Date.now() + HOUR).toISOString() })] },
    })
    ;(apiClient.getChatMessages as jest.Mock).mockResolvedValue(feed(msg('m1', 'u-fox', 'Fox', 'hello from fox'), msg('m2', 'u-owl', 'Owl', 'hello from owl')))
    await render(<GroupChat />)
    await flush()
    expect(screen.getByText('hello from fox')).toBeTruthy()

    // The server now leaves Fox out; the block was made on Room info, so this screen never saw the tap.
    ;(apiClient.getChatMessages as jest.Mock).mockResolvedValue(feed(msg('m2', 'u-owl', 'Owl', 'hello from owl')))
    await act(async () => noteBlocked())
    await flush()
    expect(screen.queryByText('hello from fox')).toBeNull()
    expect(screen.getByText('hello from owl')).toBeTruthy()
  })
})

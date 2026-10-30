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
    getChatGroups: jest.fn(), getRoomPreview: jest.fn(async () => ({ success: false })),
    getEventChat: jest.fn(),
    sendChatMessage: jest.fn(),
    reactToChatMessage: jest.fn(),
    rejoinChatGroup: jest.fn(),
    // The Blend's sides (crewsApi) read through the queue; nothing here is a Blend that loads.
    queuedRequest: jest.fn().mockResolvedValue({ success: false, errorCode: 'NOT_FOUND', error: 'Not found' }),
  },
}))
/** The event's checkout listeners: the header's count follows the server's recount. */
const mockCheckOut: ((data: { hereCount?: number }) => void)[] = []
jest.mock('../lib/socketClient', () => {
  const noop = () => () => {}
  return {
    subscribeToEventCheckIn: noop,
    subscribeToEventCheckOut: (_event: string, cb: (data: { hereCount?: number }) => void) => {
      mockCheckOut.push(cb)
      return () => {}
    },
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

  it('says the Room’s number, not the room’s members, and follows each recount (RC drive 3)', async () => {
    mockCheckOut.length = 0
    ;(apiClient.getChatGroups as jest.Mock).mockResolvedValue({
      success: true,
      data: { groups: [eventRow({ hereCount: 483, memberCount: 515 }, { startTime: new Date(Date.now() - HOUR).toISOString() })] },
    })
    await render(<GroupChat />)
    await flush()
    expect(screen.getByText('483')).toBeTruthy()
    expect(screen.queryByText('515')).toBeNull()
    // Somebody checks out: the server's recount, as the Room hears it.
    await act(async () => mockCheckOut.forEach((cb) => cb({ hereCount: 482 })))
    expect(screen.getByText('482')).toBeTruthy()
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

  it('a crew room’s header is the crew’s own emblem, read from the crew (TG-17, RC audit C23)', async () => {
    mockParams = { id: 'g1', kind: 'crew', crewId: 'c1' }
    ;(apiClient.queuedRequest as jest.Mock).mockImplementation(async (url: string) =>
      url.endsWith('/api/mobile/crews/c1') ? { success: true, data: { crewId: 'c1', emblemSeed: 'seed-nebula' } } : { success: false, errorCode: 'NOT_FOUND', error: 'Not found' }
    )
    await render(<GroupChat />)
    await flush()
    expect(screen.getByTestId('room-crew-emblem', { includeHiddenElements: true })).toBeTruthy()
    ;(apiClient.queuedRequest as jest.Mock).mockResolvedValue({ success: false, errorCode: 'NOT_FOUND', error: 'Not found' })
  })

  it('a crew room says its own sentence', async () => {
    mockParams = { id: 'g1', kind: 'crew', crewId: 'c1' }
    await render(<GroupChat />)
    await flush()
    await fireEvent.changeText(screen.getByLabelText('Message'), 'add me on insta')
    expect(screen.getByText(/A message with contact details is removed before anyone else sees it\./)).toBeTruthy()
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
    ;(apiClient.getChatMessages as jest.Mock).mockResolvedValue(refuse('USER_BANNED', 'The organizer removed you.'))
    await render(<GroupChat />)
    await flush()
    expect(screen.getByText('You’re no longer in this crew’s chat')).toBeTruthy()
    expect(screen.queryByTestId('room-gone-card')).toBeNull()
  })

  it('removed live from a crew says the crew’s sentence, not the organizer’s', async () => {
    await render(<GroupChat />)
    await flush()
    await act(async () => mockBanned.forEach((f) => f({ userId: 'u1', banned: true })))
    expect(screen.getByText('You’re no longer in this crew’s chat')).toBeTruthy()
    expect(screen.queryByText(/organizer/)).toBeNull()
  })

  it('removed live from an event room still says the organizer did', async () => {
    mockParams = { id: 'g1' }
    ;(apiClient.getChatGroups as jest.Mock).mockResolvedValue({ success: true, data: { groups: [eventRow({}, { startTime: new Date(Date.now() + HOUR).toISOString() })] } })
    await render(<GroupChat />)
    await flush()
    await act(async () => mockBanned.forEach((f) => f({ userId: 'u1', banned: true })))
    expect(screen.getByText('You were removed from this room')).toBeTruthy()
  })

  it('an unban brings the room back without reopening it (SCRUM-949)', async () => {
    mockParams = { id: 'g1' }
    ;(apiClient.getChatGroups as jest.Mock).mockResolvedValue({ success: true, data: { groups: [eventRow({}, { startTime: new Date(Date.now() + HOUR).toISOString() })] } })
    await render(<GroupChat />)
    await flush()
    await act(async () => mockBanned.forEach((f) => f({ userId: 'u1', banned: true })))
    expect(screen.getByText('You were removed from this room')).toBeTruthy()
    ;(apiClient.getChatMessages as jest.Mock).mockClear()

    await act(async () => mockBanned.forEach((f) => f({ userId: 'u1', banned: false })))
    await flush()

    expect(apiClient.getChatMessages).toHaveBeenCalled()
    expect(screen.queryByText('You were removed from this room')).toBeNull()
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
    expect(screen.getByText('You checked in somewhere else')).toBeTruthy()
    expect(screen.queryByLabelText('Go live again')).toBeNull()
    await act(async () => fireEvent.press(screen.getByLabelText('Back to Banter')))
    expect(router.back).toHaveBeenCalled()
  })

  it('a read refused with NOT_LIVE and no socket reason is the plain state', async () => {
    ;(apiClient.getChatMessages as jest.Mock).mockResolvedValue(NOT_LIVE)
    await render(<GroupChat />)
    await flush()
    expect(screen.getByText('Not live here any more')).toBeTruthy()
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

describe('polls in the feed are read only once seen (M6)', () => {
  it('reads nothing until the row is viewable, then reads once', async () => {
    ;(apiClient.getChatGroups as jest.Mock).mockResolvedValue({
      success: true,
      data: { groups: [eventRow({}, { startTime: new Date(Date.now() + HOUR).toISOString() })] },
    })
    ;(apiClient.getChatMessages as jest.Mock).mockResolvedValue({
      success: true,
      data: { messages: [{ id: 'poll-1', userId: 'u-org', user: { name: 'Organizer' }, content: 'Which set first?', type: 'poll', pollId: 'p1', createdAt: '2026-10-22T20:00:00.000Z' }], pagination: { hasMore: false, nextCursor: null } },
    })
    const queued = (apiClient as unknown as { queuedRequest: jest.Mock }).queuedRequest
    queued.mockClear()
    jest.spyOn(Math, 'random').mockReturnValue(0)
    await render(<GroupChat />)
    await flush()
    expect(screen.getByText('Poll: Which set first?')).toBeTruthy()
    expect(queued).not.toHaveBeenCalledWith('/api/mobile/events/e1/polls/p1')
    await act(async () =>
      fireEvent(screen.getByTestId('room-feed'), 'viewableItemsChanged', { viewableItems: [{ item: { kind: 'message', message_type: 'poll', message_id: 'poll-1' }, isViewable: true }], changed: [] })
    )
    await flush()
    expect(queued).toHaveBeenCalledWith('/api/mobile/events/e1/polls/p1')
    jest.restoreAllMocks()
  })
})

describe('a room opens already muted, locked or closed (ROOM-05)', () => {
  const open = { startTime: new Date(Date.now() - HOUR).toISOString() }
  const door = (data: Record<string, unknown>) => ({ success: true, data: { chatGroupId: 'g1', status: 'active', ...data } })
  beforeEach(() => {
    ;(apiClient.getChatGroups as jest.Mock).mockResolvedValue({ success: true, data: { groups: [eventRow({}, open)] } })
  })

  it('muted: read-only before anybody types, with the server\'s sentence', async () => {
    ;(apiClient.getEventChat as jest.Mock).mockResolvedValue(door({ write: { allowed: false, reason: 'muted', message: null } }))
    await render(<GroupChat />)
    await flush()
    expect(screen.getByText('Muted')).toBeTruthy()
    expect(screen.queryByLabelText('Message')).toBeNull()
  })

  it('locked by the organiser (the room\'s status, which a mute would hide in write.reason)', async () => {
    ;(apiClient.getEventChat as jest.Mock).mockResolvedValue(door({ status: 'locked', write: { allowed: false, reason: 'muted', message: null } }))
    await render(<GroupChat />)
    await flush()
    expect(screen.getByText('Read only')).toBeTruthy()
  })

  it('window closed: the closed state in the server\'s words', async () => {
    ;(apiClient.getEventChat as jest.Mock).mockResolvedValue(door({ write: { allowed: false, reason: 'window_closed', message: 'This chat has closed. Event chats stay open for 24 hours after the event ends.' } }))
    await render(<GroupChat />)
    await flush()
    expect(screen.getByText('This chat has closed')).toBeTruthy()
  })

  it('allowed: a live composer', async () => {
    ;(apiClient.getEventChat as jest.Mock).mockResolvedValue(door({ write: { allowed: true, reason: null, message: null } }))
    await render(<GroupChat />)
    await flush()
    expect(screen.getByLabelText('Message')).toBeTruthy()
  })

  it('a door that cannot be read leaves the composer as it was', async () => {
    ;(apiClient.getEventChat as jest.Mock).mockRejectedValue(new Error('offline'))
    await render(<GroupChat />)
    await flush()
    expect(screen.getByLabelText('Message')).toBeTruthy()
  })
})

describe('a room that is not on the Banter’s first page opens read-only too (ROOM-05, H1)', () => {
  const MUTED = { allowed: false, reason: 'muted', message: null }
  const served = (extra: Record<string, unknown>) => ({ success: true, data: { messages: [], pagination: { hasMore: false, nextCursor: null }, ...extra } })
  beforeEach(() => {
    // Opened from a push or a link: the Banter's list does not hold it.
    ;(apiClient.getChatGroups as jest.Mock).mockResolvedValue({ success: true, data: { groups: [] } })
    ;(apiClient.getEventChat as jest.Mock).mockReset()
  })

  it('new server: the messages read carries write + status, so Muted shows before typing and no second read is made', async () => {
    mockParams = { id: 'g1', eventId: 'e1' }
    ;(apiClient.getChatMessages as jest.Mock).mockResolvedValue(served({ status: 'active', write: MUTED }))
    await render(<GroupChat />)
    await flush()
    expect(screen.getByText('Muted')).toBeTruthy()
    expect(screen.queryByLabelText('Message')).toBeNull()
    expect(apiClient.getEventChat).not.toHaveBeenCalled()
  })

  it('new server: the room’s own status locks it, whatever the viewer’s reason', async () => {
    mockParams = { id: 'g1', eventId: 'e1' }
    ;(apiClient.getChatMessages as jest.Mock).mockResolvedValue(served({ status: 'locked', write: { allowed: false, reason: 'muted', message: null } }))
    await render(<GroupChat />)
    await flush()
    expect(screen.getByText('Read only')).toBeTruthy()
  })

  it('old server (no write in the messages): falls back to the event’s door, asked with limit 1 from the opener’s event id', async () => {
    mockParams = { id: 'g1', eventId: 'e1' }
    ;(apiClient.getChatMessages as jest.Mock).mockResolvedValue(served({}))
    ;(apiClient.getEventChat as jest.Mock).mockResolvedValue({ success: true, data: { chatGroupId: 'g1', status: 'active', write: MUTED } })
    await render(<GroupChat />)
    await flush()
    expect(apiClient.getEventChat).toHaveBeenCalledWith('e1', { limit: 1 })
    expect(screen.getByText('Muted')).toBeTruthy()
    expect(screen.queryByLabelText('Message')).toBeNull()
  })

  it('old server, the door read fails: the room stays as it was, and the failure is logged', async () => {
    mockParams = { id: 'g1', eventId: 'e1' }
    ;(apiClient.getChatMessages as jest.Mock).mockResolvedValue(served({}))
    ;(apiClient.getEventChat as jest.Mock).mockRejectedValue(new Error('offline'))
    const { Logger } = require('../lib/logger') as { Logger: { warn: jest.Mock } }
    await render(<GroupChat />)
    await flush()
    expect(screen.getByLabelText('Message')).toBeTruthy()
    expect(Logger.warn).toHaveBeenCalledWith('chat', expect.stringContaining('lock'), expect.anything())
  })

  it('the cached Banter-row lock does not wait for the history read', async () => {
    mockParams = { id: 'g1', eventId: 'e1' }
    ;(apiClient.getChatGroups as jest.Mock).mockResolvedValue({ success: true, data: { groups: [{ id: 'g1', status: 'locked' }] } })
    ;(apiClient.getChatMessages as jest.Mock).mockReturnValue(new Promise(() => {})) // never answers
    await render(<GroupChat />)
    await flush()
    expect(screen.getByText('Read only')).toBeTruthy()
  })
})

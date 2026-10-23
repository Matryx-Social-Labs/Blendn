/**
 * Room info (Flow 5 Room info frames, R3-D5 5.12), rendered: the cover only
 * from the server's row, the crowd with its role badges, the members' failed
 * read, the muted hero, and the Mute and Leave sheets.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native'

let mockParams: Record<string, string> = { id: 'g1' }
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
)
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
  Stack: { Screen: () => null },
  useLocalSearchParams: () => mockParams,
}))
jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default)
jest.mock('../lib/logger', () => ({ Logger: { debug: jest.fn(), warn: jest.fn(), error: jest.fn(), info: jest.fn(), journey: jest.fn() } }))
jest.mock('../lib/useAuth', () => ({ useAuth: () => ({ user: { id: 'u-a' } }) }))
jest.mock('../lib/apiClient', () => ({
  apiClient: { getChatGroups: jest.fn(), getChatParticipants: jest.fn(), getEventMatches: jest.fn(), getVenue: jest.fn(), setChatGroupMute: jest.fn(), leaveChatGroup: jest.fn() },
}))
/** The event's checkout listeners: Room info's count follows the server's recount. */
const mockCheckOut: ((data: { hereCount?: number }) => void)[] = []
jest.mock('../lib/socketClient', () => ({
  subscribeToChatMemberLeft: () => () => {},
  subscribeToEventCheckIn: () => () => {},
  subscribeToEventCheckOut: (_event: string, cb: (data: { hereCount?: number }) => void) => {
    mockCheckOut.push(cb)
    return () => {}
  },
}))
// The card's own block flow is SenderCard's; this room only needs to hear that somebody was blocked.
const mockCard: { props?: { sender: unknown; onBlocked: (id: string) => void } } = {}
jest.mock('../components/chat/SenderCard', () => ({
  SenderCard: (props: { sender: unknown; onBlocked: (id: string) => void }) => {
    mockCard.props = props
    return null
  },
}))
jest.mock('../components/Toast', () => ({ useToast: () => ({ showToast: jest.fn() }) }))

/* eslint-disable import/first */
import RoomInfo from '../app/chat-info/[id]'
import { apiClient } from '../lib/apiClient'
import { noteBlocked } from '../lib/blockEpoch'
import { resetRoomMembership } from '../lib/roomMembership'
/* eslint-enable import/first */

const api = apiClient as jest.Mocked<typeof apiClient>
const COVER = 'https://cdn.blendn.app/covers/vinyl.jpg'
const eventRow = { id: 'g1', name: 'Vinyl Night', memberCount: 3, event: { id: 'e1', title: 'Vinyl Night', coverImageUrl: COVER } }
const crowd = {
  success: true,
  data: {
    participants: [
      { userId: 'u-o', name: 'Amber Fox', role: 'admin' },
      { userId: 'u-m', name: 'Quiet Otter', role: 'moderator' },
      { userId: 'u-a', name: 'Cosmic Panda', role: 'member' },
    ],
    totalCount: 3,
  },
}

type HostNode = { props?: Record<string, unknown>; children?: (HostNode | string)[] | null }
const imageUris = (): string[] => {
  const walk = (n: HostNode | string | null): string[] => {
    if (!n || typeof n === 'string') return []
    const sources = [n.props?.source, n.props?.src].flat() as ({ uri?: string } | string | undefined)[]
    const own = sources.map((x) => (typeof x === 'string' ? x : x?.uri)).filter((x): x is string => typeof x === 'string')
    return [...own, ...(n.children ?? []).flatMap(walk)]
  }
  const root = screen.toJSON() as HostNode | HostNode[] | null
  return (Array.isArray(root) ? root : [root]).flatMap(walk)
}
const open = async () => {
  await render(<RoomInfo />)
  await act(async () => {
    for (let i = 0; i < 8; i++) await Promise.resolve()
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  resetRoomMembership()
  mockParams = { id: 'g1' }
  api.getChatGroups.mockResolvedValue({ success: true, data: { groups: [eventRow] } } as never)
  api.getChatParticipants.mockResolvedValue(crowd as never)
})

it('draws the server’s cover and title, never an image or a name from the route', async () => {
  mockParams = { id: 'g1', roomName: 'Blendn Support', eventImage: 'https://attacker.example/p.png' }
  await open()
  expect(imageUris().some((u) => u.includes('attacker.example'))).toBe(false)
  expect(imageUris()).toContain(COVER)
  expect(screen.queryByText('Blendn Support')).toBeNull()
  expect(screen.getAllByText('Vinyl Night').length).toBeGreaterThan(0)
})

it('the crowd: creatures with their role badges, and you as "You"', async () => {
  await open()
  expect(screen.getByLabelText('Amber Fox, Organiser')).toBeTruthy()
  expect(screen.getByLabelText('Quiet Otter, Moderator')).toBeTruthy()
  expect(screen.getByLabelText('You')).toBeTruthy()
})

it('a failed read of the crowd says so and offers to try again', async () => {
  api.getChatParticipants.mockResolvedValue({ success: false, error: 'Network request failed' } as never)
  await open()
  expect(screen.getByText('Couldn’t load who’s in this room')).toBeTruthy()
})

it('muted: the hero says so, and Mute offers Unmute', async () => {
  api.getChatGroups.mockResolvedValue({ success: true, data: { groups: [{ ...eventRow, mute: { muted: true, until: null } }] } } as never)
  await open()
  expect(screen.getByTestId('info-muted')).toBeTruthy()
  await act(async () => fireEvent.press(screen.getByTestId('info-mute')))
  expect(screen.getByLabelText('Unmute')).toBeTruthy()
})

it('Mute opens the four choices; Leave is apart and asks first', async () => {
  await open()
  await act(async () => fireEvent.press(screen.getByTestId('info-mute')))
  for (const label of ['For 1 hour', 'For 8 hours', 'Until tomorrow', 'Until I turn it back on']) expect(screen.getByText(label)).toBeTruthy()
  await act(async () => fireEvent.press(screen.getByLabelText('Cancel')))
  await act(async () => fireEvent.press(screen.getByTestId('info-leave')))
  expect(screen.getByText('Leave this room?')).toBeTruthy()
  expect(api.leaveChatGroup).not.toHaveBeenCalled()
})

describe('nothing collides with the clock or the back button (drive 2)', () => {
  it('the shield covers the inset and the back button’s row; a role badge never wraps', async () => {
    await open()
    const { StyleSheet } = require('react-native')
    const { SIZE, SPACE } = require('../lib/design/tokens')
    const shield = StyleSheet.flatten(screen.getByTestId('info-status-shield').props.style)
    // The inset (whatever the device's), the back button's row and the 10 pt the glass reaches under it.
    expect(shield.height).toBeGreaterThanOrEqual(SIZE.circleButton + SPACE.sm + SPACE.xxs)
    expect(screen.getByText('ORGANISER').props.numberOfLines).toBe(1)
  })
})

describe('the hero with no cover, and the rows’ edge (r7 M6, L1)', () => {
  const { StyleSheet } = require('react-native')
  const { COLOR, SPACE } = require('../lib/design/tokens')

  it('a room with no cover draws the brand orbs on ink, never a flat grey band', async () => {
    api.getChatGroups.mockResolvedValue({ success: true, data: { groups: [{ ...eventRow, event: { ...eventRow.event, coverImageUrl: null } }] } } as never)
    await open()
    expect(screen.getByTestId('info-hero-orbs', { includeHiddenElements: true })).toBeTruthy()
    expect(StyleSheet.flatten(screen.getByTestId('info-hero', { includeHiddenElements: true }).props.style).backgroundColor).toBe(COLOR.ink)
  })

  it('with a cover, the photograph and no orbs', async () => {
    await open()
    expect(imageUris()).toContain(COVER)
    expect(screen.queryByTestId('info-hero-orbs', { includeHiddenElements: true })).toBeNull()
  })

  it('Leave room’s words start on the rows’ text edge (SettingsRow’s 16 pt from the glyph)', async () => {
    await open()
    let node = screen.getByText('Leave room').parent
    while (node && StyleSheet.flatten(node.props.style)?.minHeight === undefined) node = node.parent
    expect(StyleSheet.flatten(node!.props.style).gap).toBe(SPACE.lg)
  })
})

describe('a room of thousands (large data)', () => {
  const page = (from: number, n: number, totalCount: number) => ({
    success: true,
    data: { participants: Array.from({ length: n }, (_, i) => ({ userId: `u-${from + i}`, name: `Fox ${from + i}`, role: 'member' })), totalCount },
  })
  const list = () => screen.getByTestId('info-list')
  const reachEnd = async () => act(async () => fireEvent(list(), 'endReached'))

  it('never mounts a page of 100 at once, and says the truthful total, not what has loaded', async () => {
    api.getChatGroups.mockResolvedValue({ success: true, data: { groups: [{ ...eventRow, memberCount: 5000 }] } } as never)
    api.getChatParticipants.mockResolvedValue(page(0, 100, 5000) as never)
    await open()
    // The hero's line and the heading both say it, grouped (WP2's SectionHeader groups a count in thousands).
    expect(screen.getAllByText('5,000').length).toBeGreaterThan(0)
    expect(screen.getByLabelText('In the room, 5,000')).toBeTruthy()
    const mounted = screen.queryAllByTestId(/^info-member-/).length
    expect(mounted).toBeGreaterThan(0)
    // Six rows of four: the first window, not the page (without windowSize and initialNumToRender it is 40).
    expect(mounted).toBeLessThanOrEqual(24)
  })

  it('asks for the next page from where the list stands as the end comes near, one at a time', async () => {
    api.getChatParticipants.mockResolvedValueOnce(page(0, 100, 250) as never).mockResolvedValueOnce(page(100, 100, 250) as never)
    await open()
    expect(api.getChatParticipants).toHaveBeenLastCalledWith('g1', { limit: 100, offset: 0 })
    await reachEnd()
    expect(api.getChatParticipants).toHaveBeenLastCalledWith('g1', { limit: 100, offset: 100 })
    expect(api.getChatParticipants).toHaveBeenCalledTimes(2)
  })

  it('stops asking once everybody is here', async () => {
    api.getChatParticipants.mockResolvedValue(page(0, 3, 3) as never)
    await open()
    await reachEnd()
    expect(api.getChatParticipants).toHaveBeenCalledTimes(1)
  })

  it('a later page that fails keeps who is shown and offers its own retry', async () => {
    api.getChatParticipants.mockResolvedValueOnce(page(0, 100, 250) as never).mockResolvedValueOnce({ success: false, error: 'offline' } as never)
    await open()
    await reachEnd()
    expect(screen.getByTestId('info-members-more-failed')).toBeTruthy()
    expect(screen.queryByText('Couldn’t load who’s in this room')).toBeNull()
    // The list does not hammer a failing page on every scroll event.
    await reachEnd()
    expect(api.getChatParticipants).toHaveBeenCalledTimes(2)
    api.getChatParticipants.mockResolvedValueOnce(page(100, 100, 250) as never)
    await act(async () => fireEvent.press(screen.getByTestId('info-members-more-failed')))
    expect(api.getChatParticipants).toHaveBeenLastCalledWith('g1', { limit: 100, offset: 100 })
    expect(screen.queryByTestId('info-members-more-failed')).toBeNull()
  })

  it('draws no presence: a person is a creature and a name', async () => {
    api.getChatParticipants.mockResolvedValue(page(0, 5, 5) as never)
    await open()
    expect(screen.queryByText(/online|active now|here now/i)).toBeNull()
  })

  it('says no count under five', async () => {
    api.getChatGroups.mockResolvedValue({ success: true, data: { groups: [{ ...eventRow, memberCount: 3 }] } } as never)
    await open()
    expect(screen.queryByText(/in the room/)).toBeNull()
    expect(screen.queryByLabelText(/^In the room, /)).toBeNull()
  })
})

describe('one number for the room (RC drive 3)', () => {
  const page = (n: number, totalCount: number) => ({
    success: true,
    data: { participants: Array.from({ length: n }, (_, i) => ({ userId: `u-${i}`, name: `Fox ${i}`, role: 'member' })), totalCount },
  })

  it('says the Room’s number on both lines: not the 515 members, not the 450 listed', async () => {
    api.getChatGroups.mockResolvedValue({ success: true, data: { groups: [{ ...eventRow, hereCount: 483, memberCount: 515 }] } } as never)
    api.getChatParticipants.mockResolvedValue(page(100, 450) as never)
    await open()
    expect(screen.getByLabelText('In the room, 483')).toBeTruthy()
    expect(screen.getAllByText('483').length).toBe(2)
    expect(screen.queryByText('515')).toBeNull()
    expect(screen.queryByText('450')).toBeNull()
  })

  it('follows the server’s recount as people check out', async () => {
    mockCheckOut.length = 0
    api.getChatGroups.mockResolvedValue({ success: true, data: { groups: [{ ...eventRow, hereCount: 483 }] } } as never)
    api.getChatParticipants.mockResolvedValue(page(100, 450) as never)
    await open()
    await act(async () => mockCheckOut.forEach((cb) => cb({ hereCount: 482 })))
    expect(screen.getByLabelText('In the room, 482')).toBeTruthy()
  })
})

describe('a place’s room (C5, 5-2)', () => {
  const placeRow = { id: 'g1', name: 'Toit', memberCount: 3, event: { id: 'd1', kind: 'venue_day', venueId: 'v1', title: 'Venue day · Toit · 2026-10-22' } }
  beforeEach(() => {
    api.getChatGroups.mockResolvedValue({ success: true, data: { groups: [placeRow] } } as never)
    api.getVenue.mockResolvedValue({ success: true, data: { live: { liveNow: '5-9' } } } as never)
  })

  it('is titled for the place and says a bucket, never the exact count', async () => {
    await open()
    expect(screen.getByText('Toit · tonight')).toBeTruthy()
    expect(screen.getByText('5–9')).toBeTruthy()
    expect(screen.queryByText('3')).toBeNull()
    // Its people are not counted in the section heading either.
    expect(screen.queryByLabelText(/^In the room, \d/)).toBeNull()
  })

  it('leaving says what it does to tonight, and that going live again brings you back', async () => {
    await open()
    expect(screen.getByText('You leave Toit’s room for tonight. Go live again any time you’re here.')).toBeTruthy()
  })

  it('below five live it says nothing rather than "Under 5"', async () => {
    api.getVenue.mockResolvedValue({ success: true, data: { live: { liveNow: 'quiet' } } } as never)
    await open()
    expect(screen.queryByText(/in the room/)).toBeNull()
  })
})

describe('a block takes the person off the list (safety)', () => {
  it('removes them from what is loaded, and the next page asks from where the list now stands', async () => {
    const page = (from: number, n: number, totalCount: number) => ({
      success: true,
      data: { participants: Array.from({ length: n }, (_, i) => ({ userId: `u-${from + i}`, name: `Fox ${from + i}`, role: 'member' })), totalCount },
    })
    api.getChatGroups.mockResolvedValue({ success: true, data: { groups: [{ ...eventRow, memberCount: 250 }] } } as never)
    api.getChatParticipants.mockResolvedValueOnce(page(0, 100, 250) as never).mockResolvedValueOnce(page(101, 100, 249) as never)
    await open()
    await act(async () => fireEvent.press(screen.getByTestId('info-member-u-1')))
    await act(async () => mockCard.props!.onBlocked('u-1'))
    expect(screen.queryByTestId('info-member-u-1')).toBeNull()
    // Off the list, and still in the room: the count is the room's, as the Room and the chat say it (RC drive 3).
    expect(screen.getByLabelText('In the room, 250')).toBeTruthy()
    await act(async () => fireEvent(screen.getByTestId('info-list'), 'endReached'))
    // 99 held now, and the server's own list no longer has them: the next page starts at 99.
    expect(api.getChatParticipants).toHaveBeenLastCalledWith('g1', { limit: 100, offset: 99 })
  })
})

it('a block made anywhere reads the roster again from the start (H2)', async () => {
  await open()
  api.getChatParticipants.mockClear()
  api.getChatParticipants.mockResolvedValue({ success: true, data: { participants: [{ userId: 'u-a', name: 'Cosmic Panda', role: 'member' }], totalCount: 1 } } as never)
  await act(async () => noteBlocked())
  expect(api.getChatParticipants).toHaveBeenCalledWith('g1', { limit: 100, offset: 0 })
  expect(screen.queryByLabelText('Amber Fox, Organiser')).toBeNull()
})

it('lists its rows by fixed layout once the header is measured, and not before (getItemLayout)', async () => {
  await open()
  expect(screen.getByTestId('info-list').props.getItemLayout).toBeUndefined()
  await act(async () => fireEvent(screen.getByTestId('info-header'), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 400, height: 700 } } }))
  const layout = screen.getByTestId('info-list').props.getItemLayout as (d: unknown, i: number) => { length: number; offset: number; index: number }
  const first = layout(null, 0)
  const third = layout(null, 2)
  expect(first.offset).toBe(700)
  expect(third.offset - first.offset).toBe(2 * first.length)
})

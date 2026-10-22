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
  apiClient: { getChatGroups: jest.fn(), getChatParticipants: jest.fn(), getEventMatches: jest.fn(), setChatGroupMute: jest.fn(), leaveChatGroup: jest.fn() },
}))
jest.mock('../lib/socketClient', () => ({ subscribeToChatMemberLeft: () => () => {} }))
jest.mock('../components/Toast', () => ({ useToast: () => ({ showToast: jest.fn() }) }))

/* eslint-disable import/first */
import RoomInfo from '../app/chat-info/[id]'
import { apiClient } from '../lib/apiClient'
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

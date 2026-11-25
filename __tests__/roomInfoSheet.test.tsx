/*
 * Room info as a sheet over the room (Flow 5 C6, I-A): the event, Mute / Guidelines / Report, the host as the org,
 * In the room (faces, the exact count, See all), and one exit, Check out.
 */
import { act, fireEvent, render, screen, within } from '@testing-library/react-native'
import React from 'react'

const mockGetEvent = jest.fn()
const mockLeave = jest.fn()
jest.mock('../lib/apiClient', () => ({
  apiClient: { getEvent: (...a: unknown[]) => mockGetEvent(...a), leaveChatGroup: (...a: unknown[]) => mockLeave(...a) },
}))
jest.mock('../lib/logger', () => ({ Logger: { debug: jest.fn(), warn: jest.fn(), error: jest.fn(), info: jest.fn() } }))
const mockReport = jest.fn()
jest.mock('../lib/safetyUtils', () => ({ showRoomReportOptions: (...a: unknown[]) => mockReport(...a) }))
const mockOpenInApp = jest.fn(async () => {})
jest.mock('../lib/links', () => ({ openInApp: (...a: unknown[]) => mockOpenInApp(...(a as [])) }))
jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default)

/* eslint-disable import/first */
import { cardFill, RoomInfoSheet } from '../components/blendn/RoomInfoSheet'
import { COLOR } from '../lib/design/tokens'
/* eslint-enable import/first */

const HIDDEN = { includeHiddenElements: true }
const detail = (organizer: unknown) => ({
  success: true,
  data: {
    id: 'e1',
    title: 'Rooftop Sundowner: House & Disco',
    startTime: '2026-11-14T12:30:00.000Z',
    timezone: 'Asia/Kolkata',
    venueName: 'High Ultra Lounge',
    coverImageUrl: null,
    organizer,
  },
})
const NIGHTSHIFT = { id: 'u-org', name: 'Nightshift Collective', image: 'https://cdn/x.jpg', kind: 'org' }
const faces = [
  { kind: 'creature' as const, pseudonym: 'Quiet Lynx' },
  { kind: 'creature' as const, pseudonym: 'Lunar Fox' },
  { kind: 'creature' as const, pseudonym: 'Amber Wave' },
  { kind: 'creature' as const, pseudonym: 'Night Owl' },
]

const handlers = { onClose: jest.fn(), onMute: jest.fn(), onSeeAll: jest.fn(), onCheckOut: jest.fn() }
beforeEach(() => {
  jest.clearAllMocks()
  mockGetEvent.mockResolvedValue(detail(NIGHTSHIFT))
})

const open = async (over: Partial<React.ComponentProps<typeof RoomInfoSheet>> = {}) => {
  await render(
    <RoomInfoSheet visible eventId="e1" title="Rooftop Sundowner" chatGroupId="g1" hereCount={12480} faces={faces} mutedLabel={null} {...handlers} {...over} />
  )
  await act(async () => {})
}

describe('Room info (I-A)', () => {
  it('the blocks in the board’s order: event, Mute · Guidelines · Report, host, In the room, Check out', async () => {
    await open()
    expect(mockGetEvent).toHaveBeenCalledWith('e1')
    const order = ['room-info-event', 'room-info-mute', 'room-info-guidelines', 'room-info-report', 'room-info-host', 'room-info-people', 'room-info-check-out']
    const ids: string[] = []
    const walk = (n: unknown): void => {
      if (!n || typeof n !== 'object') return
      if (Array.isArray(n)) return n.forEach(walk)
      const node = n as { props?: { testID?: unknown }; children?: unknown }
      if (typeof node.props?.testID === 'string' && order.includes(node.props.testID) && !ids.includes(node.props.testID)) ids.push(node.props.testID)
      walk(node.children)
    }
    walk(screen.toJSON())
    expect(ids).toEqual(order)
    expect(screen.getByText('Rooftop Sundowner: House & Disco', HIDDEN)).toBeTruthy()
    expect(screen.getByText('Tonight · 6 PM · High Ultra Lounge', HIDDEN)).toBeTruthy()
  })

  it('the host is the org with Host under it, a megaphone mark: never a face, a creature or ORGANIZER', async () => {
    await open()
    const host = screen.getByTestId('room-info-host', HIDDEN)
    expect(within(host).getByText('Nightshift Collective', HIDDEN)).toBeTruthy()
    expect(within(host).getByText('Host', HIDDEN)).toBeTruthy()
    expect(within(host).getByTestId('room-info-host-mark', HIDDEN)).toBeTruthy()
    expect(within(host).queryAllByTestId(/avatar|creature|photo|pile/i, HIDDEN)).toHaveLength(0)
    expect(screen.queryByText(/organi[sz]er/i, HIDDEN)).toBeNull()
    expect(host.props.accessibilityLabel).toBe('Host, Nightshift Collective')
  })

  // Control (owner call D2, A): the platform standing in is nobody running the night.
  // SCRUM-1115: a person's own event carries an id (the creator) and their name; it is not a host either.
  it.each([
    ['the platform stands in', { id: null, name: 'Blendn', image: null, kind: 'platform' }],
    ['it is a person’s own event', { id: 'u-7', name: 'Priya Raman', image: null, kind: 'person' }],
  ])('no host row when %s', async (_, organizer) => {
    mockGetEvent.mockResolvedValue(detail(organizer))
    await open()
    expect(screen.queryByTestId('room-info-host', HIDDEN)).toBeNull()
    expect(screen.getByTestId('room-info-people', HIDDEN)).toBeTruthy()
  })

  it('In the room: three faces, the exact count, See all goes to the crowd', async () => {
    await open()
    expect(screen.getByText('12,480', HIDDEN)).toBeTruthy()
    expect(screen.getByText('See all', HIDDEN)).toBeTruthy()
    expect(screen.getAllByTestId(/^room-info-pile-face/, HIDDEN)).toHaveLength(3)
    await fireEvent.press(screen.getByTestId('room-info-people', HIDDEN))
    expect(handlers.onSeeAll).toHaveBeenCalledTimes(1)
  })

  it('under the floor the count is not said', async () => {
    await open({ hereCount: 3 })
    expect(screen.queryByText('3', HIDDEN)).toBeNull()
    expect(screen.getByText('In the room', HIDDEN)).toBeTruthy()
  })

  it('Check out is the one exit: it asks the room’s check out, never leaves the chat', async () => {
    await open()
    expect(screen.queryByText('Leave room', HIDDEN)).toBeNull()
    await fireEvent.press(screen.getByTestId('room-info-check-out', HIDDEN))
    expect(handlers.onCheckOut).toHaveBeenCalledTimes(1)
    expect(mockLeave).not.toHaveBeenCalled()
  })

  it('Mute opens the mute sheet', async () => {
    await open()
    await fireEvent.press(screen.getByTestId('room-info-mute', HIDDEN))
    expect(handlers.onMute).toHaveBeenCalledTimes(1)
  })

  it('a muted room says how long', async () => {
    await open({ mutedLabel: 'Muted for 1 hour' })
    expect(screen.getByText('Muted for 1 hour', HIDDEN)).toBeTruthy()
  })

  it('Report this room opens the room’s report options; Guidelines opens in the app', async () => {
    await open()
    await fireEvent.press(screen.getByTestId('room-info-report', HIDDEN))
    expect(mockReport).toHaveBeenCalledWith('g1')
    await fireEvent.press(screen.getByTestId('room-info-guidelines', HIDDEN))
    expect(mockOpenInApp).toHaveBeenCalled()
  })

  it('no chat yet: no Mute and no Report (nothing to silence or report)', async () => {
    await open({ chatGroupId: null })
    expect(screen.queryByTestId('room-info-mute', HIDDEN)).toBeNull()
    expect(screen.queryByTestId('room-info-report', HIDDEN)).toBeNull()
    expect(screen.getByTestId('room-info-check-out', HIDDEN)).toBeTruthy()
  })

  it('before the detail answers it shows the room’s own title, and a failed detail keeps it', async () => {
    mockGetEvent.mockResolvedValue({ success: false })
    await open()
    expect(screen.getByText('Rooftop Sundowner', HIDDEN)).toBeTruthy()
    expect(screen.queryByTestId('room-info-host', HIDDEN)).toBeNull()
  })
})

describe('the cards show on both platforms’ sheets', () => {
  it('on Android’s surface sheet a card is sunken, never the sheet’s own surface', () => {
    expect(cardFill('surface')).toBe(COLOR.surfaceSunken)
    expect(cardFill('surface')).not.toBe(COLOR.surface)
  })
  // Control: iOS's glass sheet keeps the board's surface card.
  it('on iOS’s glass a card is surface', () => expect(cardFill('glass')).toBe(COLOR.surface))
})

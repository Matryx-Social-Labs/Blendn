/**
 * Lobby PR 5 (SCRUM-1026): P-A, the event page's Lobby card, and its live form (4b, "The room is open"); Going's
 * "New in the Lobby" row; and the Lobby's two alert switches.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native'

jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default)
const mockPush = jest.fn()
jest.mock('expo-router', () => ({
  router: { push: (...a: unknown[]) => mockPush(...a) },
  useFocusEffect: (effect: () => void) => {
    const { useEffect } = require('react')
    useEffect(effect, [effect])
  },
}))
jest.mock('../lib/apiClient', () => ({
  apiClient: { getBoardPreview: jest.fn(), getBoard: jest.fn(), getBoardAlerts: jest.fn(), setBoardAlerts: jest.fn() },
}))

import { EventLobbyPreview, LobbyRowNews, NewInLobbyRow } from '../components/board/LobbyPreview'
import { LobbyAlertsSheet } from '../components/board/LobbyAlertsSheet'
import { apiClient } from '../lib/apiClient'
import { WORST } from './helpers/longText'
import { StyleSheet } from 'react-native'
import { COLOR } from '../lib/design/tokens'

/** The board's worst-case pseudonym and a body far past two lines. */
const LONG_NAME = 'Midnight Butterfly'
const LONG_BODY = `First time at the festival and going solo all three nights. Anyone up for the riso workshop on Friday and the night market after, from ${WORST.venue}?`

const api = apiClient as unknown as Record<string, jest.Mock>

const post = (id: string, author: string, body: string, extra: object = {}) => ({
  id, author, body, kind: 'offer', subKind: 'ride', spacesLeft: 2, createdAt: new Date(Date.now() - 12 * 60_000).toISOString(), mine: false, requestCount: 0, photo: null, ...extra,
})
const preview = (over: object = {}) => ({
  success: true,
  data: {
    state: 'open', phase: 'before', canRead: true, doorsAt: '2026-11-08T11:00:00Z', closesAt: '2026-11-09T18:30:00Z',
    counts: { all: 18, offer: 5, seeking: 9, chat: 4, offerRides: 3 },
    latest: [post('p1', 'Lunar Fox', 'Driving over from Indiranagar at 5:30.'), post('p2', 'Night Owl', 'Going alone, first time at High Ultra.', { kind: 'seeking', subKind: 'buddy', spacesLeft: null })],
    ...over,
  },
})
const drawPreview = async (props: Partial<React.ComponentProps<typeof EventLobbyPreview>> = {}) => {
  const onOpenRoom = jest.fn()
  await render(<EventLobbyPreview eventId="ev1" timeZone="Asia/Kolkata" here={214} onOpenRoom={onOpenRoom} saved={false} rsvp={null} {...props} />)
  return onOpenRoom
}

// A test that pins the clock (the time words are relative) never leaves it pinned.
afterEach(() => jest.useRealTimers())
beforeEach(() => jest.clearAllMocks())

describe('P-A, the event page’s Lobby card', () => {
  it('shows a reader the counts, the latest two posts and Post something, which opens the composer', async () => {
    api.getBoardPreview.mockResolvedValue(preview())
    await drawPreview()
    expect(screen.getByLabelText('18 posts, 3 offering rides')).toBeTruthy()
    expect(screen.getByText('Lunar Fox')).toBeTruthy()
    expect(screen.getByText('Offering a ride')).toBeTruthy()
    expect(screen.getByText('Looking for someone to go with')).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: 'Post something' }))
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/board/[eventId]', params: { eventId: 'ev1', compose: '1' } })
    await fireEvent.press(screen.getByRole('button', { name: 'See all' }))
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/board/[eventId]', params: { eventId: 'ev1' } })
  })

  it('draws two posts at most, two lines each, under the worst-case name and counts (control: the third is not drawn)', async () => {
    const long = post('p1', LONG_NAME, LONG_BODY)
    api.getBoardPreview.mockResolvedValue(preview({ counts: { all: 2188, offer: 1300, seeking: 800, chat: 88, offerRides: WORST.count }, latest: [long, post('p2', 'B', 'b'), post('p3', 'Third One', 'c')] }))
    await drawPreview()
    expect(screen.getByLabelText(`2,188 posts, ${WORST.count.toLocaleString('en-US')} offering rides`)).toBeTruthy()
    expect(screen.getByText(LONG_BODY).props.numberOfLines).toBe(2)
    expect(screen.getByText(LONG_NAME).props.numberOfLines).toBe(1)
    expect(screen.queryByText('Third One')).toBeNull()
  })

  it('gives somebody who has not saved or gone the counts and how to read it, and nothing to press', async () => {
    api.getBoardPreview.mockResolvedValue(preview({ canRead: false, latest: [] }))
    await drawPreview()
    expect(screen.getByText('Save it or say you’re going to read the Lobby.')).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('reads again when you save or say you’re going on the page, with no focus change (SCRUM-1078; control: other props do not re-read)', async () => {
    api.getBoardPreview.mockResolvedValue(preview({ canRead: false, latest: [] }))
    const onOpenRoom = jest.fn()
    const card = (p: { saved: boolean; rsvp: string | null; here?: number }) => (
      <EventLobbyPreview eventId="ev1" timeZone="Asia/Kolkata" here={p.here ?? 214} onOpenRoom={onOpenRoom} saved={p.saved} rsvp={p.rsvp} />
    )
    const r = await render(card({ saved: false, rsvp: null }))
    expect(screen.getByText('Save it or say you’re going to read the Lobby.')).toBeTruthy()
    // Control: a prop that is not your standing does not read the Lobby again.
    await r.rerender(card({ saved: false, rsvp: null, here: 215 }))
    expect(api.getBoardPreview).toHaveBeenCalledTimes(1)

    api.getBoardPreview.mockResolvedValue(preview())
    await r.rerender(card({ saved: true, rsvp: null }))
    expect(api.getBoardPreview).toHaveBeenCalledTimes(2)
    expect(await screen.findByText('Lunar Fox')).toBeTruthy()
    expect(screen.queryByText('Save it or say you’re going to read the Lobby.')).toBeNull()

    await r.rerender(card({ saved: true, rsvp: 'going' }))
    expect(api.getBoardPreview).toHaveBeenCalledTimes(3)
  })

  it('says nobody has posted yet, with Post something and no See all', async () => {
    api.getBoardPreview.mockResolvedValue(preview({ counts: { all: 0, offer: 0, seeking: 0, chat: 0, offerRides: 0 }, latest: [] }))
    await drawPreview()
    expect(screen.getByText('Nobody’s posted yet')).toBeTruthy()
    expect(screen.getByText('Offer a ride, or find someone to go with.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Post something' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'See all' })).toBeNull()
  })

  it('after doors is read-only until the close, with Read the Lobby and nothing to post', async () => {
    // Only Date is faked (the owner's time words are relative to now): 10:00Z is 3:30 PM Monday in Bengaluru.
    jest.useFakeTimers({ now: new Date('2026-11-09T10:00:00Z'), doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance'] })
    api.getBoardPreview.mockResolvedValue(preview({ state: 'read_only', phase: 'live' }))
    await drawPreview()
    expect(screen.getByText('The doors are open, so the Lobby is read-only. You can read it until Tomorrow\u00a0·\u00a012\u00a0AM.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Post something' })).toBeNull()
    expect(screen.queryByText('Lunar Fox')).toBeNull()
    await fireEvent.press(screen.getByRole('button', { name: 'Read the Lobby' }))
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/board/[eventId]', params: { eventId: 'ev1' } })
  })

  it('live and nobody posted (4b): the room is open, how many are here, compact, and it opens the room', async () => {
    api.getBoardPreview.mockResolvedValue(preview({ state: 'read_only', phase: 'live', counts: { all: 0, offer: 0, seeking: 0, chat: 0, offerRides: 0 }, latest: [] }))
    const onOpenRoom = await drawPreview({ here: WORST.count })
    expect(screen.getByText('12k')).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: `The room is open, ${WORST.count.toLocaleString('en-US')} here now` }))
    expect(onOpenRoom).toHaveBeenCalled()
    expect(screen.queryByText('Lobby')).toBeNull()
  })

  it('says no number when it does not know how many are here', async () => {
    api.getBoardPreview.mockResolvedValue(preview({ state: 'read_only', phase: 'live', counts: { all: 0, offer: 0, seeking: 0, chat: 0, offerRides: 0 }, latest: [] }))
    await drawPreview({ here: null })
    expect(screen.getByRole('button', { name: 'The room is open' })).toBeTruthy()
    expect(screen.queryByText(/here now/)).toBeNull()
  })

  it('draws nothing when the Lobby refuses (closed, or not open to you); control: the same event read draws the card', async () => {
    api.getBoardPreview.mockResolvedValue({ success: false, error: 'The Lobby has closed.', reasonCode: 'LOBBY_CLOSED' })
    await drawPreview()
    expect(screen.toJSON()).toBeNull()
    api.getBoardPreview.mockResolvedValue(preview())
    await drawPreview()
    expect(screen.getByText('Lobby')).toBeTruthy()
  })
})

describe('Going: New in the Lobby (the server’s count, SCRUM-1115)', () => {
  const page = (n: number, mineFirst = false) => ({
    success: true,
    data: { posts: Array.from({ length: n }, (_, i) => post(`p${i}`, `Creature ${i}`, 'x', { mine: mineFirst && i === 0, createdAt: new Date(Date.now() - i * 60_000).toISOString() })) },
  })

  it('says the server’s count, 9+ past nine with the exact number in its label, faces from one page, and opens the Lobby', async () => {
    api.getBoard.mockResolvedValue(page(10, true))
    await render(<NewInLobbyRow eventId="ev1" count={12480} />)
    expect(api.getBoard).toHaveBeenCalledWith('ev1', { limit: '10' })
    expect(screen.getByText('9+')).toBeTruthy()
    // Three faces, the newest others: p0 is yours.
    expect(screen.getAllByTestId(/^going-lobby-face-/, { includeHiddenElements: true }).map((n) => n.props.testID)).toEqual(['going-lobby-face-p1', 'going-lobby-face-p2', 'going-lobby-face-p3'])
    await fireEvent.press(screen.getByRole('button', { name: 'New in the Lobby, 12,480 new posts' }))
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/board/[eventId]', params: { eventId: 'ev1' } })
  })

  it('the count is ink on rose, 4.61:1 (white was 4.23:1, under AA for 13 pt text; going-lifecycle sheet 12)', async () => {
    api.getBoard.mockResolvedValue(page(3))
    await render(<NewInLobbyRow eventId="ev1" count={3} />)
    expect(StyleSheet.flatten(screen.getByText('3').props.style).color).toBe(COLOR.selectionInk)
    expect(screen.getByRole('button', { name: 'New in the Lobby, 3 new posts' })).toBeTruthy()
  })

  it('nothing new: the quiet line, still the way in (L2), and no page read for it (control: one new post is the news line)', async () => {
    await render(<NewInLobbyRow eventId="ev1" count={undefined} />)
    await fireEvent.press(screen.getByRole('button', { name: 'The Lobby. Rides, plus-ones and hellos before the night' }))
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/board/[eventId]', params: { eventId: 'ev1' } })
    expect(screen.queryByText('New in the Lobby')).toBeNull()
    expect(api.getBoard).not.toHaveBeenCalled()
    // Sheet 14's `.nlb .sub`: 13/18, so the quiet line is the board's height (meta's 14/20 drew it 2 pt taller).
    expect(StyleSheet.flatten(screen.getByText('Rides, plus-ones and hellos before the night', { includeHiddenElements: true }).props.style)).toMatchObject({ fontSize: 13, lineHeight: 18 })
    await render(<NewInLobbyRow eventId="ev1" count={0} />)
    expect(screen.getByRole('button', { name: 'The Lobby. Rides, plus-ones and hellos before the night' })).toBeTruthy()
    // A page the Lobby refuses costs only the faces: the server's count still says what is new.
    api.getBoard.mockResolvedValue({ success: false, error: 'closed' })
    await render(<NewInLobbyRow eventId="ev1" count={1} />)
    expect(screen.getByRole('button', { name: 'New in the Lobby, 1 new post' })).toBeTruthy()
    // The count grows with the text and its pill with it (sheet 14 [data-xl]: 30 tall, 16 pt): a fixed 24 clipped the "1" at AX XXXL.
    const count = screen.getByText('1', { includeHiddenElements: true })
    expect(count.props.maxFontSizeMultiplier).toBeCloseTo(16 / 13, 2)
    expect(StyleSheet.flatten(screen.getByTestId('going-lobby-new-badge', { includeHiddenElements: true }).props.style)).toMatchObject({ minHeight: 24 })
    expect(StyleSheet.flatten(screen.getByTestId('going-lobby-new-badge', { includeHiddenElements: true }).props.style).height).toBeUndefined()
  })
})

describe('Going rows: Lobby · N new (L2), only when the server sends a count', () => {
  it('says the count, compact past 999, the exact number in its label, and opens the Lobby', async () => {
    await render(<LobbyRowNews eventId="ev1" count={12480} />)
    expect(screen.getByText('Lobby · 12k new')).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: 'Lobby, 12,480 new posts' }))
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/board/[eventId]', params: { eventId: 'ev1' } })
  })
  it('draws nothing with no count, or none new (control: 3 is drawn)', async () => {
    await render(<LobbyRowNews eventId="ev1" count={undefined} />)
    expect(screen.toJSON()).toBeNull()
    await render(<LobbyRowNews eventId="ev1" count={0} />)
    expect(screen.toJSON()).toBeNull()
    await render(<LobbyRowNews eventId="ev1" count={3} />)
    expect(screen.getByText('Lobby · 3 new')).toBeTruthy()
  })
})

describe('the Lobby’s alerts', () => {
  const draw = async () => render(<LobbyAlertsSheet eventId="ev1" visible onClose={jest.fn()} />)

  it('shows the two opt-ins as the server has them, and no replies switch (admin #918)', async () => {
    api.getBoardAlerts.mockResolvedValue({ success: true, data: { offersMatch: true, hostPosts: false, replies: true } })
    await draw()
    expect(screen.getByText('Lobby alerts')).toBeTruthy()
    expect(screen.getByRole('switch', { name: /^Someone offers what you’re looking for/ }).props.accessibilityState).toMatchObject({ checked: true })
    expect(screen.getByRole('switch', { name: /^The host posts/ }).props.accessibilityState).toMatchObject({ checked: false })
    expect(screen.getAllByRole('switch')).toHaveLength(2)
    expect(screen.queryByText(/replies to you/i)).toBeNull()
  })

  it('saves one switch at a time and shows what the server kept', async () => {
    api.getBoardAlerts.mockResolvedValue({ success: true, data: { offersMatch: false, hostPosts: false } })
    api.setBoardAlerts.mockResolvedValue({ success: true, data: { offersMatch: false, hostPosts: true } })
    await draw()
    await act(async () => fireEvent.press(screen.getByRole('switch', { name: /^The host posts/ })))
    expect(api.setBoardAlerts).toHaveBeenCalledWith('ev1', { hostPosts: true })
    expect(screen.getByRole('switch', { name: /^The host posts/ }).props.accessibilityState).toMatchObject({ checked: true })
  })

  it('puts a switch back and says so when the save fails (control: the read value stays)', async () => {
    api.getBoardAlerts.mockResolvedValue({ success: true, data: { offersMatch: false, hostPosts: false } })
    api.setBoardAlerts.mockResolvedValue({ success: false, error: 'Failed to save your alerts' })
    await draw()
    await act(async () => fireEvent.press(screen.getByRole('switch', { name: /^Someone offers/ })))
    expect(screen.getByRole('switch', { name: /^Someone offers/ }).props.accessibilityState).toMatchObject({ checked: false })
    expect(screen.getByText('Couldn’t save that. Try again.')).toBeTruthy()
  })
})

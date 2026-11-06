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
jest.mock('../lib/lobbySeen', () => ({ lobbySeenAt: jest.fn(), rememberLobbySeen: jest.fn() }))

import { EventLobbyPreview, NewInLobbyRow } from '../components/board/LobbyPreview'
import { LobbyAlertsSheet } from '../components/board/LobbyAlertsSheet'
import { apiClient } from '../lib/apiClient'
import { lobbySeenAt } from '../lib/lobbySeen'
import { WORST } from './helpers/longText'

/** The board's worst-case pseudonym and a body far past two lines. */
const LONG_NAME = 'Midnight Butterfly'
const LONG_BODY = `First time at the festival and going solo all three nights. Anyone up for the riso workshop on Friday and the night market after, from ${WORST.venue}?`

const api = apiClient as unknown as Record<string, jest.Mock>
const seenAt = lobbySeenAt as jest.Mock

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
  await render(<EventLobbyPreview eventId="ev1" timeZone="Asia/Kolkata" here={214} onOpenRoom={onOpenRoom} {...props} />)
  return onOpenRoom
}

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

  it('says nobody has posted yet, with Post something and no See all', async () => {
    api.getBoardPreview.mockResolvedValue(preview({ counts: { all: 0, offer: 0, seeking: 0, chat: 0, offerRides: 0 }, latest: [] }))
    await drawPreview()
    expect(screen.getByText('Nobody’s posted yet')).toBeTruthy()
    expect(screen.getByText('Offer a ride, or find someone to go with.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Post something' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'See all' })).toBeNull()
  })

  it('after doors is read-only until the close, with Read the Lobby and nothing to post', async () => {
    api.getBoardPreview.mockResolvedValue(preview({ state: 'read_only', phase: 'live' }))
    await drawPreview()
    expect(screen.getByText('The doors are open, so the Lobby is read-only. You can read it until Tue 10 Nov, 12 AM.')).toBeTruthy()
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

describe('Going: New in the Lobby', () => {
  const page = (n: number, mineFirst = false) => ({
    success: true,
    data: { posts: Array.from({ length: n }, (_, i) => post(`p${i}`, `Creature ${i}`, 'x', { mine: mineFirst && i === 0, createdAt: new Date(Date.now() - i * 60_000).toISOString() })) },
  })

  it('shows what is new since you last opened the Lobby, 9+ past nine, and opens the Lobby', async () => {
    seenAt.mockResolvedValue(null)
    api.getBoard.mockResolvedValue(page(10))
    await render(<NewInLobbyRow eventId="ev1" />)
    expect(api.getBoard).toHaveBeenCalledWith('ev1', { limit: '10' })
    expect(screen.getByText('9+')).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: 'New in the Lobby, 9+ new posts' }))
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/board/[eventId]', params: { eventId: 'ev1' } })
  })

  it('counts exactly under ten, never your own', async () => {
    seenAt.mockResolvedValue(new Date(Date.now() - 5.5 * 60_000).toISOString())
    api.getBoard.mockResolvedValue(page(8, true))
    await render(<NewInLobbyRow eventId="ev1" />)
    expect(screen.getByRole('button', { name: 'New in the Lobby, 5 new posts' })).toBeTruthy()
  })

  it('is not there when nothing is new, or the Lobby refuses (control: one new post shows it)', async () => {
    seenAt.mockResolvedValue(new Date(Date.now() + 60_000).toISOString())
    api.getBoard.mockResolvedValue(page(3))
    await render(<NewInLobbyRow eventId="ev1" />)
    expect(screen.toJSON()).toBeNull()
    seenAt.mockResolvedValue(null)
    api.getBoard.mockResolvedValue({ success: false, error: 'closed' })
    await render(<NewInLobbyRow eventId="ev1" />)
    expect(screen.toJSON()).toBeNull()
    api.getBoard.mockResolvedValue(page(1))
    await render(<NewInLobbyRow eventId="ev1" />)
    expect(screen.getByRole('button', { name: 'New in the Lobby, 1 new post' })).toBeTruthy()
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

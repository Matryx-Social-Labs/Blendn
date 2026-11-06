/**
 * "From the Lobby" in the room (SCRUM-1026, H-A; board `mockups/redesign-2026-11/lobby/` sections 4 and 4b): no card
 * when the server says there is nothing, only the note when that is all, rows that open their rooms, and the fold.
 */
import { fireEvent, render, screen } from '@testing-library/react-native'

jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  useFocusEffect: (effect: () => void) => {
    const { useEffect } = require('react')
    useEffect(effect, [effect])
  },
}))
jest.mock('../lib/apiClient', () => ({
  apiClient: { getBoardSummary: jest.fn() },
}))
jest.mock('../lib/logger', () => ({
  Logger: { warn: jest.fn(), debug: jest.fn() },
}))

import { router } from 'expo-router'
import { FromTheLobby } from '../components/board/FromTheLobby'
import { apiClient } from '../lib/apiClient'
import type { LobbySummary } from '../lib/lobby'

const api = apiClient as jest.Mocked<typeof apiClient>
const PIN = {
  id: 'h1',
  body: 'Entry is from the side lane on 15th Cross.',
  host: 'Nightshift',
  createdAt: '2026-11-06T06:00:00Z',
  updatedAt: '2026-11-06T06:00:00Z',
}
const RIDE = {
  postId: 'p1',
  kind: 'offer' as const,
  subKind: 'ride' as const,
  body: 'From Indiranagar at 5:30',
  mine: false,
  author: 'Lunar Fox',
  others: 3,
  chatGroupId: 'g1',
  requestId: 'r1',
  conversationId: 'c1',
}
const TICKET = {
  ...RIDE,
  postId: 'p2',
  body: 'Spare ticket, standing',
  subKind: 'ticket' as const,
  chatGroupId: null,
  conversationId: 'c2',
}
const said = (over: Partial<LobbySummary>) =>
  api.getBoardSummary.mockResolvedValue({
    success: true,
    data: {
      state: 'read_only',
      phase: 'live',
      readUntil: '2026-11-09T18:30:00Z',
      hasContent: true,
      ...over,
    },
  } as never)
const draw = (folded = false, onUnfold = jest.fn(), onFold = jest.fn()) =>
  render(<FromTheLobby eventId="e1" folded={folded} onFold={onFold} onUnfold={onUnfold} />)

beforeEach(() => jest.clearAllMocks())

it('draws nothing when the Lobby has nothing for you (4b), and nothing when it refuses', async () => {
  said({ hasContent: false })
  await draw()
  expect(api.getBoardSummary).toHaveBeenCalledWith('e1')
  expect(screen.queryByTestId('from-lobby')).toBeNull()

  api.getBoardSummary.mockResolvedValue({
    success: false,
    error: 'no',
  } as never)
  await draw()
  expect(screen.queryByTestId('from-lobby')).toBeNull()
})

it('lists what you joined, the host’s note, and Read the Lobby', async () => {
  said({ joined: [RIDE, TICKET], pinned: PIN })
  await draw()
  expect(await screen.findByText('Your ride')).toBeTruthy()
  expect(screen.getByText('With Lunar Fox and 2 others: From Indiranagar at 5:30')).toBeTruthy()
  expect(screen.getByText('Your ticket')).toBeTruthy()
  expect(screen.getByText('From the host')).toBeTruthy()
  expect(screen.getByText(PIN.body)).toBeTruthy()
  await fireEvent.press(screen.getByTestId('from-lobby-read'))
  expect(router.push).toHaveBeenCalledWith({
    pathname: '/board/[eventId]',
    params: { eventId: 'e1' },
  })
})

it('is just the note when that is all there is', async () => {
  said({ pinned: PIN })
  await draw()
  expect(await screen.findByText('From the host')).toBeTruthy()
  expect(screen.queryByTestId('from-lobby-read')).toBeNull()
  expect(screen.queryByText('Your ride')).toBeNull()
})

it('opens a ride’s room, or the 1:1 your ask opened; the note opens nothing', async () => {
  said({ joined: [RIDE, TICKET], pinned: PIN })
  await draw()
  await fireEvent.press(await screen.findByTestId('from-lobby-row-p1'))
  expect(router.push).toHaveBeenLastCalledWith({
    pathname: '/chat/[id]',
    params: { id: 'g1' },
  })
  await fireEvent.press(screen.getByTestId('from-lobby-row-p2'))
  expect(router.push).toHaveBeenLastCalledWith({
    pathname: '/private-chat/[conversationId]',
    params: { conversationId: 'c2' },
  })
  // The note is read, not opened: no button, no chevron.
  expect(screen.getByTestId('from-lobby-row-host').props.accessibilityRole).toBeUndefined()
  expect(screen.getByTestId('from-lobby-row-host').props.onClick).toBeUndefined()
  expect(router.push).toHaveBeenCalledTimes(2)
})

it('folds to one line that says what is in it, and opens again on a tap', async () => {
  said({ joined: [RIDE], pinned: PIN })
  const onUnfold = jest.fn()
  const onFold = jest.fn()
  await draw(false, onUnfold, onFold)
  await screen.findByText('Your ride')
  await fireEvent.press(await screen.findByTestId('from-lobby-fold'))
  expect(onFold).toHaveBeenCalled()

  await draw(true, onUnfold)
  const bar = await screen.findByTestId('from-lobby-bar')
  expect(bar.props.accessibilityLabel).toBe('From the Lobby: Your ride · From the host')
  await fireEvent.press(bar)
  expect(onUnfold).toHaveBeenCalled()
})

/**
 * D-030 (SCRUM-1467) on the chat sender card: a room member tapped in the chat shows "Anonymous" and no age until the roster
 * says they are shown to you (`revealed`). A photo alone is not a reveal: the card fails closed.
 */
import { render, screen } from '@testing-library/react-native'

jest.mock('expo-router', () => ({ router: { push: jest.fn(), navigate: jest.fn() } }))
jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default)
jest.mock('../lib/apiClient', () => ({ apiClient: { getEventMatches: jest.fn(), sendWave: jest.fn() } }))
jest.mock('../lib/logger', () => ({ Logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() } }))
jest.mock('../lib/safetyUtils', () => ({ showUserSafetyActions: jest.fn() }))
jest.mock('../lib/pushAsk', () => ({ askPushInContext: jest.fn() }))
jest.mock('../components/grid/ConnectSheet', () => ({ ConnectSheet: () => null }))

import { apiClient } from '../lib/apiClient'
import { SenderCard } from '../components/chat/SenderCard'

const api = apiClient as jest.Mocked<typeof apiClient>
const ROW = { userId: 'rh_bison', displayName: 'Gentle Bison', photo: null, sharedInterests: [], age: 31 }

const open = async (row: object) => {
  api.getEventMatches.mockResolvedValue({ success: true, data: { matches: [{ ...ROW, ...row }] } } as never)
  await render(<SenderCard sender={{ id: 'rh_bison', name: 'Gentle Bison' }} eventId="e1" chatGroupId="g1" onClose={jest.fn()} onBlocked={jest.fn()} />)
  return screen.findByTestId('sender-card-card-meta', { includeHiddenElements: true })
}

beforeEach(() => jest.clearAllMocks())

it('an unrevealed sender: "Anonymous", never the age the roster sent', async () => {
  expect((await open({ revealed: false })).props.children).toBe('Anonymous')
  expect(screen.queryByText(/31/, { includeHiddenElements: true })).toBeNull()
})

it('a photo without a reveal is still anonymous: no age', async () => {
  expect((await open({ revealed: false, photo: 'https://cdn/x.jpg' })).props.children).toBe('Anonymous')
})

it('a sender shown to you keeps the age', async () => {
  expect((await open({ revealed: true, photo: 'https://cdn/x.jpg' })).props.children).toBe('Shown to you · 31')
})

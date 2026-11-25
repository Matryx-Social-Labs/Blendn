/** S7: a crew link opened (`/c/<token>`), board crews/03 A + waves-b2 06 Z-B. */
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import { router } from 'expo-router'
import React from 'react'

import CrewLinkRoute from '../app/c/[token]'
import { crewsApi } from '../lib/crewsApi'

jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default)
let mockToken = 'tok_1234567890'
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
  useLocalSearchParams: () => ({ token: mockToken }),
  useFocusEffect: jest.fn(),
}))
jest.mock('../lib/crewsApi')
jest.mock('../lib/useAuth', () => ({ useAuth: () => ({ user: { id: 'me' } }) }))
jest.mock('../lib/crewPushAsk', () => ({ askCrewPush: jest.fn() }))
jest.mock('../lib/crewInvites', () => ({ crewInviteAnswered: jest.fn() }))
jest.mock('../components/Toast', () => ({ useToast: () => ({ showToast: jest.fn() }) }))
jest.mock('../components/system/RouteModal', () => ({ RouteModal: ({ children }: { children: React.ReactNode }) => children }))

const api = jest.mocked(crewsApi)
const DAY = 86_400_000
const link = (over = {}) => ({
  crewId: 'c1',
  name: 'Nebula',
  emblemSeed: 'seed',
  size: 4,
  bio: 'Friday is for live music.',
  tags: [],
  invitedBy: { name: 'Arjun', photoUrl: null },
  expiresAt: new Date(Date.now() + 4.5 * DAY).toISOString(),
  member: false,
  ...over,
})
const open = async (over = {}) => {
  api.link.mockResolvedValue({ success: true, data: link(over) })
  await render(<CrewLinkRoute />)
}

beforeEach(() => {
  jest.clearAllMocks()
  mockToken = 'tok_1234567890'
})

it('the card: who asked, the crew, the friendship in the consent, the days left; nothing is sent before Join', async () => {
  await open()
  expect(await screen.findByText('Arjun asked you in')).toBeTruthy()
  expect(screen.getByText(/Joining also makes you and Arjun friends\.$/)).toBeTruthy()
  expect(screen.getByTestId('invite-note')).toHaveTextContent('Open for 5 more days')
  expect(api.joinByLink).not.toHaveBeenCalled()
})

it('Join sends the consent and opens the crew’s chat', async () => {
  jest.useFakeTimers()
  api.joinByLink.mockResolvedValue({ success: true, data: { crewId: 'c1', chatGroupId: 'g1' } })
  await open()
  await act(async () => {})
  await act(async () => fireEvent.press(screen.getByTestId('invite-join')))
  expect(api.joinByLink).toHaveBeenCalledWith('tok_1234567890', { revealConsent: true, keepMeAnonymous: false })
  await act(async () => jest.advanceTimersByTime(700))
  expect(router.replace).toHaveBeenCalledWith({ pathname: '/chat/[id]', params: { id: 'g1', roomName: 'Nebula', kind: 'crew', crewId: 'c1' } })
  jest.useRealTimers()
})

it('Not now only closes: nothing is sent', async () => {
  await open()
  await fireEvent.press(await screen.findByTestId('invite-not-now'))
  expect(router.back).toHaveBeenCalled()
  expect(api.joinByLink).not.toHaveBeenCalled()
  expect(api.decline).not.toHaveBeenCalled()
})

it('already in: the crew’s page, no card', async () => {
  await open({ member: true })
  await act(async () => {})
  expect(router.replace).toHaveBeenCalledWith({ pathname: '/crews/[crewId]', params: { crewId: 'c1' } })
  expect(screen.queryByTestId('invite-join')).toBeNull()
})

it('a 404 is a dead link; control: a failed load is not, and Try again reads it', async () => {
  api.link.mockResolvedValueOnce({ success: false, errorCode: 'NOT_FOUND', error: 'x' } as never)
  await render(<CrewLinkRoute />)
  expect(await screen.findByTestId('crew-link-dead')).toBeTruthy()
  await screen.unmount()
  api.link.mockResolvedValueOnce({ success: false, errorCode: 'NETWORK', error: 'x' } as never)
  await render(<CrewLinkRoute />)
  expect(await screen.findByTestId('crew-link-failed')).toBeTruthy()
  api.link.mockResolvedValueOnce({ success: true, data: link() })
  await act(async () => fireEvent.press(screen.getByText('Try again')))
  expect(screen.getByText('Arjun asked you in')).toBeTruthy()
})

it('a link that died while it was open says so at Join', async () => {
  api.joinByLink.mockResolvedValue({ success: false, errorCode: 'NOT_FOUND', error: 'x' } as never)
  await open()
  await act(async () => fireEvent.press(await screen.findByTestId('invite-join')))
  expect(screen.getByTestId('crew-link-dead')).toBeTruthy()
})

it('a token that is not one builds no API path', async () => {
  mockToken = '../../users/me'
  await render(<CrewLinkRoute />)
  expect(screen.getByTestId('crew-link-dead')).toBeTruthy()
  expect(api.link).not.toHaveBeenCalled()
})

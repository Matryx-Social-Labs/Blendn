/*
 * The stores keyed by event, not by account: the rooms' rosters (`lib/rosterMemory`) and the events' details with their
 * `userStatus` (`lib/eventDetailCache`). Every way out of a session clears them, so A's roster and A's "you're going" never
 * reach B on the same phone (Opus review of feat/rc-drive-fixes).
 */
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'))
jest.mock('../lib/logger', () => ({ Logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() } }))
jest.mock('expo-notifications', () => ({ setBadgeCountAsync: jest.fn(async () => true), getPermissionsAsync: jest.fn() }))
jest.mock('../lib/apiClient', () => ({
  apiClient: { signOut: jest.fn(async () => ({ success: true })), signOutEverywhere: jest.fn(async () => ({ success: true })) },
  TokenStorage: { clearAll: jest.fn(async () => {}), getUser: jest.fn(async () => null) },
}))
jest.mock('../lib/purchases', () => ({ syncPurchasesUser: jest.fn() }))

import { getEventDetailCache, setEventDetailCache } from '../lib/eventDetailCache'
import { recallRoster, rememberRoster } from '../lib/rosterMemory'
import { signOut, signOutEverywhere } from '../lib/useAuth'

const fill = () => {
  setEventDetailCache('e1', { id: 'e1', userStatus: { rsvp: 'going', checkedIn: true } })
  rememberRoster('e1', [], 'A’s room')
}

it.each([
  ['signing out', () => signOut()],
  ['signing out everywhere', () => signOutEverywhere()],
])('%s forgets the rosters and the event details', async (_name, leave) => {
  fill()
  expect(getEventDetailCache('e1')).not.toBeNull()
  expect(recallRoster('e1')).not.toBeNull()
  await leave()
  expect(getEventDetailCache('e1')).toBeNull()
  expect(recallRoster('e1')).toBeNull()
})

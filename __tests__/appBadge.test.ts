/*
 * The app icon's number (Flow 9 · 9.4): set from `GET /notifications` `badgeCount` through expo-notifications, and only where the
 * phone lets this app badge at all. It never asks for the permission: that is the in-context ask.
 */
const mockGetPermissions = jest.fn()
const mockSetBadge = jest.fn()
jest.mock('expo-notifications', () => ({
  getPermissionsAsync: (...a: unknown[]) => mockGetPermissions(...a),
  setBadgeCountAsync: (...a: unknown[]) => mockSetBadge(...a),
  requestPermissionsAsync: jest.fn(),
}))
const mockWarn = jest.fn()
jest.mock('../lib/logger', () => ({ Logger: { warn: (...a: unknown[]) => mockWarn(...a), debug: jest.fn(), info: jest.fn(), error: jest.fn() } }))

import * as Notifications from 'expo-notifications'
import { setAppIconBadge } from '../lib/appBadge'

beforeEach(() => {
  jest.clearAllMocks()
  mockGetPermissions.mockResolvedValue({ status: 'granted', canAskAgain: true, ios: { allowsBadge: true } })
  mockSetBadge.mockResolvedValue(true)
})

it('sets the number when notifications are granted', async () => {
  await setAppIconBadge(3)
  expect(mockSetBadge).toHaveBeenCalledWith(3)
})

it('clears the icon with zero', async () => {
  await setAppIconBadge(0)
  expect(mockSetBadge).toHaveBeenCalledWith(0)
})

it('leaves the icon alone when the server sent no count', async () => {
  await setAppIconBadge(null)
  expect(mockGetPermissions).not.toHaveBeenCalled()
  expect(mockSetBadge).not.toHaveBeenCalled()
})

it.each([
  ['notifications are denied', { status: 'denied', canAskAgain: false }],
  ['the person has not been asked yet', { status: 'undetermined', canAskAgain: true }],
  ['badges are off for the app in the phone\'s Settings', { status: 'granted', canAskAgain: true, ios: { allowsBadge: false } }],
])('sets nothing, and never asks, when %s', async (_why, permission) => {
  mockGetPermissions.mockResolvedValue(permission)
  await setAppIconBadge(4)
  expect(mockSetBadge).not.toHaveBeenCalled()
  expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled()
})

it('Android, which has no ios block, is granted by its status alone', async () => {
  mockGetPermissions.mockResolvedValue({ status: 'granted', canAskAgain: true })
  await setAppIconBadge(2)
  expect(mockSetBadge).toHaveBeenCalledWith(2)
})

it('costs only the number when the phone refuses: logged, never thrown', async () => {
  mockSetBadge.mockRejectedValue(new Error('no launcher support'))
  await expect(setAppIconBadge(5)).resolves.toBeUndefined()
  expect(mockWarn).toHaveBeenCalledWith('notifications', 'badge:failed', expect.anything())
})

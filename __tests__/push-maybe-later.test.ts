/**
 * "Maybe later" on onboarding's notifications step is respected.
 *
 * Push start-up asks the OS for permission when somebody reaches the tabs,
 * which put the system dialog in front of the person who had just declined.
 * A declined account registers only if the permission is already granted.
 */
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
)
jest.mock('expo-device', () => ({ isDevice: true }))
jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  getExpoPushTokenAsync: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
  setNotificationHandler: jest.fn(),
  AndroidImportance: { MAX: 5, HIGH: 4, DEFAULT: 3 },
}))
jest.mock('../lib/apiClient', () => ({ apiClient: {}, TokenStorage: {} }))
jest.mock('../lib/logger', () => ({
  Logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}))

import { readFileSync } from 'fs'
import { join } from 'path'
import * as Notifications from 'expo-notifications'
import { registerForPushNotificationsAsync } from '../lib/notifications'
import { clearPushDeclined, hasDeclinedPush, markPushDeclined } from '../lib/pushDecline'

const notif = Notifications as jest.Mocked<typeof Notifications>
const read = (file: string) =>
  readFileSync(join(__dirname, '..', file), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

beforeEach(() => jest.clearAllMocks())

describe('the decline is remembered per account', () => {
  it('is set by marking, and cleared by clearing', async () => {
    expect(await hasDeclinedPush('u1')).toBe(false)
    await markPushDeclined('u1')
    expect(await hasDeclinedPush('u1')).toBe(true)
    expect(await hasDeclinedPush('u2')).toBe(false)
    await clearPushDeclined('u1')
    expect(await hasDeclinedPush('u1')).toBe(false)
  })
})

describe('registration without a prompt', () => {
  it('never asks the OS when permission is undecided', async () => {
    notif.getPermissionsAsync.mockResolvedValue({ status: 'undetermined' } as never)
    await expect(registerForPushNotificationsAsync({ prompt: false })).resolves.toBeNull()
    expect(notif.requestPermissionsAsync).not.toHaveBeenCalled()
  })

  it('still asks by default, for accounts that never declined', async () => {
    notif.getPermissionsAsync.mockResolvedValue({ status: 'undetermined' } as never)
    notif.requestPermissionsAsync.mockResolvedValue({ status: 'denied' } as never)
    await registerForPushNotificationsAsync()
    expect(notif.requestPermissionsAsync).toHaveBeenCalled()
  })
})

describe('wiring', () => {
  it('the root layout passes the decline into push start-up', () => {
    const layout = read('app/_layout.tsx')
    expect(layout).toMatch(/hasDeclinedPush\(userId\)\s*\.then\(\(declined\) => initializePushNotifications\(\{ prompt: !declined \}\)\)/)
  })

  it('"Maybe later" and "Not now" record the decline; a yes clears it', () => {
    const step = read('app/onboarding/notifications.tsx')
    expect(step).toContain('onSecondary={() => void answer(false)}')
    expect(step).toMatch(/enabled \? clearPushDeclined\(user\.id\) : markPushDeclined\(user\.id\)/)
    expect(step).not.toMatch(/commit\(\{ push_enabled: false \}\)/)
  })

  it('turning notifications on in Settings clears it and asks', () => {
    expect(read('app/settings.tsx')).toContain(
      'void clearPushDeclined(user.id).then(() => initializePushNotifications()).catch(() => {})'
    )
  })
})

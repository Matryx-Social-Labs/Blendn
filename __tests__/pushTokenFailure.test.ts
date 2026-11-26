/**
 * A phone that should get a push token and does not is reported, and nothing stands in for the token (SCRUM-1312).
 *
 * When `getExpoPushTokenAsync` threw, or the EAS project id was missing, registration logged a warn "expected in dev
 * builds" and returned an invented `development-token-…` (`simulator-token-…` on a simulator). The logger turns a warn
 * into a breadcrumb only, so a release Android build whose Firebase wiring failed kept 0 tokens and nobody was told.
 * Now: null, nothing posted, and one Sentry event per launch per kind of failure, carrying the platform, the error's
 * code and whether the project id was there. Never the token, never the error's message (Expo's carries the server's
 * response body and URL).
 *
 * The logger is real here, so "an event" means the path lib/logger.ts sends as one (`captureMessage`), not a breadcrumb.
 *
 * Negative control: on the code before this change the two failure cases fail (`captureMessage` is never called, the
 * warn only adds a breadcrumb) and so does the source guard. The POST assertions pass on that code too (the prefix
 * filter in `initializePushNotifications` caught the fake tokens), so they are not the control.
 */
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'))
let mockIsDevice = true
jest.mock('expo-device', () => ({
  get isDevice() {
    return mockIsDevice
  },
}))
let mockProjectId: string | undefined = 'eas-project'
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    get expoConfig() {
      return { extra: { eas: { projectId: mockProjectId } } }
    },
  },
}))
jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(async () => ({ status: 'granted', granted: true, canAskAgain: true, expires: 'never' })),
  requestPermissionsAsync: jest.fn(),
  getExpoPushTokenAsync: jest.fn(),
  setNotificationChannelAsync: jest.fn(async () => null),
  setNotificationHandler: jest.fn(),
  getAllScheduledNotificationsAsync: jest.fn(async () => []),
  AndroidImportance: { MAX: 5, HIGH: 4, DEFAULT: 3, LOW: 2 },
  AndroidNotificationVisibility: { PRIVATE: 0, PUBLIC: 1 },
}))
jest.mock('../lib/apiClient', () => ({
  apiClient: { registerPushToken: jest.fn(async () => ({ success: true })) },
  TokenStorage: { getUser: jest.fn(async () => ({ id: 'u1' })) },
}))
jest.mock('../lib/sentry', () => ({ Sentry: { addBreadcrumb: jest.fn(), captureMessage: jest.fn(), captureException: jest.fn() } }))

import { readFileSync } from 'fs'
import { join } from 'path'

/** A Firebase-style failure whose message holds what must never leave the phone: a key and a URL with one. */
const SECRET_BEARING = 'Fetching the token failed: AIzaSyFAKEKEYFAKEKEY https://firebaseinstallations.googleapis.com/v1?key=AIzaSyFAKE'
function firebaseError(code = 'E_REGISTRATION_FAILED'): Error {
  return Object.assign(new Error(SECRET_BEARING), { code })
}

/** A fresh launch on an Android phone: module state (what was already reported) starts empty. */
function launch() {
  jest.resetModules()
  jest.replaceProperty(require('react-native').Platform, 'OS', 'android')
  const notifications = require('../lib/notifications') as typeof import('../lib/notifications')
  return {
    ...notifications,
    Notifications: require('expo-notifications') as jest.Mocked<typeof import('expo-notifications')>,
    registerPushToken: (require('../lib/apiClient') as { apiClient: { registerPushToken: jest.Mock } }).apiClient.registerPushToken,
    Sentry: (require('../lib/sentry') as { Sentry: Record<'addBreadcrumb' | 'captureMessage' | 'captureException', jest.Mock> }).Sentry,
    getPushTokenRef: (require('../lib/pushTokenRef') as typeof import('../lib/pushTokenRef')).getPushTokenRef,
  }
}

beforeEach(() => {
  mockIsDevice = true
  mockProjectId = 'eas-project'
})
afterEach(() => jest.restoreAllMocks())

describe('a real phone whose token request throws', () => {
  it('posts nothing, keeps no token, and sends one Sentry event with the platform and the code only', async () => {
    const app = launch()
    app.Notifications.getExpoPushTokenAsync.mockRejectedValue(firebaseError())

    await expect(app.initializePushNotifications({ prompt: false })).resolves.toBeNull()

    expect(app.registerPushToken).not.toHaveBeenCalled()
    expect(app.getPushTokenRef()).toBeNull()
    expect(app.Sentry.captureMessage).toHaveBeenCalledTimes(1)
    expect(app.Sentry.captureException).not.toHaveBeenCalled()
    const [message, options] = app.Sentry.captureMessage.mock.calls[0]
    expect(message).toContain('E_REGISTRATION_FAILED')
    expect(options.extra).toEqual({ platform: 'android', code: 'E_REGISTRATION_FAILED', hasProjectId: true })
    const sent = JSON.stringify([app.Sentry.captureMessage.mock.calls, app.Sentry.addBreadcrumb.mock.calls])
    expect(sent).not.toMatch(/AIza|https?:|Fetching the token failed|ExponentPushToken/)
  })

  it('reports once per launch however often registration is retried, and a different failure once more', async () => {
    const app = launch()
    app.Notifications.getExpoPushTokenAsync.mockRejectedValue(firebaseError())

    await app.initializePushNotifications({ prompt: false })
    await app.initializePushNotifications()
    await app.registerForPushNotificationsAsync({ prompt: false })
    expect(app.Sentry.captureMessage).toHaveBeenCalledTimes(1)

    app.Notifications.getExpoPushTokenAsync.mockRejectedValue(firebaseError('ERR_NOTIFICATIONS_SERVER_ERROR'))
    await app.initializePushNotifications()
    await app.initializePushNotifications()
    expect(app.Sentry.captureMessage).toHaveBeenCalledTimes(2)
    expect(app.Sentry.captureMessage.mock.calls[1][1].extra.code).toBe('ERR_NOTIFICATIONS_SERVER_ERROR')
    expect(app.registerPushToken).not.toHaveBeenCalled()

    // The next launch reports again.
    const next = launch()
    next.Notifications.getExpoPushTokenAsync.mockRejectedValue(firebaseError())
    await next.initializePushNotifications()
    expect(next.Sentry.captureMessage).toHaveBeenCalledTimes(1)
  })

  it('sends the error name when the error has no code', async () => {
    const app = launch()
    app.Notifications.getExpoPushTokenAsync.mockRejectedValue(new TypeError(SECRET_BEARING))

    await app.initializePushNotifications()

    expect(app.Sentry.captureMessage.mock.calls[0][1].extra).toEqual({ platform: 'android', code: 'TypeError', hasProjectId: true })
  })
})

describe('a release build with no EAS project id', () => {
  it('is a failure: nothing requested, nothing posted, one event saying the id was missing', async () => {
    mockProjectId = undefined
    const app = launch()

    await expect(app.initializePushNotifications()).resolves.toBeNull()
    await app.initializePushNotifications()

    expect(app.Notifications.getExpoPushTokenAsync).not.toHaveBeenCalled()
    expect(app.registerPushToken).not.toHaveBeenCalled()
    expect(app.Sentry.captureMessage).toHaveBeenCalledTimes(1)
    expect(app.Sentry.captureMessage.mock.calls[0][1].extra).toEqual({ platform: 'android', code: 'NO_PROJECT_ID', hasProjectId: false })
  })
})

describe('where no token is expected, nothing is reported', () => {
  it('a simulator or emulator: no token asked for, nothing posted, no event', async () => {
    mockIsDevice = false
    const app = launch()

    await expect(app.initializePushNotifications()).resolves.toBeNull()

    expect(app.Notifications.getExpoPushTokenAsync).not.toHaveBeenCalled()
    expect(app.registerPushToken).not.toHaveBeenCalled()
    expect(app.getPushTokenRef()).toBeNull()
    expect(app.Sentry.captureMessage).not.toHaveBeenCalled()
  })

  it('a person who declined notifications: not a failure, no event', async () => {
    const app = launch()
    app.Notifications.getPermissionsAsync.mockResolvedValue({ status: 'denied', granted: false, canAskAgain: false, expires: 'never' })
    app.Notifications.requestPermissionsAsync.mockResolvedValue({ status: 'denied', granted: false, canAskAgain: false, expires: 'never' })

    await expect(app.initializePushNotifications()).resolves.toBeNull()

    expect(app.Notifications.getExpoPushTokenAsync).not.toHaveBeenCalled()
    expect(app.registerPushToken).not.toHaveBeenCalled()
    expect(app.Sentry.captureMessage).not.toHaveBeenCalled()
    expect(app.Sentry.captureException).not.toHaveBeenCalled()
  })
})

it('a real token is still posted, and nothing is reported', async () => {
  const app = launch()
  app.Notifications.getExpoPushTokenAsync.mockResolvedValue({ type: 'expo', data: 'ExponentPushToken[real]' })

  await expect(app.initializePushNotifications()).resolves.toBe('ExponentPushToken[real]')

  expect(app.registerPushToken).toHaveBeenCalledWith('ExponentPushToken[real]', 'android')
  expect(app.Sentry.captureMessage).not.toHaveBeenCalled()
})

it('nothing in the client makes up a push token', () => {
  expect(readFileSync(join(__dirname, '..', 'lib', 'notifications.ts'), 'utf8').match(/(development|simulator)-token-/g)).toBeNull()
})

/**
 * A queued GET that rejects (the queue cleared on background or sign-out, or the request threw) rejects for its caller, and
 * nowhere else. `queuedRequest` hung `promise.finally(…)` off the shared promise for its in-flight bookkeeping and never
 * handled what that returns, so every such rejection was also an unhandled one, even when the caller caught it: Sentry's
 * "Request queue cleared" (BLENDN-1Y, 2J, 2B, mechanism onunhandledrejection), SCRUM-973.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
}))
jest.mock('expo-secure-store', () => ({ getItemAsync: async () => null, setItemAsync: async () => {}, deleteItemAsync: async () => {} }))
jest.mock('react-native', () => ({ Platform: { OS: 'ios' }, AppState: { addEventListener: () => ({ remove: () => {} }) } }))
jest.mock('../lib/logger', () => ({ Logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } }))

process.env.EXPO_PUBLIC_API_BASE_URL = 'https://api.test'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { apiClient } = require('../lib/apiClient') as typeof import('../lib/apiClient')

it('a rejected queued GET is handled by its caller alone: no unhandled rejection', async () => {
  const unhandled: unknown[] = []
  const onUnhandled = (reason: unknown) => unhandled.push(reason)
  process.on('unhandledRejection', onUnhandled)
  try {
    jest.spyOn(apiClient as unknown as { request: () => Promise<unknown> }, 'request').mockRejectedValue(new Error('Request queue cleared'))
    await expect(apiClient.queuedRequest('/events/x')).rejects.toThrow('Request queue cleared')
    // Unhandled rejections are reported after the microtask queue drains.
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(unhandled).toEqual([])
  } finally {
    process.off('unhandledRejection', onUnhandled)
  }
})

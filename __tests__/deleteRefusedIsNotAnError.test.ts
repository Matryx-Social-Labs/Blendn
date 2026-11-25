/**
 * A refused delete is somebody mistyping, not a defect (SCRUM-944 (3)): `Logger.error` reaches Sentry, so every wrong
 * password would open an issue. Any other failure is still an error.
 */
const mockApi = { deleteAccount: jest.fn() }
jest.mock('../lib/apiClient', () => ({ apiClient: mockApi, TokenStorage: {} }))
jest.mock('../lib/logger', () => ({
  Logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}))
jest.mock('../lib/sentry', () => ({ Sentry: { setUser: jest.fn() } }))
jest.mock('react-native', () => ({
  Platform: { OS: 'ios', select: (o: Record<string, unknown>) => o.ios ?? o.default },
  AppState: { addEventListener: () => ({ remove: () => {} }) },
}))

/* eslint-disable @typescript-eslint/no-require-imports */
const { deleteAccount } = require('../lib/useAuth') as typeof import('../lib/useAuth')
const { Logger } = require('../lib/logger') as typeof import('../lib/logger')
/* eslint-enable @typescript-eslint/no-require-imports */

beforeEach(() => jest.clearAllMocks())

it.each(['PASSWORD_INCORRECT', 'REAUTH_REQUIRED'])('%s is a warning and keeps its code for the form', async (errorCode) => {
  mockApi.deleteAccount.mockResolvedValue({ success: false, error: 'No', errorCode })
  expect(await deleteAccount({ password: 'pw' })).toMatchObject({ success: false, errorCode })
  expect(Logger.error).not.toHaveBeenCalled()
  expect(Logger.warn).toHaveBeenCalledWith('auth', 'Account deletion refused', { errorCode })
})

it('any other failure is still an error', async () => {
  mockApi.deleteAccount.mockResolvedValue({ success: false, error: 'Boom', errorCode: 'SERVER_ERROR' })
  await deleteAccount({ password: 'pw' })
  expect(Logger.error).toHaveBeenCalledWith('auth', 'Account deletion failed', { error: 'Boom', errorCode: 'SERVER_ERROR' })
})

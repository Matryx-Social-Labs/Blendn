/**
 * A refused sign-up or sign-in says how long to wait (SCRUM-487).
 *
 * The server answers `429 { error: "Too many requests", errorCode:
 * "RATE_LIMITED", retryAfter: 2709 }`. `lib/useAuth.ts` passed on `error`
 * alone, so the form said "Too many requests" and nothing else: try again now,
 * later, or never? The wait was in the response all along.
 */
const mockApi = { signUp: jest.fn(), signInWithEmail: jest.fn() }
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
const { signInWithEmail, signUp } = require('../lib/useAuth') as typeof import('../lib/useAuth')
const { rateLimitedMessage } = require('../lib/signInRefusal') as typeof import('../lib/signInRefusal')
/* eslint-enable @typescript-eslint/no-require-imports */

const refused = (retryAfter?: number) => ({
  success: false,
  error: 'Too many requests',
  errorCode: 'RATE_LIMITED',
  retryAfter,
})

describe('rateLimitedMessage', () => {
  it('says the wait in minutes, rounded up', () => {
    expect(rateLimitedMessage('sign-ups', 2709)).toBe('Too many sign-ups from this network. Try again in 46 minutes.')
    expect(rateLimitedMessage('sign-in attempts', 61)).toBe(
      'Too many sign-in attempts from this network. Try again in 2 minutes.'
    )
  })

  it('says a minute, never "1 minutes" or "0 minutes"', () => {
    expect(rateLimitedMessage('sign-ups', 60)).toMatch(/Try again in a minute\.$/)
    expect(rateLimitedMessage('sign-ups', 5)).toMatch(/Try again in a minute\.$/)
  })

  it('says hours past an hour', () => {
    expect(rateLimitedMessage('sign-ups', 3600)).toMatch(/Try again in an hour\.$/)
    expect(rateLimitedMessage('sign-ups', 3 * 3600 + 1)).toMatch(/Try again in 4 hours\.$/)
  })

  it('still says something useful with no wait from the server', () => {
    expect(rateLimitedMessage('sign-ups', undefined)).toBe('Too many sign-ups from this network. Try again later.')
    expect(rateLimitedMessage('sign-ups', -3)).toBe('Too many sign-ups from this network. Try again later.')
  })
})

describe('the sign-in screen gets the wait', () => {
  it('from a refused sign-up', async () => {
    mockApi.signUp.mockResolvedValueOnce(refused(2709))
    await expect(signUp('a@b.co', 'pw', 'A', undefined, 30)).resolves.toMatchObject({
      success: false,
      error: 'Too many sign-ups from this network. Try again in 46 minutes.',
      errorCode: 'RATE_LIMITED',
    })
  })

  it('from a refused sign-in', async () => {
    mockApi.signInWithEmail.mockResolvedValueOnce(refused(840))
    await expect(signInWithEmail('a@b.co', 'pw')).resolves.toMatchObject({
      success: false,
      error: 'Too many sign-in attempts from this network. Try again in 14 minutes.',
    })
  })

  it("keeps the server's sentence for every other refusal", async () => {
    mockApi.signUp.mockResolvedValueOnce({ success: false, error: 'That email is already registered.' })
    await expect(signUp('a@b.co', 'pw')).resolves.toMatchObject({ error: 'That email is already registered.' })
  })
})

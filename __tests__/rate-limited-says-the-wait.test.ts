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
const { forgotPasswordMessage, rateLimitedMessage, socialSignInMessage } =
  require('../lib/signInRefusal') as typeof import('../lib/signInRefusal')
/* eslint-enable @typescript-eslint/no-require-imports */

const refused = (retryAfter?: number) => ({
  success: false,
  error: 'Too many requests',
  errorCode: 'RATE_LIMITED',
  retryAfter,
})

describe('rateLimitedMessage', () => {
  it('says the wait in minutes, rounded up', () => {
    expect(rateLimitedMessage('sign-ups from this network', 2709)).toBe(
      'Too many sign-ups from this network. Try again in 46 minutes.'
    )
    expect(rateLimitedMessage('sign-in attempts', 61)).toBe('Too many sign-in attempts. Try again in 2 minutes.')
  })

  it('says a minute, never "1 minutes" or "0 minutes"', () => {
    expect(rateLimitedMessage('reset requests', 60)).toMatch(/Try again in a minute\.$/)
    expect(rateLimitedMessage('reset requests', 5)).toMatch(/Try again in a minute\.$/)
  })

  it('says hours past an hour', () => {
    expect(rateLimitedMessage('reset requests', 3600)).toMatch(/Try again in an hour\.$/)
    expect(rateLimitedMessage('reset requests', 3 * 3600 + 1)).toMatch(/Try again in 4 hours\.$/)
  })

  it('still says something useful with no wait from the server', () => {
    expect(rateLimitedMessage('reset requests', undefined)).toBe('Too many reset requests. Try again later.')
    expect(rateLimitedMessage('reset requests', -3)).toBe('Too many reset requests. Try again later.')
    // A Retry-After header of "Infinity" parses; "in Infinity hours" is not a time.
    expect(rateLimitedMessage('reset requests', Infinity)).toBe('Too many reset requests. Try again later.')
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
    // Not "from this network": sign-in is also limited per account, and the
    // 429 does not say which limit it was.
    await expect(signInWithEmail('a@b.co', 'pw')).resolves.toMatchObject({
      success: false,
      error: 'Too many sign-in attempts. Try again in 14 minutes.',
      errorCode: 'RATE_LIMITED',
    })
  })

  it("keeps the server's sentence for a wrong password", async () => {
    mockApi.signInWithEmail.mockResolvedValueOnce({ success: false, error: 'Invalid email or password' })
    await expect(signInWithEmail('a@b.co', 'pw')).resolves.toMatchObject({ error: 'Invalid email or password' })
  })

  it("keeps the server's sentence for every other refusal", async () => {
    mockApi.signUp.mockResolvedValueOnce({ success: false, error: 'That email is already registered.' })
    await expect(signUp('a@b.co', 'pw')).resolves.toMatchObject({ error: 'That email is already registered.' })
  })
})

describe('Google, Apple and the reset link get the wait too', () => {
  it('a rate-limited social sign-in', () => {
    expect(socialSignInMessage('Google', { error: 'Too many requests', errorCode: 'RATE_LIMITED', retryAfter: 290 })).toBe(
      'Too many sign-in attempts. Try again in 5 minutes.'
    )
  })

  it('a rate-limited reset link, and every other reset failure as before', () => {
    expect(forgotPasswordMessage({ error: 'Too many requests', errorCode: 'RATE_LIMITED', retryAfter: 900 })).toBe(
      'Too many reset requests. Try again in 15 minutes.'
    )
    expect(forgotPasswordMessage({ error: 'Enter a valid email' })).toBe('Enter a valid email')
    expect(forgotPasswordMessage({})).toBe("Couldn't send the reset link. Try again.")
  })

  it('the screens and the social wrappers pass the wait on', () => {
    const read = (p: string) =>
      require('fs').readFileSync(require('path').join(__dirname, '..', p), 'utf8') as string // eslint-disable-line @typescript-eslint/no-require-imports
    expect(read('app/forgot-password.tsx')).toContain('setError(forgotPasswordMessage(result))')
    expect(read('app/sign-in.tsx')).toContain('setError(result.error ||')
    const carried =
      "return { success: false, error: result.error || 'Sign in failed', errorCode: result.errorCode, retryAfter: result.retryAfter }"
    expect(read('lib/useAuth.ts').split(carried).length - 1).toBe(2)
  })
})

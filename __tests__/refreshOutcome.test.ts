import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * A refresh that never completed is not a refresh the server refused.
 *
 * Driven on an emulator: one refresh timed out on a slow route after the
 * server had already rotated, the 401 path took `false` to mean "rejected",
 * cleared the tokens, and thirty minutes into the session the app was at
 * the sign-in screen. The server now re-issues on a replay inside its grace
 * window (blendn-admin, refresh-replay.itest.ts); this is the client's half —
 * keep the tokens when the request did not complete, and try again later.
 */
const src = readFileSync(join(__dirname, '..', 'lib', 'apiClient.ts'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '')

describe('a failed refresh is retried in the background (SCRUM-142)', () => {
  it('retries at 2 s, 5 s and 10 s and then stops until the next 401', () => {
    expect(src).toContain('export const REFRESH_RETRY_DELAYS_MS = [2000, 5000, 10000] as const')
    const after = src.slice(src.indexOf('p.then((outcome) => {'))
    expect(after).toMatch(/if \(outcome !== 'failed'\) \{\s*refreshRetryAttempt = 0\s*return\s*\}/)
    expect(after).toMatch(/const delay = REFRESH_RETRY_DELAYS_MS\[refreshRetryAttempt\]/)
    expect(after).toMatch(/refreshRetryTimer = setTimeout\(\(\) => \{\s*refreshRetryTimer = null\s*void this\.refreshTokens\(\)/)
  })

  it('does not make the caller wait for it — the failure is still reported as transport', () => {
    // The retries are scheduled off the settled promise; the 401 handler's
    // 'failed' branch is unchanged and returns immediately.
    const handler = src.slice(src.indexOf('if (response.status === 401 && requireAuth)'))
    const failedBranch = handler.slice(handler.indexOf("if (refreshed === 'failed')"), handler.indexOf('await TokenStorage.clearAll()'))
    expect(failedBranch).not.toContain('REFRESH_RETRY_DELAYS_MS')
    expect(failedBranch).not.toContain('setTimeout')
  })
})

describe('a session the server ended is explained on the entry screen (SCRUM-142)', () => {
  const events = readFileSync(join(__dirname, '..', 'lib', 'sessionEvents.ts'), 'utf8')
  const entry = readFileSync(join(__dirname, '..', 'app', 'index.tsx'), 'utf8')

  it('is recorded durably when the refresh is rejected, and read once by the entry screen', () => {
    expect(events).toMatch(/export function markSessionExpired\(\) \{\s*storage\(\)\s*\.then\(\(s\) => s\.setItem\(ENDED_KEY, '1'\)\)/)
    expect(events).toMatch(/if \(ended\) await s\.removeItem\(ENDED_KEY\)/)
    expect(entry).toContain('consumeSessionEndedNotice().then((ended) => {')
    expect(entry).toMatch(/\{!error && notice && \(\s*<Text style=\{styles\.notice\} accessibilityRole="alert">/)
  })

  it('says what happened and what to do', () => {
    expect(events).toMatch(/SESSION_ENDED_NOTICE = 'You were signed out\. Sign in again/)
  })
})

describe('a refresh distinguishes rejected from failed', () => {
  it('reports a timeout or dropped connection as failed, not rejected', () => {
    expect(src).toMatch(/catch \(error\) \{\s*Logger\.error\('api', 'Token refresh failed'[^}]*\}\)\s*return 'failed'/)
    expect(src).toContain("return response.status >= 500 ? 'failed' : 'rejected'")
  })

  it('keeps the session on a failed refresh and clears it only when rejected', () => {
    const handler = src.slice(src.indexOf('if (response.status === 401 && requireAuth)'))
    const failedBranch = handler.slice(handler.indexOf("if (refreshed === 'failed')"), handler.indexOf('await TokenStorage.clearAll()'))
    expect(failedBranch).toContain('return { success: false, error: TIMEOUT_MESSAGE }')
    expect(failedBranch).not.toContain('clearAll')
    expect(failedBranch).not.toContain('markSessionExpired')
  })
})

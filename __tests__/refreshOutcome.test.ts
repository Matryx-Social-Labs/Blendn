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

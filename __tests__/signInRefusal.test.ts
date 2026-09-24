import { readFileSync } from 'fs'
import { join } from 'path'

import { socialSignInMessage } from '../lib/signInRefusal'

/*
 * SCRUM-289. "Sign in with Google isn't working on iOS": the Google token
 * verified, the server refused the account — a dashboard admin, in the
 * attendee app — with 403 FORBIDDEN and a sentence saying where to go, and the
 * entry screen replaced that sentence with "Couldn't sign in with Google.
 * Please try again." A refusal read as a broken button. Email sign-in showed
 * the sentence all along.
 */
const STAFF =
  'This app is for attendees. Organisers, venue owners and sponsors sign in at the dashboard.'
const SUSPENDED =
  "This account has been suspended. Contact support@blendn.app if you think that's a mistake."

describe('socialSignInMessage', () => {
  it("says the server's reason when the server refused the account", () => {
    expect(socialSignInMessage('Google', { error: STAFF, errorCode: 'FORBIDDEN' })).toBe(STAFF)
    expect(socialSignInMessage('Apple', { error: SUSPENDED, errorCode: 'FORBIDDEN' })).toBe(SUSPENDED)
  })

  it('keeps the generic sentence for a failure that is not a refusal', () => {
    // A network error, a 5xx, a token Google would not verify: nothing the
    // person can act on, and the raw text ("HTTP 502 …") is not for them.
    expect(socialSignInMessage('Google', { error: 'HTTP 502 Bad Gateway (/api/mobile/auth/google)' })).toBe(
      "Couldn't sign in with Google. Please try again."
    )
    expect(socialSignInMessage('Apple', { error: 'Invalid Apple token', errorCode: 'UNAUTHORIZED' })).toBe(
      "Couldn't sign in with Apple. Please try again."
    )
    expect(socialSignInMessage('Google', { errorCode: 'FORBIDDEN' })).toBe(
      "Couldn't sign in with Google. Please try again."
    )
  })
})

describe('the entry screen says why', () => {
  const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8')

  it('passes both social results to socialSignInMessage instead of a fixed sentence', () => {
    const screen = read('app/index.tsx')
    expect(screen).toContain("setError(socialSignInMessage('Google', result))")
    expect(screen).toContain("setError(socialSignInMessage('Apple', result))")
  })

  it('carries errorCode out of signInWithGoogle and signInWithApple', () => {
    // Literal, not a regex over an object literal (see eventDetails-wired).
    const auth = read('lib/useAuth.ts')
    const carried = "return { success: false, error: result.error || 'Sign in failed', errorCode: result.errorCode }"
    expect(auth.split(carried).length - 1).toBe(2)
  })
})

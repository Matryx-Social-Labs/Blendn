/**
 * The three server sentences `lib/sessionEnd.ts` reads until the server sends codes (`fromSentence`). If the server's copy
 * is edited, the client quietly falls back to the generic notice: a suspended person is told "You were signed out" again
 * (SCRUM-93). So the sentences are pinned here word for word, and checked against the server's source when that repo is
 * beside this one (read from its `origin/dev` with git; ADMIN_REPO overrides the default clone, and the check is skipped without one, as CI has none).
 */
import { execFileSync } from 'child_process'
import { existsSync } from 'fs'
import { join } from 'path'

import { accountRefusalOf, classifySessionEnd } from '../lib/sessionEnd'

/** admin `lib/mobile-auth.ts:149-154` (SUSPENDED_MESSAGE, STAFF_MESSAGE) and `app/api/mobile/auth/{google,apple}/route.ts:98,100`. */
const SERVER = {
  suspended: "This account has been suspended. Contact support@blendn.app if you think that’s a mistake.",
  staff: 'This app is for attendees. Organizers, venue owners and sponsors sign in at the dashboard.',
  deleted: 'Account not found',
} as const

it('the suspended sentence, as a 403 FORBIDDEN, is a suspension', () => {
  expect(classifySessionEnd({ errorCode: 'FORBIDDEN', error: SERVER.suspended })).toBe('suspended')
  expect(accountRefusalOf({ errorCode: 'FORBIDDEN', error: SERVER.suspended })).toBe('suspended')
})

it('the staff sentence, as a 403 FORBIDDEN, is a staff account', () => {
  expect(classifySessionEnd({ errorCode: 'FORBIDDEN', error: SERVER.staff })).toBe('staff')
})

it('"Account not found" as a 401 from a social sign-in is a deleted account, and only there', () => {
  expect(classifySessionEnd({ errorCode: 'UNAUTHORIZED', error: SERVER.deleted })).toBe('deleted')
  expect(classifySessionEnd({ errorCode: 'NOT_FOUND', error: SERVER.deleted })).toBe('expired')
})

/**
 * The server's source at its `origin/dev`, never a working tree: a sibling worktree on another branch is not what ships.
 * ADMIN_REPO is the admin clone; it defaults to the main checkout when that exists, and the check is skipped without one.
 */
const DEFAULT_ADMIN_REPO = join(process.env.HOME ?? '', 'conductor/repos/blendn-admin')
const ADMIN = process.env.ADMIN_REPO ?? (existsSync(DEFAULT_ADMIN_REPO) ? DEFAULT_ADMIN_REPO : undefined)
const adminFile = (rel: string): string | null => {
  if (!ADMIN) return null
  try {
    return execFileSync('git', ['-C', ADMIN, 'show', `origin/dev:${rel}`], { encoding: 'utf8' }).replace(/\s+/g, ' ')
  } catch {
    return null
  }
}
const mobileAuth = adminFile('lib/mobile-auth.ts')
const maybe = mobileAuth ? it : it.skip

maybe('the server still says them: a copy edit there fails here, loudly', () => {
  expect(mobileAuth).toContain(SERVER.suspended)
  expect(mobileAuth).toContain(SERVER.staff)
  for (const route of ['google', 'apple']) {
    expect(adminFile(`app/api/mobile/auth/${route}/route.ts`)).toContain('errorResponse("Account not found", 401')
  }
})

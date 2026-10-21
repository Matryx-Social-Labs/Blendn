/**
 * The three server sentences `lib/sessionEnd.ts` reads until the server sends codes (`fromSentence`). If the server's copy
 * is edited, the client quietly falls back to the generic notice: a suspended person is told "You were signed out" again
 * (SCRUM-93). So the sentences are pinned here word for word, and checked against the server's source when that repo is
 * beside this one (set ADMIN_REPO to its path; skipped otherwise, as CI has no admin checkout).
 */
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'

import { accountRefusalOf, classifySessionEnd } from '../lib/sessionEnd'

/** admin `lib/mobile-auth.ts:149-154` (SUSPENDED_MESSAGE, STAFF_MESSAGE) and `app/api/mobile/auth/{google,apple}/route.ts:98,100`. */
const SERVER = {
  suspended: "This account has been suspended. Contact support@blendn.app if you think that's a mistake.",
  staff: 'This app is for attendees. Organisers, venue owners and sponsors sign in at the dashboard.',
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

const ADMIN = process.env.ADMIN_REPO ?? join(process.env.HOME ?? '', 'conductor/workspaces/blendn-admin/seville')
const mobileAuth = join(ADMIN, 'lib/mobile-auth.ts')
const present = existsSync(mobileAuth)
const text = (rel: string) => readFileSync(join(ADMIN, rel), 'utf8').replace(/\s+/g, ' ')
const maybe = present ? it : it.skip

maybe('the server still says them: a copy edit there fails here, loudly', () => {
  const src = text('lib/mobile-auth.ts')
  expect(src).toContain(SERVER.suspended)
  expect(src).toContain(SERVER.staff)
  for (const route of ['google', 'apple']) {
    expect(text(`app/api/mobile/auth/${route}/route.ts`)).toContain('errorResponse("Account not found", 401)')
  }
})

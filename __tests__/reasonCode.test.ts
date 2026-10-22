/**
 * The server keeps every `errorCode` an installed build reads (`FORBIDDEN`, `AGE_RESTRICTED`, `NOT_FOUND`) and names the
 * specific reason in a body field, `reasonCode`. A client reads `reasonCode ?? errorCode`. Each reader is checked in both
 * shapes: the current server (both fields) and an old one (`errorCode` and the sentence only).
 */
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'))

import { checkInRefusal } from '../lib/checkInRefusal'
import { eventLoadFailure } from '../lib/eventLinkRefusal'
import { goLiveRefusal } from '../lib/goLive'
import { accountRefusalOf, classifySessionEnd, reasonOf } from '../lib/sessionEnd'

const SENTENCE = 'A sentence this client does not recognise.'

describe('reasonOf', () => {
  it('is the reasonCode when there is one, else the errorCode', () => {
    expect(reasonOf({ errorCode: 'FORBIDDEN', reasonCode: 'ACCOUNT_SUSPENDED' })).toBe('ACCOUNT_SUSPENDED')
    expect(reasonOf({ errorCode: 'FORBIDDEN' })).toBe('FORBIDDEN')
    expect(reasonOf({ reasonCode: 'PASSWORD_RESET' })).toBe('PASSWORD_RESET')
    expect(reasonOf({})).toBeUndefined()
    expect(reasonOf(null)).toBeUndefined()
  })
})

describe('the account states, by reasonCode beside the old errorCode', () => {
  it.each([
    ['ACCOUNT_SUSPENDED', 'FORBIDDEN', 'suspended'],
    ['ACCOUNT_STAFF', 'FORBIDDEN', 'staff'],
    ['ACCOUNT_DELETED', 'NOT_FOUND', 'deleted'],
    ['ACCOUNT_DELETED', 'ACCOUNT_DELETED', 'deleted'],
    ['PASSWORD_RESET', 'PASSWORD_RESET', 'reset'],
    ['SESSION_REVOKED_ELSEWHERE', 'SESSION_REVOKED_ELSEWHERE', 'elsewhere'],
  ] as const)('%s beside %s is %s, whatever the sentence', (reasonCode, errorCode, reason) => {
    expect(classifySessionEnd({ errorCode, reasonCode, error: SENTENCE })).toBe(reason)
  })

  it('an old server (errorCode and sentence only) still reads the same', () => {
    expect(classifySessionEnd({ errorCode: 'FORBIDDEN', error: 'This account has been suspended. Contact support.' })).toBe('suspended')
    expect(classifySessionEnd({ errorCode: 'FORBIDDEN', error: 'This app is for attendees. Sign in at the dashboard.' })).toBe('staff')
    expect(classifySessionEnd({ errorCode: 'UNAUTHORIZED', error: 'Account not found' })).toBe('deleted')
    expect(classifySessionEnd({ errorCode: 'PASSWORD_RESET' })).toBe('reset')
  })

  it('a 403 FORBIDDEN with no reason and no known sentence stays the generic notice', () => {
    expect(classifySessionEnd({ errorCode: 'FORBIDDEN', error: SENTENCE })).toBe('expired')
    expect(classifySessionEnd({ errorCode: 'FORBIDDEN', reasonCode: 'PROFILE_INCOMPLETE', error: SENTENCE })).toBe('expired')
  })

  it('a refused sign-in is an account state by reasonCode, a failed attempt is not', () => {
    expect(accountRefusalOf({ errorCode: 'FORBIDDEN', reasonCode: 'ACCOUNT_STAFF', error: SENTENCE })).toBe('staff')
    expect(accountRefusalOf({ errorCode: 'ACCOUNT_DELETED', reasonCode: 'ACCOUNT_DELETED' })).toBe('deleted')
    expect(accountRefusalOf({ errorCode: 'UNAUTHORIZED', error: 'Invalid email or password' })).toBeNull()
    expect(accountRefusalOf({ errorCode: 'PASSWORD_RESET', reasonCode: 'PASSWORD_RESET' })).toBeNull()
  })
})

describe('the door, by reasonCode beside the old errorCode', () => {
  const ageUnknown = { errorCode: 'AGE_RESTRICTED', reasonCode: 'AGE_UNKNOWN', error: 'This event is 18+.' }
  const profile = { errorCode: 'FORBIDDEN', reasonCode: 'PROFILE_INCOMPLETE', error: SENTENCE }

  it('event links: the reason first, the old shape the same as before', () => {
    expect(eventLoadFailure(ageUnknown)).toBe('age_unknown')
    expect(eventLoadFailure(profile)).toBe('profile')
    expect(eventLoadFailure({ errorCode: 'NOT_FOUND', reasonCode: 'ACCOUNT_DELETED', error: 'User not found' })).toBe('notFound')
    // An age the server knows is under the line has no reasonCode: still a no.
    expect(eventLoadFailure({ errorCode: 'AGE_RESTRICTED', error: 'This event is 21+.' })).toBe('minor')
    expect(eventLoadFailure({ errorCode: 'AGE_RESTRICTED', error: 'Add your age to your profile.' })).toBe('age_unknown')
    expect(eventLoadFailure({ errorCode: 'FORBIDDEN' })).toBe('profile')
  })

  it('check-in: the fix the person can make, from the reason', () => {
    expect(checkInRefusal(reasonOf(ageUnknown), ageUnknown.error).fix?.kind).toBe('add_age')
    expect(checkInRefusal(reasonOf(profile), profile.error).fix?.kind).toBe('finish_profile')
    expect(checkInRefusal(reasonOf({ errorCode: 'AGE_RESTRICTED' }), 'This event is 21+.').fix).toBeUndefined()
    expect(checkInRefusal(reasonOf({ errorCode: 'FORBIDDEN' }), SENTENCE).fix?.kind).toBe('finish_profile')
  })

  it('Go Live: the same two fixes by reason, the old codes unchanged', () => {
    expect(goLiveRefusal(reasonOf(ageUnknown), ageUnknown.error)).toMatchObject({ reason: 'age', action: 'add_age' })
    expect(goLiveRefusal(reasonOf(profile), profile.error)).toMatchObject({ title: 'Finish your profile first' })
    expect(goLiveRefusal('AGE_RESTRICTED', SENTENCE)).toMatchObject({ reason: 'age', action: 'add_age' })
    expect(goLiveRefusal('FORBIDDEN', SENTENCE)).toMatchObject({ title: 'Finish your profile first' })
  })
})

describe('the cold-start failure keeps the reason for the outage screen', () => {
  it('stores errorCode and reasonCode, so maintenance named in either reaches `outageFrom`', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const src = require('fs').readFileSync(require('path').join(__dirname, '../lib/useAuth.ts'), 'utf8') as string
    expect(src).toContain('lastSessionFailure = { errorCode: result.errorCode, reasonCode: result.reasonCode, retryAfter: result.retryAfter }')
  })
})

describe('the sign-in results carry it to the screens that route on it', () => {
  it('Google, Apple and email each hand `reasonCode` on with the `errorCode`', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const src = require('fs').readFileSync(require('path').join(__dirname, '../lib/useAuth.ts'), 'utf8') as string
    expect(src.match(/return \{ success: false, error: [^}]*errorCode: result\.errorCode, reasonCode: result\.reasonCode/g)).toHaveLength(3)
  })
})

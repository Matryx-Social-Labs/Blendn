import { friendRefusal, friendRefusalLine } from '../lib/friendRefusal'

describe('friendRefusal (Flow 15 15.19)', () => {
  it('an unfinished profile: the reasonCode, beside an errorCode that keeps its old value', () => {
    expect(friendRefusal({ success: false, errorCode: 'FORBIDDEN', reasonCode: 'PROFILE_INCOMPLETE' })).toEqual({ kind: 'profile' })
  })

  it('a rate limit carries the server’s wait, rounded up', () => {
    expect(friendRefusal({ success: false, errorCode: 'RATE_LIMITED', reasonCode: 'RATE_LIMITED', retryAfter: 47.2 })).toEqual({ kind: 'ratelimit', seconds: 48 })
  })

  it('a rate limit with no wait is the minute the sentence promises', () => {
    expect(friendRefusal({ success: false, errorCode: 'RATE_LIMITED' })).toEqual({ kind: 'ratelimit', seconds: 60 })
  })

  it('an older server (no reasonCode) that sends the 429 alone still reads as a rate limit; a bare 403 does not read as a profile', () => {
    expect(friendRefusal({ success: false, errorCode: 'RATE_LIMITED', retryAfter: 10 })).toEqual({ kind: 'ratelimit', seconds: 10 })
    expect(friendRefusal({ success: false, errorCode: 'FORBIDDEN' })).toBeNull()
  })

  it('anything else, a success and nothing at all are not a refusal with a fix', () => {
    expect(friendRefusal({ success: false, errorCode: 'NOT_FOUND' })).toBeNull()
    expect(friendRefusal({ success: true })).toBeNull()
    expect(friendRefusal(undefined)).toBeNull()
  })

  it('one line for a list’s toast', () => {
    expect(friendRefusalLine({ kind: 'profile' })).toBe('Finish your profile to add friends')
    expect(friendRefusalLine({ kind: 'ratelimit', seconds: 5 })).toBe('Slow down — try again in a minute')
  })
})

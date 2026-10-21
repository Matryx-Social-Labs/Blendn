import { CHECK_IN_CODES } from './checkInRefusal'

/**
 * Why an event could not be opened, from the server's answer (Flow 15 #9 and #10).
 *
 * `network` is a failure to load (try again); `notFound` is an event that is gone (a calm landing, no retry); `minor` is an
 * age the server knows is under the event's (no fix, no sign-in loop); `age_unknown` and `profile` are the two the person can
 * fix, and the link is held through the fix; `broken` is a link missing a part (no retry). The server's codes are read
 * first (`AGE_UNKNOWN`, `PROFILE_INCOMPLETE`, `VALIDATION_FAILED`); `AGE_RESTRICTED` saying "Add your age" and a plain
 * 403 `FORBIDDEN` are what it sends today.
 */
export type EventLoadFailure = 'network' | 'notFound' | 'minor' | 'age_unknown' | 'profile' | 'broken'

const ADD_YOUR_AGE = /add your (age|date of birth)/i

export function eventLoadFailure(result: { errorCode?: string; error?: string }): EventLoadFailure {
  switch (result.errorCode) {
    case CHECK_IN_CODES.AGE_UNKNOWN:
      return 'age_unknown'
    case CHECK_IN_CODES.AGE_RESTRICTED:
      return ADD_YOUR_AGE.test(result.error ?? '') ? 'age_unknown' : 'minor'
    case CHECK_IN_CODES.PROFILE_INCOMPLETE:
    case CHECK_IN_CODES.FORBIDDEN:
      return 'profile'
    case 'VALIDATION_FAILED':
    case 'BAD_REQUEST':
      return 'broken'
    case 'NOT_FOUND':
      return 'notFound'
    default:
      return /not found/i.test(result.error ?? '') ? 'notFound' : 'network'
  }
}

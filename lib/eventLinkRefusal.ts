import { CHECK_IN_CODES } from './checkInRefusal'
import { reasonOf } from './sessionEnd'

/**
 * Why an event could not be opened, from the server's answer (Flow 15 #9 and #10).
 *
 * `network` is a failure to load (try again); `notFound` is an event that is gone (a calm landing, no retry); `minor` is an
 * age the server knows is under the event's (no fix, no sign-in loop); `age_unknown` and `profile` are the two the person can
 * fix, and the link is held through the fix; `broken` is a link missing a part (no retry). The server's codes are read
 * first, as `reasonCode ?? errorCode` (`AGE_UNKNOWN`, `PROFILE_INCOMPLETE`, `VALIDATION_FAILED`); an old server sends
 * `AGE_RESTRICTED` saying "Add your age" and a plain 403 `FORBIDDEN`, and those still read the same.
 *
 * An event whose organiser was suspended is the server's 404 `NOT_FOUND` with `reasonCode: ORGANISER_SUSPENDED` (blendn-admin
 * #716, only for somebody going or of the organisation; anybody else gets the plain 404). It reads as `notFound` by its code,
 * not by the sentence: any other reason the server puts on a `NOT_FOUND` (it has said it will add more) is still a thing that is
 * gone, and must not fall through to "try again" because `reasonOf` preferred the new code.
 */
export type EventLoadFailure = 'network' | 'notFound' | 'minor' | 'age_unknown' | 'profile' | 'broken'

/** `reasonCode` on the 404 of an event hidden because its organisation was suspended. */
export const ORGANISER_SUSPENDED = 'ORGANISER_SUSPENDED'

const ADD_YOUR_AGE = /add your (age|date of birth)/i

export function eventLoadFailure(result: { errorCode?: string; reasonCode?: string; error?: string }): EventLoadFailure {
  switch (reasonOf(result)) {
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
    case ORGANISER_SUSPENDED:
      return 'notFound'
    default:
      // A reason this build does not know, on the 404 that says the event is gone, is still gone.
      if (result.errorCode === 'NOT_FOUND') return 'notFound'
      return /not found/i.test(result.error ?? '') ? 'notFound' : 'network'
  }
}

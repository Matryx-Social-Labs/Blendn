import { RATE_LIMITED_CODE, rateLimitWait } from './rateLimited'

/**
 * Why a friend link or a friend request was refused, from the answer's `reasonCode ?? errorCode` (admin: friend-request send,
 * accept and invite open; Flow 15 #19). Two refusals have a screen of their own instead of "That didn't go through":
 *
 *  - `PROFILE_INCOMPLETE` (403): not onboarded, or no adult age on file. The fix is Edit profile, and the link stays open.
 *  - `RATE_LIMITED` (429, with `retryAfter` seconds): too many in a row. Nothing is lost; the same link works at zero.
 *
 * Anything else is `null`, and the caller says what it always said. A refusal never names the other person.
 */
export const PROFILE_INCOMPLETE_CODE = 'PROFILE_INCOMPLETE'

export type FriendRefusal = { kind: 'profile' } | { kind: 'ratelimit'; seconds: number }

type Answer = { success?: boolean; errorCode?: string; reasonCode?: string; retryAfter?: number }

export function friendRefusal(answer: Answer | null | undefined): FriendRefusal | null {
  if (!answer || answer.success) return null
  const reason = answer.reasonCode ?? answer.errorCode
  if (reason === PROFILE_INCOMPLETE_CODE) return { kind: 'profile' }
  if (reason === RATE_LIMITED_CODE || answer.errorCode === RATE_LIMITED_CODE) {
    const seconds = rateLimitWait([{ errorCode: RATE_LIMITED_CODE, retryAfter: answer.retryAfter }])
    return { kind: 'ratelimit', seconds: seconds ?? 0 }
  }
  return null
}

/** The rate limit's heading: it promises no length, the countdown beside it does. */
export const RATE_LIMITED_TITLE = 'Slow down — try again soon'

/** The frame's sentences (Flow 15 15.19). */
export const FRIEND_REFUSAL = {
  profile: {
    title: 'Finish your profile to add friends',
    body: 'Add a photo and your name first. The link stays open; we’ll bring you back to it.',
    fix: 'Finish my profile',
    later: 'Not now',
  },
  ratelimit: {
    // Not "in a minute": the countdown under it says how long, and it is rarely sixty seconds.
    title: RATE_LIMITED_TITLE,
    body: 'Too many links in a row. This one still works; nothing’s lost.',
    again: 'Try again in',
    back: 'Back',
  },
} as const

/** One line for a refusal inside a list (an Accept on Requests): the toast says the reason, never "check your connection". */
export function friendRefusalLine(refusal: FriendRefusal): string {
  return refusal.kind === 'profile' ? FRIEND_REFUSAL.profile.title : RATE_LIMITED_TITLE
}

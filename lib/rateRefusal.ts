/**
 * What a refused rating means (Flow 15 #11), from the code the server answers with.
 *
 * - `NOT_FOUND` is the night itself not being there (taken down, or a place's visit): the shared "Rating isn't open for this night" card.
 * - `FORBIDDEN` is this one rating not being allowed (the night has not ended, you were not there, you did not connect with them): a
 *   toast with the reason when the server names it (`reasonCode`), and the screen moves on, because asking again cannot change it.
 * - Anything else is a failure to send, and a retry may work: the generic toast, and the form stays.
 */
export type RateRefusal = { kind: 'gone' } | { kind: 'refused'; sentence: string } | { kind: 'failed' }

/** The server's reasons for a 403, in the app's words. */
export const RATE_REFUSAL_SENTENCES: Record<string, string> = {
  NOT_ENDED: 'You can rate this night once it has ended.',
  NOT_ATTENDED: 'You can rate nights you checked in to.',
  NOT_CONNECTED: 'You can only rate people you connected with.',
}

/** A refusal with no reason named (a server that has none yet). */
export const RATE_REFUSED_FALLBACK = 'That one can’t be rated.'

export function rateRefusal(res: { errorCode?: string; reasonCode?: string } | null | undefined): RateRefusal {
  if (res?.errorCode === 'NOT_FOUND') return { kind: 'gone' }
  if (res?.errorCode === 'FORBIDDEN') return { kind: 'refused', sentence: (res.reasonCode && RATE_REFUSAL_SENTENCES[res.reasonCode]) || RATE_REFUSED_FALLBACK }
  return { kind: 'failed' }
}

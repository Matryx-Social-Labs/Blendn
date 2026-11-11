import { TONIGHT_FROM } from './pulse'
import { calendarDate, calendarDaysBetween, clockTime, hourIn, WEEKDAYS, weekdayIn } from './time'
import { plainText } from './routeParams'
/**
 * The line a match conversation opens with.
 *
 * ## Why this is not a message
 *
 * `private_messages.sender_id` is a required foreign key and there is no `kind`
 * column, so a real "you both matched" row needs a nullable sender plus an enum
 * — and then it reaches three more systems: `unreadCount` counts messages, so
 * every new match would carry a permanent **1 unread** until opened; the
 * moderation pipeline would scan product copy nobody wrote; and push title
 * resolution reads `sender.name` on a message with no sender.
 *
 * The conversation already carries everything the line needs. Drawing it costs
 * no column and no exception in three places. The trade is that it does not
 * appear in a data export, which is the right thing to give up.
 *
 * ## Why a header rather than an empty state
 *
 * The obvious version renders it when the thread has no messages. That loses a
 * race: B liked first, gets the push, and if A types before B opens the app, B
 * arrives at an ordinary thread and never learns it came from a match. It also
 * flashes during pagination, when "no messages yet" and "not loaded yet" look
 * identical.
 *
 * So it is a header pinned above the first message. Both people always see it,
 * whoever types first, it needs no message count, and it scrolls away on its own
 * as the conversation grows.
 */

/** What the thread needs to know. A subset of the conversation payload. */
export interface MatchOpenerInput {
  /**
   * Opened from a mutual like rather than an accepted message request.
   *
   * Server-supplied (`GET /conversations`, `GET /conversations/:id`) and not
   * derivable here: the payload carries the resolved name and `theyRevealed`,
   * and the server's `mayShowRealName` returns true for **both** a
   * never-pseudonymous conversation and a revealed match. Building on
   * `theyRevealed` would have greeted every accepted message request as a match.
   */
  fromMatch?: boolean
  /** When the conversation opened, which for a match is when you matched (`createdAt`). */
  matchedAt?: string | null
  /** The question of the room you matched in (`lens.question`); null when it asks nothing. */
  question?: string | null
  now?: Date
  /** Tests only; the phone's zone otherwise (the moment is in your day, not the event's). */
  timeZone?: string
}

export interface MatchOpener {
  /** "You matched in the room · Tonight · 7:42 PM". */
  line: string
  /** Tonight's question, offered as the opener; null when the room asks nothing. */
  question: string | null
}

/**
 * A moment you lived, in the one date grammar looking back: "Tonight · 7:42 PM" (today from 5 PM, "Today" before),
 * "Yesterday · …", the weekday within the week ("Fri · 9:58 PM"), then the date. Empty for a time it can't read.
 */
export function matchedWhen(at: string, now: Date = new Date(), timeZone?: string): string {
  const when = new Date(at)
  if (Number.isNaN(when.getTime())) return ''
  const clock = clockTime(when, timeZone)
  const days = calendarDaysBetween(when, now, timeZone)
  if (days <= 0) return `${hourIn(when, timeZone) >= TONIGHT_FROM ? 'Tonight' : 'Today'} · ${clock}`
  if (days === 1) return `Yesterday · ${clock}`
  if (days < 7) return `${WEEKDAYS[weekdayIn(when, timeZone)]} · ${clock}`
  return `${calendarDate(when, { year: false, timeZone })} · ${clock}`
}

/**
 * The opener for this thread (Flow 5 D-A), or `null` if it has none: where and when you matched, then tonight's
 * question when the room asks one.
 *
 * `null` for an accepted message request: those have shown real names since they
 * existed and were never a match, so a match greeting on one is simply false.
 */
export function matchOpener(input: MatchOpenerInput): MatchOpener | null {
  if (!input.fromMatch) return null
  const when = input.matchedAt ? matchedWhen(input.matchedAt, input.now, input.timeZone) : ''
  return {
    line: when ? `You matched in the room · ${when}` : 'You matched in the room',
    question: input.question?.trim() || null,
  }
}

/**
 * The preview an inbox row shows for a match nobody has written in yet.
 *
 * The Banter's generic fallback is "Start chatting", which is true of any empty
 * thread and says nothing about why this one exists. A row that arrived because
 * two people chose each other should say so before it is opened.
 */
export function matchRowPreview(input: MatchOpenerInput): string | null {
  if (!input.fromMatch) return null
  return 'You matched — start the conversation'
}

/**
 * The composer's starting text from the DM route's optional `draft` param.
 *
 * The match moment suggests a first line; "Say hi" carries it here so it is
 * already typed. Only a draft — the screen never sends it on its own. A
 * missing, repeated or blank param starts the composer empty.
 */
export function draftParam(param: string | string[] | undefined): string {
  // Anybody's link can carry it: no control or direction marks, no longer than the composer takes.
  return plainText(param, DRAFT_MAX, { newlines: true })
}
const DRAFT_MAX = 1000

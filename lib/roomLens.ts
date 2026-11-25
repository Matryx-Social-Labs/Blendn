/**
 * The person, through the room's lens (Flow 5 · P-A, SCRUM-1042).
 *
 * One profile, the same fields everywhere; the event's type decides what leads
 * and which one question it asks tonight. The lens is the server's
 * (`category_lenses` → `room_lenses`, data rather than code), so a new category
 * or country is a row there. This module only orders what the server already
 * sent for this card: it reads no name, photo, bio or employer, so no lens can
 * put an identity on somebody who has not shown it.
 *
 * Shared with C4 (the DM opener and the match moment read the same question).
 */
import type { IconName } from '../components/ui/Icon'
import type { Badge, Overlap } from './aboutYou'

/** `GET /events/:id/matches/preferences`, the deck and `GET /users/:handle` all carry it. `question: null` asks nothing. */
export interface RoomLens {
  key: string
  question: string | null
}

/** What a card knows of a person, from the deck. Never identity: those fields are not in this type on purpose. */
export interface LensPerson {
  workField: string | null
  sharedIntents: readonly string[]
  /** Shared interests (category names you both picked). */
  interests: readonly string[]
  overlaps: readonly Overlap[]
  badges: readonly Badge[]
  /** Why they are here, their own pick (`MatchCard.workIntent`): the work lens's "Here to …" only. */
  workIntent?: string | null
}

export interface LeadPill {
  icon: IconName
  label: string
  /** The reason to meet (why they are here) is lit; facts about them are not. */
  lit: boolean
}

/** The work lens's picks, in the order Room settings offers them, as the pill says them. The server's enum `work_intent`. */
export const WORK_INTENTS = [
  { key: 'hire', label: 'Here to hire', short: 'Hire' },
  { key: 'find_work', label: 'Here to find work', short: 'Find work' },
  { key: 'build', label: 'Here to build', short: 'Build' },
  { key: 'learn', label: 'Here to learn', short: 'Learn' },
] as const
export type WorkIntent = (typeof WORK_INTENTS)[number]['key']

/** A value this build knows, or null (a newer server's pick says nothing rather than something wrong). */
export function parseWorkIntent(raw: unknown): WorkIntent | null {
  return WORK_INTENTS.find((w) => w.key === raw)?.key ?? null
}

/** The server's limit (`TONIGHT_ANSWER_MAX` in the preferences route). */
export const TONIGHT_ANSWER_MAX = 140

type Lead = 'field' | 'intent' | 'common' | 'languages' | 'often'

/** The board's lens table: what leads, in order. A key this build does not know leads with nothing (its question still shows). */
const LEAD_ORDER: Record<string, readonly Lead[]> = {
  work: ['field', 'intent'],
  music: ['intent', 'common'],
  arts: ['field', 'intent'],
  social: ['common', 'languages'],
  active: ['common', 'often'],
  venue_night: ['intent', 'languages'],
}

/** Rooms where what you share is the point, not a footnote. */
const THINGS_IN_COMMON = new Set(['social', 'venue_night'])

/** The shared intents, as the pill says them. `just_here` is never said (see `MatchCard.sharedIntents`). */
const INTENT_WORD: Record<string, string> = { friendship: 'friends', friends: 'friends', networking: 'work', dating: 'dating' }

function joinAnd(words: string[]): string {
  return words.length <= 1 ? (words[0] ?? '') : `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`
}

function pill(kind: Lead, p: LensPerson, lensKey: string): LeadPill | null {
  switch (kind) {
    case 'field':
      return p.workField ? { icon: lensKey === 'arts' ? 'palette' : 'briefcase', label: p.workField, lit: false } : null
    case 'intent': {
      // The work lens says their own pick ("Here to hire"), never a guess from the intents you share.
      if (lensKey === 'work') {
        const pick = WORK_INTENTS.find((w) => w.key === p.workIntent)
        return pick ? { icon: 'user-plus', label: pick.label, lit: true } : null
      }
      const words = [...new Set(p.sharedIntents.map((i) => INTENT_WORD[i]).filter((w): w is string => !!w))]
      return words.length ? { icon: 'users', label: `Here for ${joinAnd(words)}`, lit: true } : null
    }
    case 'common':
      return p.interests.length ? { icon: 'sparkles', label: `${p.interests.length} in common`, lit: false } : null
    case 'languages': {
      // The server's sentence, never re-derived here (its overlap budget decides whether there is one).
      const line = p.overlaps.find((o) => o.kind === 'language')?.text
      return line ? { icon: 'message-circle', label: line, lit: false } : null
    }
    case 'often': {
      const badge = p.badges[0]?.label
      return badge ? { icon: 'history', label: badge, lit: false } : null
    }
  }
}

/** The lead pills for this room's lens. A null lens (the plain profile) leads with nothing. */
export function leadFor(p: LensPerson, lens: RoomLens | null): LeadPill[] {
  if (!lens) return []
  return (LEAD_ORDER[lens.key] ?? []).map((k) => pill(k, p, lens.key)).filter((x): x is LeadPill => x !== null)
}

/** "In common" (or "Things in common" where that is the point) and the shared interests. */
export function commonFor(p: LensPerson, lens: RoomLens | null): { label: string; items: readonly string[] } {
  return { label: lens && THINGS_IN_COMMON.has(lens.key) ? 'Things in common' : 'In common', items: p.interests }
}

/** The server's trim: whitespace runs collapse, then the ends go. */
export function normalizeAnswer(s: string): string {
  return s.replace(/\s+/g, ' ').trim()
}

/** Code points after the server's trim: what its 140 counts. */
export function answerLength(s: string): number {
  return [...normalizeAnswer(s)].length
}

/** The Hinge-style card: only when the room asks a question and they answered it. Unanswered draws nothing (the board). */
export function tonightCardFor(lens: RoomLens | null, answer: string | null | undefined): { question: string; answer: string } | null {
  const said = answer ? normalizeAnswer(answer) : ''
  return lens?.question && said ? { question: lens.question, answer: said } : null
}

/** The sheet's first line: where you both are. A venue night has no event to name, so it names the place. */
export function contextLine(
  lens: RoomLens | null,
  event: { title: string; venueName?: string | null; city?: string | null }
): string | null {
  if (lens?.key === 'venue_night') {
    const place = event.venueName || event.title
    return place ? `At ${[place, event.city].filter(Boolean).join(', ')}` : null
  }
  return event.title ? `In the room at ${event.title}` : null
}

/** Under the name: "Anonymous · 31" until they have shown you who they are; the sheet adds how long they have been here. */
export function metaLine(shown: boolean, age: number | null | undefined, here?: string | null): string {
  return [shown ? 'Shown to you' : 'Anonymous', age, here].filter((x) => x != null && x !== '').join(' · ')
}

/** Past three hours the minute is not information, and a climbing counter reads as a meter (`timeHereLabel`'s cap). */
const HERE_CAP_MIN = 180

/**
 * How long they have been here (SCRUM-1042 state 1 A), from the roster's check-in time: "Here 40 min", "Here 2h 05m",
 * "Here 3h+". Null when the roster sent no time.
 */
export function hereFor(arrivedAt: string | null | undefined, now: number): string | null {
  const at = arrivedAt ? new Date(arrivedAt).getTime() : NaN
  if (!Number.isFinite(at)) return null
  const minutes = Math.floor(Math.max(0, now - at) / 60_000)
  if (minutes < 1) return 'Just got here'
  if (minutes < 60) return `Here ${minutes} min`
  if (minutes >= HERE_CAP_MIN) return 'Here 3h+'
  const m = minutes % 60
  return m === 0 ? `Here ${Math.floor(minutes / 60)}h` : `Here ${Math.floor(minutes / 60)}h ${String(m).padStart(2, '0')}m`
}

/** A venue night's openers (owner pick, state 1 A): static, for when you share nothing yet. Tapping one fills Message. */
export const VENUE_OPENERS = ['First time here?', 'What’s good here?', 'Who are you here with?'] as const

/** The openers this room offers, or null: a venue night only (an event's room has its own question). */
export function openersFor(lens: RoomLens | null): readonly string[] | null {
  return lens?.key === 'venue_night' ? VENUE_OPENERS : null
}

/** State 2 A's say-hi (owner OK, combined board): what is typed into Message for one of their topics. */
export const sayHiAbout = (topic: string) => `Saw ${topic} on your profile. How did you get into it?`

/** A Meet next pick's two lines: their answer, quoted, when they gave one; else what the lens leads with. */
export function pickReason(p: LensPerson, lens: RoomLens | null, answer: string | null | undefined): string | null {
  const said = tonightCardFor(lens, answer)
  if (said) return `“${said.answer}”`
  const lead = leadFor(p, lens).slice(0, 2).map((l) => l.label)
  return lead.length ? lead.join(' · ') : null
}

/** The server's lens, or null for anything that is not one. */
export function parseLens(raw: unknown): RoomLens | null {
  if (!raw || typeof raw !== 'object') return null
  const { key, question } = raw as { key?: unknown; question?: unknown }
  if (typeof key !== 'string' || !key) return null
  return { key, question: typeof question === 'string' && question.trim() ? question.trim() : null }
}

/** Everything the person sheet draws through the lens, from what the deck sent. `shown`: they have shown you who they are. */
export function lensView(
  p: LensPerson & { age?: number | null; tonightAnswer?: string | null; arrivedAt?: string | null },
  lens: RoomLens | null,
  event: { title: string; venueName?: string | null; city?: string | null } | null,
  shown: boolean,
  /** The sheet's clock: with it, how long they have been here joins the meta line (state 1 A, state 2 B). */
  now?: number
) {
  return {
    context: event ? contextLine(lens, event) : null,
    meta: metaLine(shown, p.age, now === undefined ? null : hereFor(p.arrivedAt, now)),
    openers: openersFor(lens),
    /** Tonight's question while they have not answered it: for you to ask (state 2 B), once they are shown to you. */
    ask: shown && lens?.question && !tonightCardFor(lens, p.tonightAnswer) ? lens.question : null,
    lead: leadFor(p, lens),
    tonight: tonightCardFor(lens, p.tonightAnswer),
    common: commonFor(p, lens),
  }
}

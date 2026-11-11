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
}

export interface LeadPill {
  icon: IconName
  label: string
  /** The reason to meet (why they are here) is lit; facts about them are not. */
  lit: boolean
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
      const words = [...new Set(p.sharedIntents.map((i) => INTENT_WORD[i]).filter((w): w is string => !!w))]
      return words.length ? { icon: lensKey === 'work' ? 'user-plus' : 'users', label: `Here for ${joinAnd(words)}`, lit: true } : null
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

/** Under the name: "Anonymous · 31" until they have shown you who they are. */
export function metaLine(shown: boolean, age: number | null | undefined): string {
  return [shown ? 'Shown to you' : 'Anonymous', age].filter((x) => x != null && x !== '').join(' · ')
}

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
  p: LensPerson & { age?: number | null; tonightAnswer?: string | null },
  lens: RoomLens | null,
  event: { title: string; venueName?: string | null; city?: string | null } | null,
  shown: boolean
) {
  return {
    context: event ? contextLine(lens, event) : null,
    meta: metaLine(shown, p.age),
    lead: leadFor(p, lens),
    tonight: tonightCardFor(lens, p.tonightAnswer),
    common: commonFor(p, lens),
  }
}

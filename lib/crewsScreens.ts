/**
 * What the crew screens say, decided without a render (Flow 10).
 *
 * The rules are the server's (`lib/crews/` in blendn-admin); this file only
 * decides how its answers read on the Round 4 screens, so each branch can be
 * tested on its own.
 */

import type { CrewPatch } from './crewsApi'
import {
  characters,
  closesLine,
  CREW_BIO_MAX,
  CREW_NAME_MAX,
  CREW_NAME_MIN,
  tagText,
  type Blend,
  type BlendPerson,
  type BlendSide,
  type Crew,
  type CrewIntent,
  type CrewInvite,
  type CrewMember,
} from './crews'
import { clockIn } from './time'

/* -------------------------------------------------------------------------- */
/* Invites                                                                    */
/* -------------------------------------------------------------------------- */

const DAY_MS = 24 * 60 * 60 * 1000
/** The server's `CREW.INVITE_TTL_MS`: an invite lapses 14 days after it was sent. */
export const INVITE_TTL_DAYS = 14

/** Lapsed by the clock (`invitedAt` + 14 days): the server stops listing it, a cached list does not. */
export function inviteLapsed(invitedAt: string, now: number = Date.now()): boolean {
  const sent = Date.parse(invitedAt)
  return Number.isFinite(sent) && now - sent >= INVITE_TTL_DAYS * DAY_MS
}

/** "today", "yesterday", "3 days ago": how long ago an invite came, or null when the time is unreadable. */
export function invitedAgo(invitedAt: string, now: number = Date.now()): string | null {
  const sent = Date.parse(invitedAt)
  if (!Number.isFinite(sent)) return null
  const days = Math.max(0, Math.floor((now - sent) / DAY_MS))
  if (days === 0) return 'today'
  return days === 1 ? 'yesterday' : `${days} days ago`
}

export interface InviteRow {
  invite: CrewInvite
  /** Expired: no button, the row dims. */
  lapsed: boolean
}

/** Open invites first, then the ones that lapsed, each in the order the server sent them. */
export function inviteRows(invites: readonly CrewInvite[], now: number = Date.now()): InviteRow[] {
  const rows = invites.map((invite) => ({ invite, lapsed: inviteLapsed(invite.invitedAt, now) }))
  return [...rows.filter((r) => !r.lapsed), ...rows.filter((r) => r.lapsed)]
}

/** "Aisha invited you to The Usual Suspects". */
export function inviteTitle(invite: Pick<CrewInvite, 'invitedBy' | 'name'>): string {
  return `${invite.invitedBy} invited you to ${invite.name}`
}

/** "Crew of 6 · 3 days ago", or "Expired". */
export function inviteSub(row: InviteRow, now: number = Date.now()): string {
  if (row.lapsed) return 'Expired'
  const ago = invitedAgo(row.invite.invitedAt, now)
  return ago ? `Crew of ${row.invite.size} · ${ago}` : `Crew of ${row.invite.size}`
}

/** "Priya asked you in": the pill over the invite card (board 03 A). */
export const askedYouIn = (invitedBy: string): string => `${invitedBy} asked you in`

/** The invite's one centred line holds the first three tags, then "+N" (board crews/tags/01 · Invite card). */
const INVITE_TAGS = 3

/** "Crew of 25 · #sundayrunclub · #कैफ़ेहॉपिंग · #chai🍵 · +2": the crew in one line under its name. */
export const inviteMeta = (invite: Pick<CrewInvite, 'size' | 'tags'>): string => {
  const shown = invite.tags.slice(0, INVITE_TAGS).map((t) => `#${tagText(t)}`)
  const more = invite.tags.length - shown.length
  return [`Crew of ${invite.size}`, ...shown, ...(more > 0 ? [`+${more}`] : [])].join(' · ')
}

/**
 * "Open for 13 more days · Priya isn't told if you say not now", under Not now. The days come from the server's `expiresAt`
 * (an older server's invite: 14 days from `invitedAt`); part of a day is a day, and past it or unreadable no days are claimed.
 */
export function inviteNote(invite: Pick<CrewInvite, 'invitedBy' | 'invitedAt' | 'expiresAt'>, now: number = Date.now()): string {
  const ends = invite.expiresAt ? Date.parse(invite.expiresAt) : Date.parse(invite.invitedAt) + INVITE_TTL_DAYS * DAY_MS
  const days = Math.ceil((ends - now) / DAY_MS)
  const silent = `${invite.invitedBy} isn’t told if you say not now`
  if (!Number.isFinite(days) || days <= 0) return silent
  return `Open for ${days} more ${days === 1 ? 'day' : 'days'} · ${silent}`
}

/** The longest crew name a button names; past it the button says "the crew", so a 32-character name never cuts its words off. */
const BUTTON_NAME_MAX = 12

/** "Join Nebula", or "Join the crew" for a name too long for the button. Counted as the server counts (`characters`). */
export const crewVerb = (verb: string, name: string): string =>
  characters(name) <= BUTTON_NAME_MAX ? `${verb} ${name}` : `${verb} the crew`

/** "Make Nebula · ask 3 friends": step 2's button, which is also the consent (board 02 A). */
export const makeLabel = (name: string, invited: number): string =>
  `${crewVerb('Make', name)} · ask ${invited} ${invited === 1 ? 'friend' : 'friends'}`

/* -------------------------------------------------------------------------- */
/* Rows                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * The second line of a crew's row. A crew of one is forming: it starts when a
 * friend accepts (the server keeps it while invites are open). How many were
 * asked is not on the crew yet, so the line does not guess it.
 */
export function crewRowSub(size: number): string {
  return size <= 1 ? 'Just you · starts when someone joins' : `Crew of ${size}`
}

/* -------------------------------------------------------------------------- */
/* Make a crew                                                                */
/* -------------------------------------------------------------------------- */

export const CREW_NAME_ERROR = `A crew name is ${CREW_NAME_MIN}–${CREW_NAME_MAX} characters`

/** The name as the server reads it: trimmed, inner runs of space folded. */
export const cleanName = (name: string): string => name.trim().replace(/\s+/g, ' ')

/** The name's length error, or undefined while it stands. */
export function nameError(name: string): string | undefined {
  const length = characters(cleanName(name))
  return length < CREW_NAME_MIN || length > CREW_NAME_MAX ? CREW_NAME_ERROR : undefined
}

/** True while the bio is within the cap; a longer one cannot be sent. */
export const bioFits = (bio: string): boolean => characters(bio.trim()) <= CREW_BIO_MAX

export type IntentChoice = 'friendship' | 'dating' | 'both'
export const INTENT_CHOICES: readonly { value: IntentChoice; label: string }[] = [
  { value: 'friendship', label: 'Friendship' },
  { value: 'dating', label: 'Dating' },
  { value: 'both', label: 'Both' },
]

const INTENT_BY_CHOICE: Record<IntentChoice, CrewIntent[]> = {
  friendship: ['friendship'],
  dating: ['dating'],
  both: ['friendship', 'dating'],
}

export const intentOf = (choice: IntentChoice): CrewIntent[] => [...INTENT_BY_CHOICE[choice]]

/** The choice a crew's intent list stands for, or null when it is something the picker has no chip for. */
export function intentChoice(intent: readonly CrewIntent[]): IntentChoice | null {
  const has = (i: CrewIntent) => intent.includes(i)
  if (intent.some((i) => i !== 'friendship' && i !== 'dating')) return null
  if (has('friendship') && has('dating')) return 'both'
  if (has('dating')) return 'dating'
  return has('friendship') ? 'friendship' : null
}

const INTENT_LABEL: Record<CrewIntent, string> = {
  friendship: 'Friendship',
  dating: 'Dating',
  networking: 'Networking',
  just_here: 'Just here',
}

/** "Friendship · Dating", or undefined for a crew that named none. */
export function intentLine(intent: readonly CrewIntent[]): string | undefined {
  return intent.length ? intent.map((i) => INTENT_LABEL[i]).join(' · ') : undefined
}

/** The step line: "1 of 2 · Name and friends" (board 02 A: friends first, the vibe optional after). */
export const MAKE_STEPS = ['Name and friends', 'Your crew’s vibe'] as const
export type MakeStep = 1 | 2
export const stepLine = (step: MakeStep): string => `${step} of ${MAKE_STEPS.length} · ${MAKE_STEPS[step - 1]}`

/** The sheet's note beside "Make a crew": "1" in mono, then " of 2 · Name and friends"; read as "Step 1 of 2, Name and friends". */
export const stepNote = (step: MakeStep) => ({
  lead: String(step),
  text: ` of ${MAKE_STEPS.length} · ${MAKE_STEPS[step - 1]}`,
  label: `Step ${step} of ${MAKE_STEPS.length}, ${MAKE_STEPS[step - 1]}`,
})

/** The success line: "Your crew. 3 invited; it starts when someone joins." */
export const madeLine = (invited: number): string =>
  invited > 0 ? `Your crew. ${invited} invited; it starts when someone joins.` : 'Your crew.'

/** The form fields a refused text can stand under. */
export type CrewTextField = 'name' | 'bio' | 'tags'

/**
 * Which field a refused text is about. The server names it (`field`) when it can; failing that, only a
 * sentence that says "a crew's name" or "a crew's bio" is read. Anything else (the contact-details
 * sentence is about whichever field held the number) is the form's, not a guess at a field.
 */
export function textFieldOf(message: string, field?: unknown): CrewTextField | null {
  if (field === 'name' || field === 'bio' || field === 'tags') return field
  // A validation error names the tag by its place (`tags.2`).
  if (typeof field === 'string' && field.startsWith('tags.')) return 'tags'
  if (/crew(?:.s)? name/i.test(message)) return 'name'
  if (/crew(?:.s)? bio/i.test(message)) return 'bio'
  if (/crew(?:.s)? tag/i.test(message)) return 'tags'
  return null
}

/* -------------------------------------------------------------------------- */
/* Refusals                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * The title of the sheet a server refusal opens. The body is the server's own
 * sentence; the title only says which door was shut.
 */
export function refusalTitle(message: string, errorCode?: string | null): string {
  if (errorCode === 'FORBIDDEN' && /18 and over/i.test(message)) return 'Not yet'
  if (/at most \d+ people/i.test(message)) return 'This crew is full'
  if (/be in up to/i.test(message)) return 'Can’t join another crew'
  if (/own up to|enough new crews/i.test(message)) return 'Can’t make another crew'
  return 'Couldn’t do that'
}

/** The age and set-up gate: the one refusal that has somewhere to go. */
export const isGate = (message: string, errorCode?: string | null): boolean => refusalTitle(message, errorCode) === 'Not yet'

/* -------------------------------------------------------------------------- */
/* The crew page                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Leaving a crew of two closes it (D-15: below two people a crew dissolves),
 * and the sheet says so before the tap.
 */
export const leavingClosesCrew = (crew: Pick<Crew, 'size'>): boolean => crew.size <= 2

/** "Leave Nebula?" with the body for a crew that would carry on, or close. An owner's crew that carries on gets `ownerSheet`. */
export function leaveSheet(crew: Pick<Crew, 'name' | 'size'>): { title: string; message: string; action: string } {
  const title = `Leave ${crew.name}?`
  if (leavingClosesCrew(crew)) return { title, message: 'Leaving will close the crew — there’ll be one of you left.', action: 'Leave and close the crew' }
  return { title, message: 'You leave the crew and its chat. Nobody is told you left; the crew just has one fewer.', action: 'Leave crew' }
}

/**
 * Who an owner who leaves hands the crew to: the member who joined first. The server (admin lib/crews/crews.ts
 * `settleLocked`) also passes over anyone suspended or already owning 3 crews, and a member kept apart from the owner is
 * not on this list. ponytail: then the name is wrong; a server `heir` field fixes it if that ever matters.
 */
export function heirOf(crew: Pick<Crew, 'members'>): CrewMember | null {
  const others = crew.members.filter((m) => m.role !== 'owner')
  return others.reduce<CrewMember | null>((first, m) => (first && first.joinedAt <= m.joinedAt ? first : m), null)
}

/** Crews 5A (board 06-leave · A, owner): the owner's two doors, each saying what happens to the others. */
export function ownerSheet(crew: Pick<Crew, 'name' | 'members'>): { title: string; message: string; leave: string; end: string } {
  const heir = heirOf(crew)
  return {
    title: crew.name,
    message: 'You own this crew.',
    leave: heir ? `Leave — ${heir.name} takes it over` : 'Leave — it passes on',
    end: 'End the crew for everyone',
  }
}

/** Crews 5A's confirm: exactly what `DELETE /crews/:crewId` ends (docs/api/API.md → End the crew), and that nobody is pushed. */
export function endSheet(crew: Pick<Crew, 'name' | 'size'>): { title: string; message: string; action: string } {
  return {
    title: `End ${crew.name}?`,
    message: `The crew and its chat close for all ${crew.size} of you, and the chat can’t be opened again. Its invites are cancelled and open Mixes close. Your friendships stay. Nobody is notified. This can’t be undone.`,
    action: `End ${crew.name}`,
  }
}

/** "Remove Rohan from Nebula?" and what it does. */
export function removeSheet(crew: Pick<Crew, 'name'>, member: string): { title: string; message: string } {
  return {
    title: `Remove ${member} from ${crew.name}?`,
    message: `${member} loses the crew and its chat. They aren’t told who removed them. They can be invited again later.`,
  }
}

/* -------------------------------------------------------------------------- */
/* The Blend page                                                             */
/* -------------------------------------------------------------------------- */

/** Everyone in a Blend that you can see, both sides. */
export const blendPeople = (blend: Pick<Blend, 'sides'>): number => blend.sides.reduce((sum, s) => sum + s.count, 0)

const CLOSING_SOON_MS = 60 * 60 * 1000

/** Within the hour (T-60): the Blend says when it closes, quietly. */
export function closingSoon(closesAt: string, now: number = Date.now()): boolean {
  const at = Date.parse(closesAt)
  return Number.isFinite(at) && at > now && at - now <= CLOSING_SOON_MS
}

/** "4 am", "12:30 pm": the time on the phone's own clock. */
export function clockOf(iso: string): string | null {
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return null
  const [hours, minutes] = clockIn(at)
  return `${hours % 12 || 12}${minutes ? `:${String(minutes).padStart(2, '0')}` : ''} ${hours < 12 ? 'am' : 'pm'}`
}

/** "This Blend closes at 4 am". */
export function closesAtLine(closesAt: string): string | null {
  const clock = clockOf(closesAt)
  return clock ? `This Mix closes at ${clock}` : null
}

/** The first-open card's body: "Made at Toit · closes 4 am. Everyone here is on tonight’s names until they reveal." */
export function blendWelcome(closesAt: string, venue?: string | null): string {
  const clock = clockOf(closesAt)
  const made = venue ? `Made at ${venue}` : 'Made tonight'
  return `${made}${clock ? ` · closes ${clock}` : ''}. Everyone here is on tonight’s names until they reveal.`
}

/** "7 people": the header's second line, before the clock. */
export const peopleLine = (blend: Pick<Blend, 'sides'>): string => `${blendPeople(blend)} people`

/** Your reveals made on this phone, for the Blends whose side the server has not yet marked: "userId|blendId". */
const revealedOnThisPhone = new Set<string>()
export const rememberReveal = (userId: string, blendId: string): void => void revealedOnThisPhone.add(`${userId}|${blendId}`)
export const revealRemembered = (userId: string | null | undefined, blendId: string): boolean =>
  !!userId && revealedOnThisPhone.has(`${userId}|${blendId}`)

/** Whether your crew's reveal is known to have happened: the server's flag, or a tap on this screen. */
export function revealedFor(side: BlendSide | null, revealedHere: boolean): boolean {
  return revealedHere || side?.crewRevealed === true
}

/* -------------------------------------------------------------------------- */
/* Editing a crew                                                             */
/* -------------------------------------------------------------------------- */

export interface CrewEdit {
  name: string
  bio: string
  /** null: the crew's intent is one the picker has no chip for, and the owner left it alone. */
  choice: IntentChoice | null
  tags: readonly string[]
  openToSolo: boolean
}

/** What the owner is editing starts as: the crew as it stands. */
export function editOf(crew: Pick<Crew, 'name' | 'bio' | 'intent' | 'tags' | 'openToSolo'>): CrewEdit {
  return {
    name: crew.name,
    bio: crew.bio ?? '',
    choice: intentChoice(crew.intent),
    tags: crew.tags.map(tagText),
    openToSolo: crew.openToSolo,
  }
}

const sameSet = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x) => b.includes(x))

/**
 * The `PATCH` for what actually changed, or null when nothing did (Save then
 * just closes: the server refuses an empty change). An intent the picker has no
 * chip for is never overwritten by a default.
 */
export function crewPatch(
  crew: Pick<Crew, 'name' | 'bio' | 'intent' | 'tags' | 'openToSolo'>,
  edit: CrewEdit
): CrewPatch | null {
  const patch: CrewPatch = {}
  const name = cleanName(edit.name)
  if (name !== crew.name) patch.name = name
  const bio = edit.bio.trim()
  if (bio !== (crew.bio ?? '')) patch.bio = bio || null
  if (edit.choice && edit.choice !== intentChoice(crew.intent)) patch.intent = intentOf(edit.choice)
  if (!sameSet(edit.tags, crew.tags.map(tagText))) patch.tags = [...edit.tags]
  if (edit.openToSolo !== crew.openToSolo) patch.openToSolo = edit.openToSolo
  return Object.keys(patch).length ? patch : null
}

/* -------------------------------------------------------------------------- */
/* A side of a Blend, as RevealSide draws it                                   */
/* -------------------------------------------------------------------------- */

export interface SideShape {
  side: { kind: 'crew'; name: string; emblemSeed: string } | { kind: 'person'; name: string; pseudonym: string }
  /** Alphabetical, so the order never says who chose what. A photo only for somebody the server named. */
  people: { pseudonym: string; photo: string | null }[]
  /** Set only for your own side when the server has not sent it the counts; see `RevealSide`. */
  status?: string
}

const byPseudonym = (a: BlendPerson, b: BlendPerson) => a.pseudonym.localeCompare(b.pseudonym)

/**
 * The shape RevealSide draws for one side. The server's `name` is the reveal: a photo without it is not
 * one, and somebody who kept private stays a creature (never a blank, never a face). Their side is the
 * people the server sends; yours is you alone with what is known.
 */
export function sideShape(side: BlendSide, myId: string | null | undefined, revealedHere = false): SideShape {
  const named = (p: BlendPerson) => ({ pseudonym: p.pseudonym, photo: p.name ? p.photo : null })
  const me = side.people.find((p) => p.userId === myId) ?? side.people[0]
  const shape: SideShape['side'] =
    side.kind === 'crew'
      ? { kind: 'crew', name: side.name || 'A crew', emblemSeed: side.emblemSeed ?? '' }
      : side.mine
        ? { kind: 'person', name: 'You', pseudonym: me?.pseudonym ?? 'You' }
        : { kind: 'person', name: me?.name || me?.pseudonym || 'Someone', pseudonym: me?.pseudonym ?? 'Someone' }
  if (!side.mine) return { side: shape, people: [...side.people].sort(byPseudonym).map(named) }
  // Your own side is you alone (the server never says which crewmate kept private), with what is known.
  // Your face shows only once the server has named you in this Blend; it leaves you out if you keep anonymous.
  const shown = revealedFor(side, revealedHere) && !!me?.name
  return {
    side: shape,
    people: me ? [{ pseudonym: me.pseudonym, photo: shown ? me.photo : null }] : [],
    status: shown ? 'Revealed' : `${side.count} on tonight’s names`,
  }
}

/* -------------------------------------------------------------------------- */
/* The crew page's top bar                                                    */
/* -------------------------------------------------------------------------- */

export type CrewBarState = 'rest' | 'scrolled' | 'condensed'

/** The head's height: the 160 emblem, the 10 gap and the 30-line title. Once it has scrolled under the bar, the bar names the crew. */
export const CREW_HEAD_HEIGHT = 200
/** Glass appears once the content has moved this far (DS #30: 8 pt). */
export const CREW_BAR_GLASS_AT = 8

/** The bar's state at a scroll offset: bare, glass behind, then the crew's name condensed in it. */
export function crewBarState(offsetY: number): CrewBarState {
  if (offsetY > CREW_HEAD_HEIGHT) return 'condensed'
  return offsetY > CREW_BAR_GLASS_AT ? 'scrolled' : 'rest'
}

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
  type Blend,
  type BlendPerson,
  type BlendSide,
  type Crew,
  type CrewIntent,
  type CrewInvite,
} from './crews'

/* -------------------------------------------------------------------------- */
/* Invites                                                                    */
/* -------------------------------------------------------------------------- */

const DAY_MS = 24 * 60 * 60 * 1000
/** The server's `CREW.INVITE_TTL_MS`: an invite lapses 14 days after it was sent. */
export const INVITE_TTL_DAYS = 14

/**
 * Invites an accept answered 404 to, for this session: gone (lapsed,
 * withdrawn, the crew dissolved). The list draws them as "Expired" rather than
 * offering them again, even if a cached read still lists one.
 */
export const goneInvites = new Set<string>()

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
export function inviteRows(
  invites: readonly CrewInvite[],
  gone: ReadonlySet<string> = goneInvites,
  now: number = Date.now()
): InviteRow[] {
  const rows = invites.map((invite) => ({ invite, lapsed: gone.has(invite.crewId) || inviteLapsed(invite.invitedAt, now) }))
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

/** "Aisha invited you · Crew of 6", the line under an invite's tags. */
export function inviteWho(invite: Pick<CrewInvite, 'invitedBy' | 'size'>): string {
  return `${invite.invitedBy} invited you · Crew of ${invite.size}`
}

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

/** The step line: "1 of 3 · Name and vibe". */
export const MAKE_STEPS = ['Name and vibe', 'Invite friends', 'Consent'] as const
export type MakeStep = 1 | 2 | 3
export const stepLine = (step: MakeStep): string => `${step} of ${MAKE_STEPS.length} · ${MAKE_STEPS[step - 1]}`

/** "3 invited · Friendship · Dance floor, Techno heads": the summary under the consent. */
export function makeSummary(args: { invited: number; intent: readonly CrewIntent[]; tags: readonly string[] }): string {
  return [`${args.invited} invited`, intentLine(args.intent), args.tags.length ? args.tags.join(', ') : undefined]
    .filter(Boolean)
    .join(' · ')
}

/** The success line: "Your crew. 3 invited; it starts when someone joins." */
export const madeLine = (invited: number): string =>
  invited > 0 ? `Your crew. ${invited} invited; it starts when someone joins.` : 'Your crew.'

/**
 * Which field a server sentence about the text is about. The server refuses a
 * name or a bio in its own words ("This can't be a crew's name.", the contact
 * details sentence), and the sentence belongs under the field it names.
 */
export function textFieldOf(message: string): 'name' | 'bio' | null {
  if (/crew(?:.s)? name/i.test(message)) return 'name'
  if (/crew(?:.s)? bio|crew card/i.test(message)) return 'bio'
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

/** "Leave Nebula?" with the body for a crew that would carry on, or close. */
export function leaveSheet(crew: Pick<Crew, 'name' | 'size'>): { title: string; message: string; action: string } {
  return leavingClosesCrew(crew)
    ? {
        title: `Leave ${crew.name}?`,
        message: 'Leaving will close the crew — there’ll be one of you left.',
        action: 'Leave and close the crew',
      }
    : {
        title: `Leave ${crew.name}?`,
        message: 'You leave the crew and its chat. Nobody is told you left; the crew just has one fewer.',
        action: 'Leave crew',
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
  const hours = at.getHours()
  const minutes = at.getMinutes()
  return `${hours % 12 || 12}${minutes ? `:${String(minutes).padStart(2, '0')}` : ''} ${hours < 12 ? 'am' : 'pm'}`
}

/** "This Blend closes at 4 am". */
export function closesAtLine(closesAt: string): string | null {
  const clock = clockOf(closesAt)
  return clock ? `This Blend closes at ${clock}` : null
}

/** The first-open card's body: "Made tonight · closes 4 am. Everyone here is on tonight’s names until they reveal." */
export function blendWelcome(closesAt: string): string {
  const clock = clockOf(closesAt)
  return `${clock ? `Made tonight · closes ${clock}.` : 'Made tonight.'} Everyone here is on tonight’s names until they reveal.`
}

/** "7 people · Closes in 9h": the header's second line. */
export function blendSub(blend: Pick<Blend, 'sides' | 'closesAt'>, now: number = Date.now()): string {
  const people = `${blendPeople(blend)} people`
  const closes = closesLine(blend.closesAt, now)
  return closes ? `${people} · ${closes}` : people
}

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
    tags: crew.tags.map((t) => t.slug),
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
  if (!sameSet(edit.tags, crew.tags.map((t) => t.slug))) patch.tags = [...edit.tags]
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
 * The shape RevealSide draws for one side. The server's `name` is the reveal:
 * a photo without it is not one, and somebody who kept private stays a
 * creature (never a blank, never a face). Their side is the people the server
 * sends. Your own side is the people it sends when it sends them all; until
 * then, you alone with what is known (how many are here, and whether your
 * crew has revealed), because a crew is never told who kept private.
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
  const everyone = !side.mine || (side.people.length >= side.count && side.revealed != null)
  if (everyone) return { side: shape, people: [...side.people].sort(byPseudonym).map(named) }
  const revealed = revealedFor(side, revealedHere)
  return {
    side: shape,
    // Your own face only once your crew has revealed: before it you are on tonight's name like the rest.
    people: me ? [{ pseudonym: me.pseudonym, photo: revealed ? me.photo : null }] : [],
    status: revealed ? 'Revealed' : `${side.count} on tonight’s names`,
  }
}

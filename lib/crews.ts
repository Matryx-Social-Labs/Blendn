/**
 * Crews and Blends as the app draws them (plan v2 §6, step 9).
 *
 * Pure, so the rules the screens follow can be tested without a render. The
 * server owns every gate (`lib/crews/` in blendn-admin, `docs/api/API.md` →
 * Crews and Blends); this file only decides how its answers look.
 *
 * Three rules from the server that the copy here must not undo:
 *
 * - **`invited` is a count of who you asked**, never who got an invite. The
 *   server skips people silently (a block, a recent decline, already in) so
 *   that inviting cannot be used to learn anything about them.
 * - **A crew card is counts**, never people: no name, photo or pseudonym on
 *   it. People appear only inside a Blend, by tonight's pseudonym, and by
 *   first name once their crew reveals there.
 * - **One 404 for every "not yours"**, so a refusal never says which crews
 *   exist, who blocked whom, or who left.
 */

/** The server's `CREW` constants (blendn-admin lib/constants.ts). */
import type { Badge, Overlap } from './aboutYou'

export const CREW_MAX_MEMBERS = 12
export const CREW_NAME_MIN = 2
export const CREW_NAME_MAX = 32
export const CREW_BIO_MAX = 140
export const CREW_MAX_TAGS = 3

/** The curated tags, as `CREW_TAGS` on the server. Never free text. */
export const CREW_TAGS: readonly { slug: string; label: string }[] = [
  { slug: 'quiz-team', label: 'Quiz team' },
  { slug: 'run-club', label: 'Run club' },
  { slug: 'techno-heads', label: 'Techno heads' },
  { slug: 'office-gang', label: 'Office gang' },
  { slug: 'birthday-crew', label: 'Birthday crew' },
  { slug: 'foodies', label: 'Foodies' },
  { slug: 'board-gamers', label: 'Board gamers' },
  { slug: 'gig-goers', label: 'Gig goers' },
  { slug: 'book-club', label: 'Book club' },
  { slug: 'dance-floor', label: 'Dance floor' },
]

/** `POST /crews/:crewId/report` takes exactly these. */
export const CREW_REPORT_REASONS: readonly { value: CrewReportReason; label: string }[] = [
  { value: 'offensive', label: 'Offensive name or bio' },
  { value: 'contact_details', label: 'Contact details on the card' },
  { value: 'impersonation', label: 'Pretending to be someone else' },
  { value: 'spam', label: 'Spam' },
  { value: 'other', label: 'Something else' },
]
export type CrewReportReason = 'spam' | 'offensive' | 'contact_details' | 'impersonation' | 'other'

/*
 * The join-time consent (owner decision (a), 2026-10-01). Joining is the
 * consent, so it is shown beside every way in — create and accept — never
 * behind a "more". The server refuses a join without `revealConsent: true`.
 */
export const CONSENT_LINE =
  'Anyone in this crew can reveal the crew — your name and photos — to people you match with.'
export const CONSENT_AGREE = 'I understand'
export const KEEP_ANONYMOUS_LABEL = 'Keep me anonymous even when my crew reveals'
/** D-10: switching it on later applies from then on. Say so, rather than imply it can unsee. */
export const KEEP_ANONYMOUS_HELPER =
  'Your crewmates can still reveal themselves. Turning this on later applies from then on — a reveal already made can’t be undone.'

export const BLEND_CLOSED_LINE = 'This Blend has closed'
export const CREW_GONE_LINE = 'This crew isn’t around any more'
/** A crew chat that removed you (a ban written into it): you, not the crew, are gone. */
export const CREW_REMOVED_LINE = 'You’re no longer in this crew’s chat'
export const OPEN_TO_CREWS_LABEL = 'Open to joining a crew tonight'
/*
 * What the switch does, as the server does it (`lib/crews/like.ts`): you see
 * crews here with room for one more, you can like them, and their likes of
 * you count. Nobody is told you turned it on — a crew's like of somebody who
 * did not answers exactly like one that stood.
 */
export const OPEN_TO_CREWS_HELPER =
  'Nobody is told you turned this on. It shows you crews here with room for one more, lets you like them, and lets their likes of you count. It switches itself off when tonight ends.'
/**
 * After a reveal. The server says no count back — who of your crew revealed
 * and who kept private is never told to your own crew.
 */
export const REVEALED_LINE =
  'Your crew is revealed in this Blend. Anybody who chose to stay anonymous stays that way.'

export type CrewIntent = 'dating' | 'networking' | 'friendship' | 'just_here'

export interface CrewTag {
  slug: string
  label: string
}

/** One member as `GET /crews` sends them: first name, one photo. */
export interface CrewMember {
  /** Yours is your own id; anyone else's is their handle in the crew's room. */
  userId: string
  /** One of your friends — the invite picker leaves them out. Never true for you. */
  isFriend: boolean
  name: string
  photo: string | null
  role: 'owner' | 'member'
  joinedAt: string
}

export interface Crew {
  crewId: string
  name: string
  bio: string | null
  intent: CrewIntent[]
  tags: CrewTag[]
  emblemSeed: string
  openToSolo: boolean
  createdAt: string
  chatGroupId: string | null
  size: number
  you: { role: 'owner' | 'member'; keepMeAnonymous: boolean } | null
  members: CrewMember[]
}

export interface CrewInvite {
  crewId: string
  name: string
  bio: string | null
  emblemSeed: string
  tags: CrewTag[]
  size: number
  /** The friend who asked you, by first name. */
  invitedBy: string
  invitedAt: string
}

/** A crew here now, as a card. Counts only — never a person. */
export interface CrewCard {
  crewId: string
  name: string
  bio: string | null
  emblemSeed: string
  size: number
  presentCount: number
  tags: CrewTag[]
  intent: CrewIntent[]
  /** Your side liked them tonight. Never whether they liked you. */
  youLiked: boolean
  /**
   * Up to two lines of what this crew holds in common with your side —
   * "Both crews are into Techno", "Two RCB crews". Crew-held, never a member
   * and never a count (matching v2). Optional: a client outlives a deploy.
   */
  overlaps?: Overlap[]
  /** "6 nights out together". */
  badges?: Badge[]
}

export interface CrewsAtEvent {
  crewsEnabled: boolean
  crews: CrewCard[]
  /** Your crews here now (two of you checked in): what a like is sent "as". */
  myCrews: { crewId: string; name: string; presentCount: number }[]
  total: number
  hasMore: boolean
}

export interface BlendPerson {
  /** Yours is your own id; anyone else's is their handle in the Blend's room. */
  userId: string
  pseudonym: string
  /** First name, only once revealed in this Blend. */
  name: string | null
  photo: string | null
}

export interface BlendSide {
  kind: 'crew' | 'person'
  crewId: string | null
  name: string | null
  emblemSeed: string | null
  /** Your own side: a count and you alone — never which crewmate revealed or kept private. */
  mine: boolean
  /** How many on this side are shown to you (you included, on yours). */
  count: number
  /** Their side only; null on yours. */
  revealed: number | null
  keptPrivate: number | null
  /** Their side: each person. Yours: you alone. */
  people: BlendPerson[]
}

export interface Blend {
  blendId: string
  chatGroupId: string
  eventId: string
  closesAt: string
  sides: BlendSide[]
}

/** The ids a like or a Blend hands back. */
export interface BlendRef {
  blendId: string
  chatGroupId: string
}

/* -------------------------------------------------------------------------- */
/* What a refusal says                                                        */
/* -------------------------------------------------------------------------- */

type Refusal =
  | {
      error?: string | null
      errorCode?: string | null
      retryAfter?: number
      errors?: { message?: string }[]
    }
  | null
  | undefined

/** Where the refusal happened, which decides what "not found" means to the person. */
export type CrewSurface = 'create' | 'crew' | 'join' | 'card' | 'blend'

const GONE: Record<CrewSurface, string | null> = {
  // The one 404 on create is the server's own sentence ("You can only invite your friends…").
  create: null,
  crew: `${CREW_GONE_LINE}.`,
  join: 'That invite isn’t open any more.',
  card: 'That crew isn’t here any more.',
  blend: `${BLEND_CLOSED_LINE}.`,
}

/**
 * What to tell somebody a crew route refused.
 *
 * The crew routes speak to the person: "A crew has at most 12 people.",
 * "That's enough new crews for today — try again tomorrow.", "Your crew isn't
 * here yet — two of you need to be checked in." Each has a different fix, so
 * those words go through. Four answers are the app's own:
 *
 * - **`NOT_FOUND`** when the server only said "Crew not found" (or Blend,
 *   Event, User): it is the one answer for every "not yours", so it gets one
 *   plain line per surface and never a guess at the reason.
 * - **`CHAT_CLOSED`** in a Blend is the Blend closing.
 * - **`VALIDATION_FAILED`** names the field in `errors[]`; the top-level
 *   `error` is only "Validation failed".
 * - **The rate limiter's** "Too many requests" (it carries `retryAfter`; the
 *   crew cap's 429 does not, and says what to do).
 *
 * A server fault or a developer's string falls back to the screen's sentence.
 */
export function crewMessage(result: Refusal, surface: CrewSurface, fallback: string): string {
  const code = result?.errorCode ?? null
  const said = result?.error?.trim() ?? ''
  if (code === 'NOT_FOUND' && (!said || /not found\.?$/i.test(said))) return GONE[surface] ?? fallback
  if (code === 'CHAT_CLOSED' && surface === 'blend') return `${BLEND_CLOSED_LINE}.`
  if (code === 'VALIDATION_FAILED') return result?.errors?.find((e) => e.message?.trim())?.message?.trim() ?? fallback
  if (code === 'RATE_LIMITED' && result?.retryAfter) return 'Slow down — try again in a moment.'
  if (code === 'SERVER_ERROR' || !said) return fallback
  if (/^(HTTP \d|Invalid JSON)/.test(said)) return fallback
  return said
}

/**
 * Whether a room refusal means the room is over for you, and what to say.
 *
 * A Blend answers a closed room, a block across the sides and a member taken
 * out the same way — 404 to read, 403 to write, `CHAT_CLOSED` once its clock
 * runs out — and all of them are, from where you stand, the Blend closing. A
 * crew's room 404s once the crew dissolves. Anything else is not a closing
 * (a mute, a rate limit) and returns null.
 */
export function roomClosedLine(kind: 'crew' | 'blend', errorCode: string | null | undefined): string | null {
  if (kind === 'blend') {
    return errorCode === 'NOT_FOUND' ||
      errorCode === 'FORBIDDEN' ||
      errorCode === 'CHAT_CLOSED' ||
      errorCode === 'USER_BANNED'
      ? BLEND_CLOSED_LINE
      : null
  }
  if (errorCode === 'USER_BANNED') return CREW_REMOVED_LINE
  return errorCode === 'NOT_FOUND' ? CREW_GONE_LINE : null
}

/** The header's name for a room opened without one (from a push, say). */
export function defaultRoomName(kind: 'crew' | 'blend' | null): string {
  return kind === 'crew' ? 'Crew chat' : kind === 'blend' ? 'Your Blend' : 'Event chat'
}

/** A room kind from a route param, or null for an event's room. */
export function roomKindParam(value: unknown): 'crew' | 'blend' | null {
  return value === 'crew' || value === 'blend' ? value : null
}

/* -------------------------------------------------------------------------- */
/* Consent and anonymity                                                      */
/* -------------------------------------------------------------------------- */

export interface ConsentState {
  /** The person ticked the consent line. Off until they do. */
  consented: boolean
  keepMeAnonymous: boolean
}

export const NO_CONSENT: ConsentState = { consented: false, keepMeAnonymous: false }

/**
 * The consent half of a create or a join, or null until it is given.
 *
 * `revealConsent` is sent only as `true`, and only after the person agreed on
 * this screen: the server refuses the join without it, and a client that
 * defaulted it to `true` would have consented on their behalf.
 */
export function consentBody(state: ConsentState): { revealConsent: true; keepMeAnonymous: boolean } | null {
  return state.consented ? { revealConsent: true, keepMeAnonymous: state.keepMeAnonymous } : null
}

/** Characters as a person counts them, and as the server does (`[...text].length`). */
export const characters = (text: string): number => [...text].length

export interface CrewForm {
  name: string
  bio: string
  tags: string[]
  openToSolo: boolean
  inviteUserIds: string[]
}

export type CreateCrewBody = {
  name: string
  bio?: string
  tags: string[]
  openToSolo: boolean
  inviteUserIds: string[]
  revealConsent: true
  keepMeAnonymous: boolean
}

/**
 * The `POST /crews` body, or what is in the way of sending it.
 *
 * The lengths are checked here only so a person is told before a round trip;
 * the server checks them again on the folded text, and its sentence wins.
 */
export function createCrewBody(form: CrewForm, consent: ConsentState): CreateCrewBody | { problem: string } {
  const name = form.name.trim().replace(/\s+/g, ' ')
  const bio = form.bio.trim()
  if (characters(name) < CREW_NAME_MIN || characters(name) > CREW_NAME_MAX) {
    return { problem: `A crew name is ${CREW_NAME_MIN}–${CREW_NAME_MAX} characters.` }
  }
  if (characters(bio) > CREW_BIO_MAX) return { problem: `A crew bio is at most ${CREW_BIO_MAX} characters.` }
  if (form.tags.length > CREW_MAX_TAGS) return { problem: `Pick up to ${CREW_MAX_TAGS} tags.` }
  // A crew is friends who go out together: one person with nobody asked is not one.
  if (form.inviteUserIds.length === 0) return { problem: 'Pick at least one friend to ask.' }
  if (form.inviteUserIds.length > CREW_MAX_MEMBERS - 1) {
    return { problem: `A crew has at most ${CREW_MAX_MEMBERS} people.` }
  }
  const agreed = consentBody(consent)
  if (!agreed) return { problem: 'Agree to how crew reveals work to make the crew.' }
  return {
    name,
    ...(bio ? { bio } : {}),
    tags: form.tags,
    openToSolo: form.openToSolo,
    inviteUserIds: form.inviteUserIds,
    ...agreed,
  }
}

/** Toggle a tag, holding the cap: a fourth tap does nothing rather than drop the first. */
export function toggleTag(tags: readonly string[], slug: string): string[] {
  if (tags.includes(slug)) return tags.filter((t) => t !== slug)
  return tags.length >= CREW_MAX_TAGS ? [...tags] : [...tags, slug]
}

/* -------------------------------------------------------------------------- */
/* Lines                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * What an invite says it did. `invited` is how many you asked for, whatever
 * the server did with each, so this says "asked" — never "invited Rohan",
 * never "2 of 3 invited".
 */
export function invitedLine(invited: number): string | null {
  if (!Number.isFinite(invited) || invited <= 0) return null
  return invited === 1 ? 'Asked 1 friend' : `Asked ${invited} friends`
}

/** After "We're here": the first tap tells them, the second tells nobody and says so. */
export function hereLine(result: { repeated: boolean }): string {
  return result.repeated ? 'Your crew already knows you’re here tonight' : 'Told your crew you’re here 👋'
}

/** "Crew of 4". A crew of one is waiting for its friends — the server keeps it while invites are open. */
export function sizeLine(size: number): string {
  return size <= 1 ? 'Crew of 1 until a friend accepts' : `Crew of ${size}`
}

/** "Here now · 3 of 5". */
export function hereNowLine(card: Pick<CrewCard, 'presentCount' | 'size'>): string {
  return `Here now · ${card.presentCount} of ${card.size}`
}

/** "4 revealed · 1 keeps it private", or null before anybody revealed. */
export function revealCountLine(revealed: number, keptPrivate: number): string | null {
  if (revealed <= 0) return null
  if (keptPrivate <= 0) return `${revealed} revealed`
  return `${revealed} revealed · ${keptPrivate} ${keptPrivate === 1 ? 'keeps' : 'keep'} it private`
}

/** "Closes in 9h", "Closes in 25m", "Closing now". */
export function closesLine(closesAt: string, now: number = Date.now()): string | null {
  const at = Date.parse(closesAt)
  if (!Number.isFinite(at)) return null
  const minutes = Math.round((at - now) / 60_000)
  if (minutes <= 0) return 'Closing now'
  return minutes < 60 ? `Closes in ${minutes}m` : `Closes in ${Math.round(minutes / 60)}h`
}

/* -------------------------------------------------------------------------- */
/* A side of a Blend: the menagerie, then the collage                         */
/* -------------------------------------------------------------------------- */

/** How many revealed faces the collage draws before "+N". */
export const COLLAGE_MAX = 4

export interface SideView {
  /**
   * Theirs: `menagerie` until somebody on it is revealed, then `collage`.
   * Yours: `mine` — a count line and you, never per-person tiles: a tile for
   * the crewmate who kept anonymous would tell the crew who did.
   */
  mode: 'menagerie' | 'collage' | 'mine'
  /** Revealed people, at most `COLLAGE_MAX`, drawn as photos with first names. */
  faces: BlendPerson[]
  /** Revealed people beyond the collage: "+3". */
  more: number
  /** Everyone not revealed — anonymous, or kept private — as tonight's pseudonym tiles. */
  tiles: BlendPerson[]
  /** "4 revealed · 1 keeps it private", for a crew; null for one person or before a reveal. */
  countLine: string | null
  /** The side's name: the crew's, or the person's (their first name once revealed, else pseudonym). */
  title: string
}

/**
 * One side of a Blend as its card draws it.
 *
 * Anonymous, it is a menagerie: tonight's pseudonym animals, one per person.
 * Once its crew reveals, the revealed members become a collage of faces and
 * first names, and **anybody who kept themselves anonymous stays a tile** —
 * never a blank, never a face. "Revealed" is the server's `name`, nothing the
 * app infers: a photo without a name is not a reveal.
 */
export function sideView(side: BlendSide): SideView {
  if (side.mine) {
    const others = Math.max(0, side.count - 1)
    return {
      mode: 'mine',
      faces: [],
      more: 0,
      tiles: [],
      countLine:
        side.kind === 'crew' ? (others === 0 ? 'Just you here' : `You and ${others} of your crew here`) : null,
      title: side.kind === 'crew' ? side.name || 'Your crew' : 'You',
    }
  }
  const revealed = side.people.filter((p) => !!p.name)
  const tiles = side.people.filter((p) => !p.name)
  const first = side.people[0]
  return {
    mode: revealed.length > 0 ? 'collage' : 'menagerie',
    faces: revealed.slice(0, COLLAGE_MAX),
    more: Math.max(0, revealed.length - COLLAGE_MAX),
    tiles,
    countLine: side.kind === 'crew' ? revealCountLine(side.revealed ?? 0, side.keptPrivate ?? 0) : null,
    title: side.kind === 'crew' ? side.name || 'A crew' : first?.name || first?.pseudonym || 'Someone',
  }
}

/** Your side and theirs: the server marks yours (`mine`); your own id is the fallback. */
export function blendSides(blend: Blend, myId: string | null | undefined): { mine: BlendSide | null; theirs: BlendSide | null } {
  const mine =
    blend.sides.find((s) => s.mine) ?? blend.sides.find((s) => s.people.some((p) => p.userId === myId)) ?? null
  const theirs = blend.sides.find((s) => s !== mine) ?? null
  return { mine, theirs }
}

/** "Blend with Crew Nebula" — the Banter row and the room's header. */
export function blendTitle(blend: Blend, myId: string | null | undefined): string {
  const { theirs } = blendSides(blend, myId)
  return theirs ? `Blend with ${sideView(theirs).title}` : 'Your Blend'
}

/* -------------------------------------------------------------------------- */
/* Crew and Blend rooms in the Banter                                         */
/* -------------------------------------------------------------------------- */

/** A crew's chat or an open Blend's room, as `GET /chat/groups` lists it in `rooms`. */
export interface CrewRoomRow {
  id: string
  kind: 'crew' | 'blend'
  name: string
  crewId: string | null
  blendId: string | null
  /** A Blend's clock; null for a crew's chat. */
  closesAt: string | null
  unreadCount: number
  lastMessageAt: string | null
  /** Named as the room names people: a crewmate's first name, a Blend's pseudonyms. */
  lastMessage: { content: string; user: { id: string; name: string | null } } | null
  mute: unknown
}

/**
 * The crew and Blend rooms out of a `GET /chat/groups` answer (`rooms`, page 1
 * only). Anything that is not a crew's or a Blend's room is left out: a row
 * opened as the wrong kind of room is the defect this list exists to avoid.
 */
export function crewRoomsFrom(payload: unknown): CrewRoomRow[] {
  const rooms = (payload as { rooms?: unknown } | null)?.rooms
  if (!Array.isArray(rooms)) return []
  return rooms.flatMap((r: Record<string, any>) => {
    const kind = roomKindParam(r?.kind)
    if (!kind || typeof r.id !== 'string') return []
    const last = r.lastMessage
    return [
      {
        id: r.id,
        kind,
        name: typeof r.name === 'string' ? r.name : kind === 'crew' ? 'Crew chat' : 'Blend',
        crewId: typeof r.crewId === 'string' ? r.crewId : null,
        blendId: typeof r.blendId === 'string' ? r.blendId : null,
        closesAt: typeof r.closesAt === 'string' ? r.closesAt : null,
        unreadCount: Number(r.unreadCount) || 0,
        lastMessageAt: typeof r.lastMessageAt === 'string' ? r.lastMessageAt : null,
        lastMessage:
          last && typeof last.content === 'string'
            ? { content: last.content, user: { id: String(last.user?.id ?? ''), name: last.user?.name ?? null } }
            : null,
        mute: r.mute,
      },
    ]
  })
}

/** "Blend · Lot S9 × Nebula S9" — a Blend says what it is in the list; a crew's chat is its name. */
export function crewRoomTitle(row: Pick<CrewRoomRow, 'kind' | 'name'>): string {
  return row.kind === 'blend' ? `Blend · ${row.name}` : row.name
}

/* -------------------------------------------------------------------------- */
/* Invites                                                                    */
/* -------------------------------------------------------------------------- */

const firstWord = (name: string) => name.trim().split(/\s+/)[0] ?? ''

/**
 * Your friends who could be asked into this crew.
 *
 * The crew names its members by their room handles, never their account
 * ids, so a friend already in it is found by what the server does say:
 * `isFriend`, their first name and their photo. A friend is left out only
 * when exactly one of your friends matches that member — two friends with
 * the same first name and no photo stay in the list (the server skips the
 * one already in, without a word), rather than hiding a friend who is not.
 */
export function friendsToInvite<F extends { userId: string; name: string; photo: string | null }>(
  friends: readonly F[],
  members: readonly Pick<CrewMember, 'isFriend' | 'name' | 'photo'>[]
): F[] {
  const inCrew = new Set<string>()
  for (const m of members) {
    if (!m.isFriend) continue
    const matches = friends.filter((f) => firstWord(f.name) === firstWord(m.name) && (f.photo ?? null) === (m.photo ?? null))
    if (matches.length === 1) inCrew.add(matches[0].userId)
  }
  return friends.filter((f) => !inCrew.has(f.userId))
}

/**
 * Invites still worth showing. One that answered 404 to an accept is gone
 * (lapsed, withdrawn, its crew dissolved) and stays off the screen for the
 * session, even if a cached list still has it.
 */
export function visibleInvites<I extends { crewId: string }>(invites: readonly I[], gone: ReadonlySet<string>): I[] {
  return invites.filter((i) => !gone.has(i.crewId))
}

/* -------------------------------------------------------------------------- */
/* The Crews view: paging and liking                                          */
/* -------------------------------------------------------------------------- */

/**
 * A page of crew cards onto what is loaded. Offset 0 starts over; a later
 * page appends, dropping any card already shown — between two pages a crew
 * can move up the list as more of it arrives, and would otherwise draw twice.
 */
export function mergeCrewPage(loaded: readonly CrewCard[], page: readonly CrewCard[], offset: number): CrewCard[] {
  if (offset === 0) return [...page]
  const seen = new Set(loaded.map((c) => c.crewId))
  return [...loaded, ...page.filter((c) => !seen.has(c.crewId))]
}

/** Where the next page starts: what the server has already given, not what survived the dedupe. */
export function nextCrewOffset(offset: number, page: readonly CrewCard[]): number {
  return offset + page.length
}

/** Crews larger than this match crews only, never one person (the server's `CREW.MAX_SOLO_MATCH`). */
export const CREW_MAX_SOLO_MATCH = 6

/**
 * Your crews here that may like one person on their behalf: "Room for one
 * more" on, and 6 or fewer. The server refuses the rest with a 403 about your
 * own crew, so offering them the button only offers a refusal.
 */
export function crewsThatMayLikePeople(
  here: CrewsAtEvent['myCrews'],
  mine: readonly Pick<Crew, 'crewId' | 'openToSolo' | 'size'>[]
): CrewsAtEvent['myCrews'] {
  return here.filter((c) => {
    const crew = mine.find((m) => m.crewId === c.crewId)
    return !!crew && crew.openToSolo && crew.size <= CREW_MAX_SOLO_MATCH
  })
}

/**
 * Who a like of a crew is sent as. With no crew of yours here it is you
 * (crew ↔ person, which needs "Open to joining a crew tonight"); with one,
 * that crew; with several, the person chooses — the app never picks a crew
 * for somebody, because the crew chat says who liked on its behalf.
 */
export function likeAs(myCrews: CrewsAtEvent['myCrews']): { as: 'me' } | { as: 'crew'; crewId: string } | { as: 'choose' } {
  if (myCrews.length === 0) return { as: 'me' }
  if (myCrews.length === 1) return { as: 'crew', crewId: myCrews[0].crewId }
  return { as: 'choose' }
}

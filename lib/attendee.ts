import type { Badge, Overlap } from './aboutYou'

/**
 * One person on a room's roster, as the app holds them.
 *
 * Moved out of `components/screens/MatchScreen.tsx` when the Grid was replaced
 * by the Blend'n screen; `useRoom` turns these into `RoomPerson`s.
 */
export interface AttendeeProfile {
  user_id: string
  name?: string
  /**
   * Whole years, derived server-side. Never a birth date.
   *
   * Newly on the roster: it was already public on `/profiles/[userId]` for any
   * authenticated caller, so a card could not say what the profile one tap
   * away said anyway.
   */
  age?: number
  /*
   * `bio` used to be declared here and the roster has never sent it --
   * `MatchCard` carries eight fields and it is not among them. Declaring it
   * made the card look richer than it could ever be, and the age in its own
   * title never rendered for the same reason until now.
   */
  /** The *shared* interests, named, as the server computed them. Not their whole list. */
  interests?: string[]
  /** The shared subset only — "Both here to network". Never their full intent. */
  sharedIntents?: string[]
  /**
   * You are both in this field.
   *
   * `lib/matching.ts` has always computed it — it moves the ranking — and never
   * returned it. "Design" under a name is an attribute; "You both work in
   * Design" is a reason to walk over, from the same fact.
   */
  sharedWorkField?: boolean
  /** Nights you were both at, before this one. 0 when suppressed. */
  sharedEvents?: number
  /** Future events you are both going to, excluding this one. */
  sharedPlans?: number
  /** A label like "Design". Null in rooms under 8, where it would identify. */
  workField?: string | null
  profile_photos?: string[]
  /**
   * Only ever set by the socket, for somebody who walked in while you were
   * looking. The REST roster does not carry it — `MatchCard` has no such field.
   */
  last_seen?: string
  /** When they checked in here, from the deck (`MatchCard.checkInTime`, SCRUM-1042); null to a host. */
  checkInTime?: string | null
  /** Still physically in the room, per presence. */
  insideNow?: boolean
  /** You waved at them in this room (the deck's `youWaved`). */
  youWaved?: boolean
  /** They waved at you in this room, yours to answer (the deck's `wavedAtYou`). */
  wavedAtYou?: boolean
  /** Matching v2's shared lines, sign chip and badges — as the server budgeted them. */
  overlaps?: Overlap[]
  sign?: string | null
  badges?: Badge[]
  /** Flow 5 P-A: their answer to tonight's question, as the deck sent it. Never typed by this phone. */
  tonightAnswer?: string | null
  /** Flow 5 P-A: why they are here at a work-lens event, as the deck sent it. */
  workIntent?: string | null
}

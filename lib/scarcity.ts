/**
 * When an event is genuinely running out of room, and what to say about it.
 *
 * ## Why this is not "LIMITED ACCESS"
 *
 * The frame draws a "LIMITED ACCESS" pill on every event. Nothing backs that.
 * The only capacity question an organiser is asked is `max_capacity`, and its
 * own placeholder reads "Unlimited if blank" — it is a room's safe occupancy,
 * not a statement about exclusivity. Treating "the organiser filled this in" as
 * "this is hard to get into" is the interface inventing a fact, and it would
 * fire on the 500-capacity warehouse night as readily as the 20-seat dinner.
 *
 * What *is* true and worth saying is that a specific event is nearly full. That
 * needs no new question for the organiser: both numbers already exist.
 *
 * ## The thresholds
 *
 * Two, and an event has to pass **either**:
 *
 * - **under 20% remaining** — proportional, so it means the same thing on a
 *   30-person dinner and a 400-person night;
 * - **10 or fewer places left** — absolute, because "8 left" is urgent whatever
 *   the denominator, and on a 400-capacity event 8 left is 2% and would have
 *   been caught by the first rule anyway. The pair covers the small event that
 *   is proportionally full but numerically roomy, and the large one that is the
 *   other way round.
 *
 * Silence is the default. A pill that appears on most events is furniture, and
 * furniture is ignored precisely when it finally means something.
 */

/** Below this many places remaining, always urgent. */
const ABSOLUTE_THRESHOLD = 10
/** Below this share of capacity remaining, urgent. */
const PROPORTION_THRESHOLD = 0.2

export interface ScarcityInput {
  /** 0 or absent means uncapped. */
  maxCapacity?: number | null
  /** How many places are already taken — attendance, so zero before doors. */
  currentCapacity?: number | null
  /**
   * How many have said they are going. Before doors this is the number that
   * fills the room: the server waitlists the next RSVP once it reaches the
   * cap, and a pill reading "1 SPOT LEFT" beside a Going button that would
   * waitlist you is the lie this field exists to prevent. Driven on iOS with
   * a one-seat event.
   */
  goingCount?: number | null
}

/**
 * The pill's label, or `null` when there is nothing honest to say.
 *
 * Returns `null` rather than an empty string so a caller cannot render a pill
 * containing nothing, which is a bordered gap that looks like a failed load.
 */
export function scarcityLabel({ maxCapacity, currentCapacity, goingCount }: ScarcityInput): string | null {
  const max = Number(maxCapacity) || 0
  // Uncapped: the overwhelmingly common case, and the one the frame gets wrong.
  if (max <= 0) return null

  // Whichever is larger: RSVPs fill the room before doors, bodies after.
  const taken = Math.max(Number(currentCapacity) || 0, Number(goingCount) || 0, 0)
  const left = max - taken

  // Over capacity is possible — check-in does not refuse, by design, see
  // blendn-admin/docs/CHECKIN.md — so this clamps rather than printing "-3 SPOTS LEFT".
  if (left <= 0) return 'FULL'

  const urgent = left <= ABSOLUTE_THRESHOLD || left / max < PROPORTION_THRESHOLD
  if (!urgent) return null

  // Uppercased in the string rather than by `textTransform`, so the pill's
  // letter-spacing lands on the real glyphs — the same rule as EMBER_TYPE.
  return left === 1 ? '1 SPOT LEFT' : `${left} SPOTS LEFT`
}

/**
 * What the organiser said about the door.
 *
 * Mirrors `events.door_policy` in the API. `open` is the default and almost
 * every event, and it draws nothing — leaving the pill to say something true
 * about capacity instead.
 */
export type DoorPolicy = 'open' | 'guest_list' | 'members_only' | 'invite_only'

const DOOR_LABELS: Record<Exclude<DoorPolicy, 'open'>, string> = {
  guest_list: 'GUEST LIST ONLY',
  members_only: 'MEMBERS ONLY',
  invite_only: 'INVITE ONLY',
}

/**
 * The hero pill: what the organiser set, or how full it is, or nothing.
 *
 * ## The order is deliberate
 *
 * A door policy outranks a spot count because it is a *condition of entry* and
 * the count is only a nudge. "Three left" beside a guest-list door would tell
 * someone to hurry towards a night they cannot get into, which is worse than
 * saying nothing.
 *
 * ## Neither is enforced here
 *
 * The label is the organiser's description of their own door, exactly like
 * `min_age`, and nothing in the app or the API blocks a join on it. This
 * function must never be read as a permission check — it decides what a badge
 * says.
 */
export function heroPillLabel({
  doorPolicy,
  maxCapacity,
  currentCapacity,
  goingCount,
}: ScarcityInput & { doorPolicy?: DoorPolicy | null }): string | null {
  if (doorPolicy && doorPolicy !== 'open') {
    // Unknown values fall through to capacity rather than rendering a raw enum
    // — an API that grows a case should not print `members_only` at anybody.
    const label = DOOR_LABELS[doorPolicy as Exclude<DoorPolicy, 'open'>]
    if (label) return label
  }
  return scarcityLabel({ maxCapacity, currentCapacity, goingCount })
}

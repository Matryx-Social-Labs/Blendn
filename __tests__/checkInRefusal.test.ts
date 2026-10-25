import { checkInRefusal, CHECK_IN_CODES } from "../lib/checkInRefusal"

/**
 * The refusal a person sees when check-in fails, and the one action that helps.
 *
 * The screen used to classify these by substring-matching the server's prose.
 * The server's out-of-range sentence is "You're about 45m outside the check-in
 * area" and its code is `OUT_OF_RANGE`; the client looked for "too far" and
 * "TOO_FAR", so the branch — and the Open Maps button on it — never ran.
 *
 * These are the assertions that would have caught it, and the first one is
 * written against the server's *real* sentence rather than a convenient one.
 */
const REAL_OUT_OF_RANGE =
  "You’re about 45m outside the check-in area. Move closer to the venue and try again."

describe("a refused check-in", () => {
  it("offers directions when the person is in the wrong place", () => {
    const r = checkInRefusal(CHECK_IN_CODES.OUT_OF_RANGE, REAL_OUT_OF_RANGE)
    expect(r.offerDirections).toBe(true)
  })

  it("passes the server’s shortfall through instead of recomputing it", () => {
    /*
     * The dead branch built its own sentence from `distance_meters` and
     * `required_radius`, neither of which the server sends — so it would have
     * said "0m away" to somebody 45m out. The number belongs to the server.
     */
    const r = checkInRefusal(CHECK_IN_CODES.OUT_OF_RANGE, REAL_OUT_OF_RANGE)
    expect(r.message).toBe(REAL_OUT_OF_RANGE)
    expect(r.message).toContain("45m")
  })

  it("does not match the old prose, which is the bug restated", () => {
    /*
     * Pinning the absence: if somebody reintroduces substring matching, the
     * server's real sentence contains neither of the strings it looked for.
     */
    expect(REAL_OUT_OF_RANGE.includes("too far")).toBe(false)
    expect(REAL_OUT_OF_RANGE.includes("TOO_FAR")).toBe(false)
  })

  it("offers no map for refusals a map cannot fix", () => {
    // Too early, too young, over, or full: a map is a button that cannot work.
    for (const code of [
      CHECK_IN_CODES.EVENT_NOT_STARTED,
      CHECK_IN_CODES.EVENT_ENDED,
      CHECK_IN_CODES.AGE_RESTRICTED,
      CHECK_IN_CODES.EVENT_FULL,
      CHECK_IN_CODES.ALREADY_CHECKED_IN,
    ]) {
      expect(checkInRefusal(code, "whatever the server said").offerDirections).toBe(false)
    }
  })

  it("never gives a code it knows the unknown-code title", () => {
    /*
     * Distinctness alone was not enough, and the control proved it: collapsing
     * OUT_OF_RANGE's title to "Check-in failed" left four still-distinct
     * titles, so the test stayed green while a recognised refusal presented
     * itself as an unrecognised one. The property that matters is that a known
     * code never falls back — not that the fallbacks differ.
     */
    const generic = checkInRefusal("A_CODE_THIS_BUILD_HAS_NEVER_SEEN", "m").title
    for (const code of Object.values(CHECK_IN_CODES)) {
      expect(checkInRefusal(code, "m").title).not.toBe(generic)
    }
  })

  it("still shows the server’s sentence when the code is unknown or absent", () => {
    /*
     * One refusal — "Event is at full capacity" — ships with no code at all,
     * and the server's sentence is always more specific than a generic one.
     */
    expect(checkInRefusal(undefined, "Event is at full capacity").message).toBe(
      "Event is at full capacity"
    )
    expect(checkInRefusal("SOMETHING_NEW", "A reason from a newer server").message).toBe(
      "A reason from a newer server"
    )
  })

  it("falls back to a sentence when the server sends none", () => {
    expect(checkInRefusal(undefined, undefined).message).toMatch(/could not verify/i)
    expect(checkInRefusal(undefined, "   ").message).toMatch(/could not verify/i)
  })
})

describe("the screen consults the code, not the sentence", () => {
  const { readFileSync } = require("fs")
  const { join } = require("path")

  /*
   * Comments stripped first. Both the module and the screen now *describe* the
   * old substring matching in prose, so an assertion about the absence of
   * `.includes(` would match its own explanation and pass for ever. That exact
   * vacuous guard has been shipped three times in the sibling repo.
   */
  const read = (file: string) =>
    readFileSync(join(__dirname, "..", file), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "")
  const helper = read("lib/checkIn.ts")

  it("dispatches the refusal on errorCode", () => {
    expect(helper).toContain("checkInRefusal(reasonOf(result)")
  })

  it("classifies no refusal by matching the server’s prose", () => {
    // The producer, not the consumer: `.includes(` on an error string at all.
    for (const file of ["lib/checkIn.ts", "lib/useCheckInFlow.ts", "components/screens/EventDetailScreen.tsx", "app/(tabs)/events.tsx"]) {
      expect(read(file)).not.toMatch(/result\.error\?\.includes\(/)
    }
  })

  // Every door's refusal tray lives in `lib/useCheckInFlow.ts`; the screen
  // supplies the map through `onOpenMaps`.
  it("keeps Open Maps behind the refusal that a map can fix", () => {
    expect(read("lib/useCheckInFlow.ts")).toContain("refusal.offerDirections")
  })

  it("the pass gives the shared flow its map", () => {
    // Every check-in is the Blend'n pass's now (the event page opens it): Open Maps goes to the event.
    expect(read("components/blendn/BlendnScreen.tsx")).toContain("onOpenMaps: () => insideEvent && router.push({ pathname: '/event/[id]'")
  })
})

describe('the refusals with a fix (Flow 15 15.22)', () => {
  it('an unfinished profile and an age that is not on file carry a fix; an age that is known and too low does not', () => {
    expect(checkInRefusal('FORBIDDEN', 'Finish setting up your profile first.').fix).toEqual({ kind: 'finish_profile', label: 'Finish profile' })
    expect(checkInRefusal('PROFILE_INCOMPLETE', undefined).fix?.kind).toBe('finish_profile')
    expect(checkInRefusal('AGE_RESTRICTED', 'This event is 18+. Add your age to your profile to check in.').fix).toEqual({ kind: 'add_age', label: 'Add your age' })
    expect(checkInRefusal('AGE_RESTRICTED', 'Blend’n is for people 18 and over. Add your date of birth to your profile to go live.').fix?.kind).toBe('add_age')
    expect(checkInRefusal('AGE_UNKNOWN', undefined).fix?.kind).toBe('add_age')
    expect(checkInRefusal('AGE_RESTRICTED', 'This event is 21+.').fix).toBeUndefined()
  })

  it('the words are the frame’s, not the server’s: the client owns what is offered', () => {
    expect(checkInRefusal('FORBIDDEN', 'x')).toMatchObject({
      title: 'Finish your profile first',
      message: 'People in the room see your name or a creature. Add a name and a photo, then hold to check in.',
    })
    expect(checkInRefusal('AGE_UNKNOWN', 'x')).toMatchObject({
      title: 'Add your age to check in',
      message: 'Events on Blend’n are 18+. Add your date of birth once; nobody else ever sees it.',
    })
  })
})

describe('eventLoadFailure (Flow 15 #9, #10)', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { eventLoadFailure } = require('../lib/eventLinkRefusal') as typeof import('../lib/eventLinkRefusal')

  it('tells a gone event, a minor, an unknown age, an unfinished profile, a broken link and a dropped connection apart', () => {
    expect(eventLoadFailure({ errorCode: 'NOT_FOUND' })).toBe('notFound')
    expect(eventLoadFailure({ error: 'Event not found' })).toBe('notFound')
    expect(eventLoadFailure({ errorCode: 'AGE_RESTRICTED', error: 'This event is 21+.' })).toBe('minor')
    expect(eventLoadFailure({ errorCode: 'AGE_RESTRICTED', error: 'This event is 18+. Add your age to your profile to check in.' })).toBe('age_unknown')
    expect(eventLoadFailure({ errorCode: 'AGE_UNKNOWN' })).toBe('age_unknown')
    expect(eventLoadFailure({ errorCode: 'FORBIDDEN' })).toBe('profile')
    expect(eventLoadFailure({ errorCode: 'PROFILE_INCOMPLETE' })).toBe('profile')
    expect(eventLoadFailure({ errorCode: 'VALIDATION_FAILED' })).toBe('broken')
    expect(eventLoadFailure({ error: 'No internet connection.' })).toBe('network')
    expect(eventLoadFailure({})).toBe('network')
  })
})

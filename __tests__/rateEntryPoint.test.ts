import { readFileSync } from "fs"
import { join } from "path"

/**
 * The rating screen has a way in.
 *
 * `app/rate/[eventId].tsx` has been built, tested and registered since it was
 * written, and reachable from nothing. `PLACEHOLDER_SCREENS.md` says so in as
 * many words — "**Reached from:** nothing yet. Needs an entry point after an
 * event ends" — and `going.tsx` names the same gap from the other side.
 *
 * A peer rating is the early-warning half of the safety model: someone rated
 * badly by several people who actually met them, before anyone files a report.
 * Every reader of that signal was built on the server. Nothing could produce
 * one, because no screen could reach the form.
 *
 * Comments stripped: both files now explain the entry point in prose that names
 * the route.
 */
const read = (...p: string[]) =>
  readFileSync(join(__dirname, "..", ...p), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")

const DETAIL = read("components", "screens", "EventDetailScreen.tsx")
const CTA = read("components", "scene", "SceneSections.tsx")

/*
 * The `ctaState` expression, isolated.
 *
 * The first version of this suite asserted that `isEnded && attended` appeared
 * *somewhere in the file*, and three of four controls passed against it: the
 * phrase also occurs in `primaryActionPress` and `primaryActionDisabled`, so
 * mutating the decision that actually chooses the button left it green. Pin the
 * producer, not a string that happens to be nearby.
 */
const CTA_STATE = (() => {
  const at = DETAIL.indexOf("const ctaState: SceneCTAState")
  return at === -1 ? "" : DETAIL.slice(at, DETAIL.indexOf("\n\n", at))
})()

describe("the entry point to peer rating", () => {
  it("exists at all", () => {
    expect(DETAIL).toContain("'/rate/[eventId]'")
  })

  it("only appears after the event has ended", () => {
    /*
     * `PLACEHOLDER_SCREENS.md`: "Only after the event ends — during the night a
     * rating is leverage; afterwards it is reflection."
     */
    expect(CTA_STATE).toMatch(/^const ctaState: SceneCTAState = isEnded/)
  })

  it("only appears to somebody who was actually there", () => {
    /*
     * And `attended` is deliberately not `checked_in`. That goes false at
     * checkout, including the automatic one, so by the time an event ends it is
     * false for almost everybody who came — gating on it would hide the control
     * from its entire audience.
     */
    expect(DETAIL).toMatch(/const attended = !!checkInStatus\?\.status/)
    /*
     * The *ended* branch specifically. `isCheckedIn` appears legitimately
     * further down the same expression — it is what selects "You're in" — so
     * asserting it was absent from the whole thing was simply wrong, and the
     * first version of this test failed for that reason rather than finding
     * anything.
     */
    expect(CTA_STATE).toMatch(/isEnded\s*\n?\s*\?\s*\(attended \? 'rate' : 'ended'\)/)
  })

  it("reads the status the server was already sending, on every path that fills it", () => {
    /*
     * Two fetch paths populate `checkInStatus` — the cached read and the live
     * one — and a control that removed only the first still passed, because the
     * assertion merely looked for the string. Both must read it or the button
     * appears or vanishes depending on which path ran.
     */
    const reads = DETAIL.match(/status: d\.userStatus\.checkInStatus/g) ?? []
    const writes = DETAIL.match(/setCheckInStatus\(\{\s*\n\s*success: true,\s*\n\s*checked_in: d\.userStatus/g) ?? []
    expect(reads.length).toBe(writes.length)
    expect(reads.length).toBeGreaterThan(1)
  })

  it("is a live control, not the disabled ended one", () => {
    expect(CTA).toContain("rate: 'Rate the people you met'")
    // SceneCTA disables `ended` alone; `rate` must not be swept in with it.
    expect(CTA).toMatch(/const disabled = state === 'ended'/)
    expect(DETAIL).toMatch(/isEnded && attended \? false/)
  })
})

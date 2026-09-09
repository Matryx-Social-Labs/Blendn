import { readFileSync } from "fs"
import { join } from "path"

/**
 * You can report the event itself.
 *
 * `event_reports` existed with zero writers and zero readers, so somebody
 * looking at an unsafe venue or a listing that reads as a lure could report a
 * *person* and a *message* — but not the thing they were being asked to
 * physically turn up to. In a product whose stated difference from an anonymous
 * board is that somebody is accountable for the room, that was the gap.
 */
const read = (...p: string[]) =>
  readFileSync(join(__dirname, "..", ...p), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")

const SAFETY = read("lib", "safetyUtils.ts")
const DETAIL = read("components", "screens", "EventDetailScreen.tsx")

describe("reporting an event", () => {
  it("is offered from the event itself", () => {
    /*
     * The *call*, not the import. This asserted `toContain(...)` and passed
     * while the control it names did not exist — the import line alone
     * satisfied it. The same mistake was in the edit that added the button:
     * it reported success on the strength of the import it had just written.
     */
    expect(DETAIL).toMatch(/onPress=\{\(\) => showEventReportOptions\(/)
  })

  it("asks reasons that are about an event, not about a person", () => {
    /*
     * `showReportOptions` offers "Fake Profile" and "Inappropriate Photos",
     * neither of which means anything about a listing — and omits the three
     * the server's route names: unsafe venue, misleading listing, dangerous
     * organiser.
     */
    const block = SAFETY.slice(SAFETY.indexOf("showEventReportOptions"))
    for (const reason of ["misleading_listing", "unsafe_venue", "organiser_conduct"]) {
      expect(block).toContain(reason)
    }
    expect(block).not.toContain("fake_profile")
    expect(block).not.toContain("inappropriate_photos")
  })

  it("separates a wrong listing from a deceitful one", () => {
    /*
     * A curated event is added by somebody who never stood at the venue, so
     * "wrong" and "written to deceive" are different failures — and a moderator
     * needs to tell them apart before deciding whether the organiser is the
     * problem or the pin is.
     */
    expect(SAFETY).toContain("not_real")
    expect(SAFETY).toContain("misleading_listing")
  })

  it("does not require a check-in", () => {
    /*
     * Matching the server, deliberately. Two of the three reasons are visible
     * from the listing, and requiring attendance would restrict reporting to
     * people who had already taken the risk.
     */
    const detailBlock = DETAIL.slice(
      DETAIL.indexOf("showEventReportOptions") - 400,
      DETAIL.indexOf("showEventReportOptions") + 200
    )
    expect(detailBlock).not.toMatch(/isCheckedIn|attended|checkInStatus/)
  })

  it("promises a review, never an outcome", () => {
    /*
     * A human reads it and may decide the event is fine. Copy implying removal
     * would make every unchanged listing look like the report was ignored.
     */
    const block = SAFETY.slice(SAFETY.indexOf("showEventReportOptions"))
    expect(block).toContain("Our team will review it")
    expect(block).not.toMatch(/will be removed|has been removed|taken down/i)
  })

  it("is exported for a screen to call", () => {
    /*
     * Asserted on the source rather than by importing it: `safetyUtils` pulls
     * in `apiClient`, which reaches AsyncStorage, which has no native module
     * under `testEnvironment: node`. Mocking the storage layer to check that a
     * function is exported would be a lot of machinery for a weak assertion.
     */
    expect(SAFETY).toMatch(/export const showEventReportOptions = \(/)
  })
})

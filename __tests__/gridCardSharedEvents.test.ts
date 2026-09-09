import { gridCardBox } from "../lib/gridCardContent"

/**
 * The two lines the server has always sent and the card never drew.
 *
 * `sharedEvents` and `sharedPlans` have been on the wire since matching learned
 * to compute them (`lib/matches.ts` serialises both) and nothing read either —
 * so the strongest sentence the product can offer was invisible.
 *
 * The server's own docstrings rank them, and this suite pins that order:
 *
 *   sharedPlans   "the rarest thing a room can offer: a reason to talk that has
 *                  somewhere to go afterwards"
 *   sharedEvents  "the one line here that could not be written by a product
 *                  without verified attendance"
 */
describe("what the card says it has in common", () => {
  it("leads with a future event you are both going to", () => {
    const box = gridCardBox({ sharedPlans: 2, sharedEvents: 5, sharedInterests: ["Techno"] })
    expect(box?.label).toBe("ALSO GOING")
    expect(box?.value).toBe("You're both also going to 2 of the same events")
  })

  it("then the nights you were both at", () => {
    const box = gridCardBox({ sharedEvents: 3, sharedInterests: ["Techno"], sharedWorkField: true })
    expect(box?.label).toBe("SAME EVENTS")
    expect(box?.value).toBe("You've both been to 3 of the same events")
  })

  it("says 'also', because neither count includes tonight", () => {
    /*
     * Both exclude the event you are currently at. Without "also" the line
     * reads as describing tonight, which every person in the room already
     * knows and which would make the card say nothing.
     */
    expect(gridCardBox({ sharedPlans: 1 })?.value).toContain("also")
  })

  it("never claims you met", () => {
    /*
     * Being at the same event is not meeting — the entire product exists
     * because people do not approach. "Met before" would be a lie about the
     * one thing the app is trying to change.
     */
    for (const n of [1, 3, 9]) {
      const value = gridCardBox({ sharedEvents: n })?.value ?? ""
      expect(value).not.toMatch(/\bmet\b|\bmeeting\b|know each other/i)
    }
  })

  it("counts one correctly, in both lines", () => {
    expect(gridCardBox({ sharedEvents: 1 })?.value).toBe(
      "You've both been to the same event before"
    )
    expect(gridCardBox({ sharedPlans: 1 })?.value).toBe(
      "You're both also going to the same event"
    )
  })

  it("skips a suppressed count rather than saying zero", () => {
    /*
     * The server sends `0` for both when the room is below the disclosure
     * floor — the small-room case where "was at those nights" narrows to a
     * name. Zero and absent must be indistinguishable here.
     */
    const suppressed = gridCardBox({ sharedEvents: 0, sharedPlans: 0, sharedInterests: ["Techno"] })
    expect(suppressed?.label).toBe("SHARED INTERESTS")
    expect(gridCardBox({ sharedEvents: 0, sharedPlans: 0 })).toBeNull()
  })

  it("still says nothing when there is nothing true to say", () => {
    // Inventing a line to fill the space is worse than the space.
    expect(gridCardBox({})).toBeNull()
  })
})

import { readFileSync } from "fs"
import { join } from "path"

/**
 * REGRESSION — a withheld message is never shown as sent. Both surfaces.
 *
 * The server can accept a message and still withhold it: 200, `moderation_hidden:
 * true`, and the text nulled. A sender who is shown their own words while nobody
 * receives them has been accidentally shadowbanned, in a product whose entire
 * trust model rests on the room and the DM.
 *
 * The room was fixed for this. **DMs were not**, because deterministic screening
 * was added to them afterwards — so the fix and the new surface never met. This
 * file covers both together, because the defect was the gap between them, and a
 * test that watched only one would have stayed green through it.
 *
 * Comments stripped: both files now explain the bug in prose naming the field.
 */
const read = (...p: string[]) =>
  readFileSync(join(__dirname, "..", ...p), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")

const SURFACES: Array<[string, string]> = [
  ["the room", read("app", "chat", "[id].tsx")],
  ["a direct message", read("app", "private-chat", "[conversationId].tsx")],
]

describe.each(SURFACES)("%s", (_name, code) => {
  it("checks moderation_hidden before showing the message as sent", () => {
    expect(code).toContain("moderation_hidden")
  })

  it("stops before appending when the message was withheld", () => {
    // A `return` inside the hidden branch is what keeps it off the screen.
    expect(code).toMatch(/moderation_hidden[\s\S]{0,400}?\breturn\b/)
  })

  it("tells the sender it was not delivered", () => {
    expect(code).toMatch(/Not sent/)
  })

  it("keeps the server's sentence for a refusal instead of a generic one", () => {
    /*
     * `SPAM_BLOCKED` arrives with a reason. Both surfaces used to discard it —
     * one through a bare `catch {`, the other through an `else` that ignored
     * `result.error` — and the user retried forever against a wall that had
     * already explained itself.
     */
    expect(code).toMatch(/result\.error|error instanceof Error/)
  })

  it("does not swallow the error binding", () => {
    expect(code).not.toMatch(/\}\s*catch\s*\{/)
  })
})

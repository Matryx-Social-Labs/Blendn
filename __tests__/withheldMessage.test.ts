import { readFileSync } from "fs"
import { join } from "path"

/**
 * REGRESSION — a withheld message is never shown as sent. Both surfaces.
 *
 * The decision itself (sent, withheld, or failed with the server's sentence) is
 * `lib/sendOutcome.ts`, and `sendOutcome.test.ts` runs it. What this file keeps
 * is the wiring the screens are not rendered to prove: that the room and the DM
 * both ask it, and that a withheld message returns before anything is appended.
 * The DM was the surface that missed the fix once, so the two are checked
 * together.
 *
 * Comments stripped: both files explain the bug in prose naming the field.
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
  it("decides what became of the send through sendOutcome", () => {
    expect(code).toMatch(/sendOutcome\(result\)/)
  })

  it("stops before appending when the message was withheld", () => {
    // A `return` inside the withheld branch is what keeps it off the screen.
    expect(code).toMatch(/outcome\.kind === 'withheld'[\s\S]{0,400}?\breturn\b/)
  })

  it("does not swallow the error binding", () => {
    expect(code).not.toMatch(/\}\s*catch\s*\{/)
  })
})

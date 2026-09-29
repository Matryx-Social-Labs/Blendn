import { readFileSync } from "fs"
import { join } from "path"

/**
 * The announcement composer's wiring.
 *
 * "A second tap sends nothing" is `useSingleFlight`, run for real in
 * `useSingleFlight.test.tsx`. What is read as source here is what that test
 * cannot see: that the send control uses it, that it refuses an empty message,
 * and the server's length limit. The screen needs a login and an organiser, so
 * it is not rendered.
 *
 * Comments are stripped before every assertion: the screen explains the old
 * `Alert.prompt` in prose that contains the words.
 */
const src = readFileSync(
  join(__dirname, "..", "components", "screens", "EventDetailScreen.tsx"),
  "utf8"
)
const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")

describe("the announcement composer", () => {
  it("sends through the single-flight guard, and disables the control while it runs", () => {
    expect(code).toMatch(/pending: sendingAnnouncement\s*\} = useSingleFlight\(/)
    expect(code).toMatch(/disabled=\{[^}]*sendingAnnouncement[^}]*\}/)
  })

  it("refuses to send nothing", () => {
    expect(code).toMatch(/disabled=\{[^}]*!announcementText\.trim\(\)[^}]*\}/)
  })

  it("stops at the server's limit rather than failing the request", () => {
    // `announce/route.ts` refuses over 1,000 characters.
    expect(code).toContain("maxLength={1000}")
  })
})

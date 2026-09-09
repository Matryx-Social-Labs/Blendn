import { readFileSync } from "fs"
import { join } from "path"

/**
 * One announcement composer, on both platforms.
 *
 * iOS used `Alert.prompt` and Android a modal, for one action. The iOS half was
 * worse in three ways that all point the same direction: no character limit
 * against the server's 1,000, no pending state, and **no disable while
 * sending** — so a second tap broadcast a second announcement to everyone in
 * the room. A system dialog also cannot carry the app's design, which is the
 * reason the modal existed at all.
 *
 * Comments are stripped before every assertion. This file's own subject is the
 * absence of `Alert.prompt`, and the screen now explains that absence in prose
 * that contains the words — so an unstripped search would match the
 * explanation and pass for ever.
 */
const src = readFileSync(
  join(__dirname, "..", "components", "screens", "EventDetailScreen.tsx"),
  "utf8"
)
const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")

describe("the announcement composer", () => {
  it("does not prompt through a system dialog", () => {
    expect(code).not.toContain("Alert.prompt")
  })

  it("takes one path on both platforms", () => {
    // The organiser's button used to choose a handler by Platform.OS.
    expect(code).not.toMatch(/Platform\.OS === 'android' \?/)
    expect(code).toContain("onPress={openAnnouncementComposer}")
  })

  it("refuses to send twice, which the system dialog could not", () => {
    /*
     * The guard that matters. `sendingAnnouncement` is set before the request
     * and the send control reads it; without that, a second tap on a slow
     * network sends a second announcement to every attendee.
     */
    expect(code).toContain("setSendingAnnouncement(true)")
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

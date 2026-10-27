import { readFileSync } from "fs"
import { join } from "path"

/**
 * The room's reveal switch, and the way into the room's settings.
 *
 * Two gaps, one cause: `event-preferences/[eventId]` has been reachable from
 * nothing since it was written, and the capability gate lived only on it. So in
 * the room, somebody with no photo could turn reveal on and **nothing anybody
 * could see would change** — a switch that silently did nothing, which is the
 * dead-control fault the centre nav button was redesigned to remove.
 */
// The room is the Blend'n overlay now; `app/room.tsx` only opens it.
const code = readFileSync(join(__dirname, "..", "components", "blendn", "BlendnScreen.tsx"), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "")

describe("the reveal switch when there is nothing to reveal", () => {
  /*
   * The room's line is the ds VisibilityBanner (Flow 4 Room #08–#11); its
   * states and copy are pinned in roomVisibility.test.tsx. Here: the gate is
   * held where the reveal is sent, not only by which button is drawn.
   */
  const controls = readFileSync(join(__dirname, "..", "lib", "useRoomControls.ts"), "utf8")

  it("refuses to send a reveal that would change nothing", () => {
    expect(controls).toMatch(/if \(next && !readiness\.ok\) return/)
  })

  it("NEVER blocks going anonymous: the gate is one-way", () => {
    expect(controls).not.toMatch(/if \(!next && !readiness/)
  })

  it("draws the blocked state, with what is missing, when there is nothing to reveal", () => {
    expect(code).toContain("bannerState(controls.revealed, controls.listed, controls.readiness.ok)")
    expect(code).toContain("missing={controls.readiness.missing || undefined}")
    // Blocked's action is the profile, never a reveal.
    expect(code).toMatch(/visibility === 'blocked'\s*\?\s*\(\) => router\.push\('\/edit-profile'\)/)
  })
})

describe("the way into the room’s settings", () => {
  it("exists", () => {
    expect(code).toContain("'/event-preferences/[eventId]'")
  })

  it("is in the bar, not hung off the visibility banner", () => {
    /*
     * The visibility line states a rule: "the action is the opposite state,
     * not a settings link". A second tap target on that row would break it and
     * put two controls for one concept in one line.
     */
    const banner = code.slice(code.indexOf("<VisibilityBanner"), code.indexOf("testID=\"room-visibility\""))
    expect(banner.length).toBeGreaterThan(50)
    expect(banner).not.toContain("event-preferences")
  })
})

describe("your photo in the room is myMainPhoto, never User.image (ROOM-01)", () => {
  const controls = readFileSync(join(__dirname, "..", "lib", "useRoomControls.ts"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "")

  it("the screen and the readiness read the main photo, not the OAuth avatar", () => {
    expect(code).toContain("myMainPhoto(user)")
    expect(code).not.toMatch(/user\??\.image/)
    expect(controls).toContain("myMainPhoto(user)")
    expect(controls).not.toMatch(/user\??\.image/)
  })

  it("the face is decided by myRoomFace: anonymous is the creature", () => {
    expect(code).toContain("myRoomFace({ revealed: controls.revealed")
  })
})

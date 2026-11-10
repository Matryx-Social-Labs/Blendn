import { readFileSync } from "fs"
import { join } from "path"
import { pseudonymFromDoor, pseudonymFromParam, roomSettingsRoute } from "../lib/roomState"

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
    // The path itself is pinned on `roomSettingsRoute` below.
    expect(code).toContain("router.push(roomSettingsRoute(")
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

describe("the banner names your pseudonym (ROOM-02, SV-3)", () => {
  it("reads you.pseudonym from the door; absent or blank is null", () => {
    expect(pseudonymFromDoor({ you: { pseudonym: " Night Cat " } })).toBe("Night Cat")
    expect(pseudonymFromDoor({ you: {} })).toBeNull()
    expect(pseudonymFromDoor({ you: { pseudonym: "  " } })).toBeNull()
    expect(pseudonymFromDoor({})).toBeNull()
    expect(pseudonymFromDoor(null)).toBeNull()
  })
  it("room settings carries the pseudonym and the reveal to the preferences screen (SCRUM-1025): GET /events/:id/chat would join the room", () => {
    expect(code).toContain("roomSettingsRoute(ev.id, { pseudonym: myPseudonym, revealed: controls.revealed })")
  })
  it("the screen takes it from the room, ahead of a match's", () => {
    expect(code).toContain("room.match?.you ?? room.pseudonym")
  })
})

describe("the banner names you the way the room does", () => {
  // Others in the room see the first name only (SCRUM-493); "as Asha Ramaswamy" told you they saw all of it.
  it("says your first name when you are named, not the profile's full name", () => {
    expect(code).toContain("const myName = firstNameOf(user?.name?.trim() || 'You')")
  })
})

describe("a pseudonym that arrives as a route param (SCRUM-1025)", () => {
  it("takes the server's shape, trimmed: words and a collision number", () => {
    expect(pseudonymFromParam(" Quiet Lynx ")).toBe("Quiet Lynx")
    expect(pseudonymFromParam("Midnight Butterfly 12")).toBe("Midnight Butterfly 12")
  })
  it("anything else is no pseudonym: a link cannot put words in the anonymous card", () => {
    expect(pseudonymFromParam(undefined)).toBeNull()
    expect(pseudonymFromParam("")).toBeNull()
    expect(pseudonymFromParam("   ")).toBeNull()
    expect(pseudonymFromParam(["Quiet Lynx"])).toBeNull()
    expect(pseudonymFromParam("Ananya Rao, 9845012345")).toBeNull()
    expect(pseudonymFromParam("Quiet Lynx".repeat(10))).toBeNull()
  })
})

describe("room settings' route (SCRUM-1025)", () => {
  it('routes room settings to the preferences screen with the pseudonym and the reveal the room holds (SCRUM-1025)', () => {
    expect(roomSettingsRoute('e1', { pseudonym: 'Quiet Lynx', revealed: true })).toEqual({
      pathname: '/event-preferences/[eventId]',
      params: { eventId: 'e1', revealed: '1', pseudonym: 'Quiet Lynx' },
    })
    // No pseudonym yet: no param, and the screen says "A made-up name".
    expect(roomSettingsRoute('e1', { pseudonym: null, revealed: false })).toEqual({
      pathname: '/event-preferences/[eventId]',
      params: { eventId: 'e1', revealed: '0' },
    })
  })
})

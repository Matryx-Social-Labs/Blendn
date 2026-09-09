import { render, screen } from "@testing-library/react-native"
import { readFileSync } from "fs"
import { join } from "path"

import { RoomVisibilityBanner } from "../components/RoomVisibilityBanner"

/**
 * The room's reveal switch, and the way into the room's settings.
 *
 * Two gaps, one cause: `event-preferences/[eventId]` has been reachable from
 * nothing since it was written, and the capability gate lived only on it. So in
 * the room, somebody with no photo could turn reveal on and **nothing anybody
 * could see would change** — a switch that silently did nothing, which is the
 * dead-control fault the centre nav button was redesigned to remove.
 */
const code = readFileSync(join(__dirname, "..", "app", "room.tsx"), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "")

describe("the reveal switch when there is nothing to reveal", () => {
  it("refuses to offer a reveal that would change nothing", async () => {
    await render(
      <RoomVisibilityBanner revealed={false} onToggle={() => {}} canReveal={false} missing="a photo" />
    )
    expect(screen.getByLabelText("Show who I am")).toBeDisabled()
  })

  it("says why, on screen and not only to a screen reader", async () => {
    await render(
      <RoomVisibilityBanner revealed={false} onToggle={() => {}} canReveal={false} missing="a photo" />
    )
    // A greyed control with no stated cause reads as the app being broken.
    expect(screen.getByText(/Add a photo to your profile first/)).toBeTruthy()
  })

  it("NEVER blocks going anonymous, whatever the profile looks like", async () => {
    /*
     * The property that matters most here. A gate that could trap somebody in
     * the named state turns a safety control into the thing they need
     * protecting from, so `canReveal` is consulted in one direction only.
     */
    await render(
      <RoomVisibilityBanner revealed={true} onToggle={() => {}} canReveal={false} missing="a photo" />
    )
    expect(screen.getByLabelText("Go anonymous")).not.toBeDisabled()
  })

  it("stays open when the caller has not loaded a profile yet", async () => {
    // Defaulting closed would block the control on a guess during first paint.
    await render(<RoomVisibilityBanner revealed={false} onToggle={() => {}} />)
    expect(screen.getByLabelText("Show who I am")).not.toBeDisabled()
  })
})

describe("the way into the room's settings", () => {
  it("exists", () => {
    expect(code).toContain("'/event-preferences/[eventId]'")
  })

  it("is in the bar, not hung off the visibility banner", () => {
    /*
     * `RoomVisibilityBanner` states a rule: "the action is the opposite state,
     * not a settings link". A second tap target on that row would break it and
     * put two controls for one concept in one line.
     */
    const banner = code.slice(code.indexOf("<RoomVisibilityBanner"), code.indexOf("</View>", code.indexOf("<RoomVisibilityBanner")))
    expect(banner).not.toContain("event-preferences")
  })

  it("feeds the banner the gate it could not compute alone", () => {
    expect(code).toContain("canReveal={readiness.ok}")
    expect(code).toContain("missing={readiness.missing}")
  })
})

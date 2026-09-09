import { render, screen } from "@testing-library/react-native"

import { RoomVisibilityBanner } from "../components/RoomVisibilityBanner"

/**
 * The banner's worst case still draws all three of its parts.
 *
 * A harness rots silently: nobody notices a preview that stopped rendering
 * until they open it to check something else and find it blank. This does not
 * replace looking at `exp+blendn:///preview/room` — clipping and wrapping are
 * not assertable here — but it does catch the case where a part disappears
 * entirely, which is the failure a screenshot review would also miss because
 * there would be nothing to see.
 */
describe("the banner at its longest", () => {
  const LONG = "Constellation Wanderer"

  it("draws the pseudonym, the reason and the action together", async () => {
    /*
     * The arrangement most likely to be drawn wrong: the banner was a flat row
     * until the gate needed a second line, so it is now a row containing a
     * column, and this is the fixture where both compete for width.
     */
    await render(
      <RoomVisibilityBanner
        revealed={false}
        pseudonym={LONG}
        onToggle={() => {}}
        canReveal={false}
        missing="a name and a photo"
      />
    )
    expect(screen.getByText(new RegExp(LONG))).toBeTruthy()
    expect(screen.getByText(/Add a name and a photo to your profile first/)).toBeTruthy()
    // The way out must never be the thing that gets clipped — the reason the
    // title carries `flex: 1` rather than the row being evenly divided.
    expect(screen.getByLabelText("Show who I am")).toBeTruthy()
  })

  it("keeps the reason out of the way when nothing is missing", async () => {
    await render(<RoomVisibilityBanner revealed={false} pseudonym={LONG} onToggle={() => {}} />)
    expect(screen.queryByText(/to your profile first/)).toBeNull()
  })
})

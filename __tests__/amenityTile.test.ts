import { MaterialIcons } from "@expo/vector-icons"

import { amenityTiles } from "../lib/amenityTile"

/**
 * The amenity tiles the Scene draws, from what the server actually sends.
 *
 * `SceneAmenity` was built to the frame and rendered nowhere, under a docstring
 * that set the condition for drawing it: "not until there is something true to
 * put in it". The curated vocabulary now exists and is serialised on the detail
 * payload, so the condition is met — and both `icon` and `subtitle` are
 * nullable in it, which is what this guards.
 */
const ok = { id: "1", name: "Open Bar", subtitle: "Premium Spirits", icon: "local_bar" }

describe("amenity tiles", () => {
  it("converts the server's snake_case to this icon set's kebab-case", () => {
    /*
     * The one that matters, and the one this suite was written wrong for first.
     *
     * Material Symbols names are snake_case; `@expo/vector-icons`' MaterialIcons
     * are kebab-case. Six of the fourteen seeded amenities contain an
     * underscore, so without converting they would all fall back to the same
     * glyph — "Open Bar" and "Photo Booth" drawn identically, with no error
     * anywhere.
     */
    expect("local_bar" in MaterialIcons.glyphMap).toBe(false)
    expect("local-bar" in MaterialIcons.glyphMap).toBe(true)
    expect(amenityTiles([ok])[0].icon).toBe("local-bar")
  })

  it("leaves an already-valid name alone", () => {
    // Eight of the fourteen arrive needing nothing done to them.
    expect(amenityTiles([{ id: "1", name: "Wi-Fi", icon: "wifi" }])[0].icon).toBe("wifi")
  })

  it("falls back rather than drawing an empty box", () => {
    /*
     * The vocabulary is server-curated and can outrun the app's icon font. An
     * unknown name renders as nothing at all, which looks like a broken tile
     * rather than a missing glyph.
     */
    const tile = amenityTiles([{ ...ok, icon: "a_glyph_this_build_has_never_had" }])[0]
    expect(tile.icon).toBe("check-circle")
    expect(tile.icon in MaterialIcons.glyphMap).toBe(true)
  })

  it("falls back when the server sends no icon at all", () => {
    expect(amenityTiles([{ id: "1", name: "Cloakroom" }])[0].icon).toBe("check-circle")
  })

  it("never invents a subtitle", () => {
    /*
     * The frame's second line is a detail about somebody's venue. Making one up
     * puts words in an organiser's mouth.
     */
    expect(amenityTiles([{ id: "1", name: "Cloakroom" }])[0].subtitle).toBe("")
  })

  it("drops a nameless amenity instead of drawing a coloured box", () => {
    expect(amenityTiles([{ id: "1", name: "   ", subtitle: "x" }])).toHaveLength(0)
  })

  it("keeps the server's order, which is the vocabulary's sort_order", () => {
    /*
     * Two events with the same amenities must list them the same way. The
     * server orders by `sort_order` and drops the field, so re-sorting here —
     * alphabetically, say — would put "Accessible Entrance" first on every
     * event in the app.
     */
    const tiles = amenityTiles([
      { id: "1", name: "Open Bar" },
      { id: "2", name: "Accessible Entrance" },
      { id: "3", name: "Photo Booth" },
    ])
    expect(tiles.map((t) => t.title)).toEqual(["Open Bar", "Accessible Entrance", "Photo Booth"])
  })

  it("says nothing when there is nothing", () => {
    expect(amenityTiles(undefined)).toEqual([])
    expect(amenityTiles([])).toEqual([])
  })
})

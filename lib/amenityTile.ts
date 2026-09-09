import { MaterialIcons } from '@expo/vector-icons'

/**
 * Turning a server amenity into something the tile can draw.
 *
 * The vocabulary is curated server-side and open-ended: `amenities.icon` is
 * documented as "a Material Symbols name, **so the client does not carry its
 * own mapping**". That instruction is worth following — a per-slug map here
 * would mean every amenity added later renders blank until somebody ships an
 * app release.
 *
 * What the client does owe is a **normalisation and a check**, and the first
 * one is not optional:
 *
 * Material Symbols names are snake_case (`local_bar`) and this icon set is
 * kebab-case (`local-bar`). Of the fourteen seeded amenities, eight are valid
 * as sent and **six are not** — so without converting, "Open Bar", "Photo
 * Booth" and four others would all fall back to the same glyph and the row
 * would look like one element repeated. Nothing would error; it would simply
 * be wrong, which is the worst way for this to fail.
 *
 * That is a naming convention between two spellings of one icon family, not
 * the per-slug map the server's comment tells the client not to keep.
 *
 * Then the check. `icon` and `subtitle` are both nullable, and a name this
 * build's font does not have renders as nothing at all — an empty box where a
 * tile should be. So the name is verified against the glyph map and falls back,
 * rather than trusted and drawn empty.
 */
export interface ServerAmenity {
  id: string
  name: string
  slug?: string | null
  subtitle?: string | null
  icon?: string | null
}

export interface AmenityTile {
  id: string
  title: string
  subtitle: string
  icon: keyof typeof MaterialIcons.glyphMap
}

/**
 * When the server's icon is missing or unknown to this build.
 *
 * `check-circle` rather than a question mark or a warning triangle: the tile
 * says a facility is present, and an alarming glyph would make "Accessible
 * Entrance" look like a problem with the venue.
 */
const FALLBACK_ICON = 'check-circle' as const

export function amenityTiles(amenities: readonly ServerAmenity[] | null | undefined): AmenityTile[] {
  if (!amenities?.length) return []

  return amenities
    /*
     * A nameless amenity is dropped rather than drawn.
     *
     * The tile's whole content is a title and a subtitle; with no title it is a
     * coloured box, which reads as a rendering fault rather than as a facility.
     */
    .filter((a) => typeof a.name === 'string' && a.name.trim().length > 0)
    .map((a) => {
      // snake_case (Material Symbols, what the server stores) → kebab-case
      // (this icon set). Six of fourteen seeded amenities need it.
      const icon = (a.icon ?? '').trim().replace(/_/g, '-')
      const known = icon in MaterialIcons.glyphMap

      return {
        id: a.id,
        title: a.name.trim(),
        /*
         * The subtitle is optional in the vocabulary, and the tile requires a
         * string. Empty rather than invented: the frame's second line is a
         * detail ("Premium Spirits"), and making one up would put words in an
         * organiser's mouth about their own venue.
         */
        subtitle: a.subtitle?.trim() ?? '',
        icon: (known ? icon : FALLBACK_ICON) as keyof typeof MaterialIcons.glyphMap,
      }
    })
}

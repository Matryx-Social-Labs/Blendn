import { getMapImageUrlCache, setMapImageUrlCache } from './mapImageCache'

/**
 * A Google Static Maps URL for a venue, styled for this app's dark surfaces.
 *
 * ## Why static rather than a map view
 *
 * `react-native-maps` is not installed, and the Location card does not need an
 * interactive map — it needs to answer "roughly where is this". A static image
 * costs one cached request, has no gesture handler competing with the scroll
 * view it sits inside, and cannot fail into a grey interactive rectangle. When
 * the real map arrives for Hotspots' "Explore the Grid", *that* is where
 * panning belongs.
 *
 * This was assembled inline inside the event screen's JSX — a template literal
 * with a 400-character style string in the middle of a render. It is here so
 * the Scene's Location card and anything else can draw the same map, and so
 * the styling is in one place when it is next adjusted.
 */

/**
 * The dark style, as `style=` parameters.
 *
 * Google's static API takes styling as repeated query parameters rather than
 * JSON, so this is a string rather than an object. Tuned to sit against
 * `EMBER.surfaceMedia` without either glowing or disappearing.
 *
 * **The pipes are pre-encoded as `%7C` deliberately.** With raw `|` the URL is
 * valid and works from curl, and on device Google served an unstyled map with
 * "Map error" stamped across it — the separators were being re-encoded
 * somewhere between here and the socket, and a double-encoded `%257C` is not a
 * separator any more. Writing them encoded means no layer has to guess, and the
 * string is byte-identical wherever it is fetched from.
 */
const DARK_STYLE = [
  'style=feature:all%7Celement:geometry%7Ccolor:0x1f1f1f',
  'style=feature:all%7Celement:labels.text.fill%7Ccolor:0xcfcfcf',
  'style=feature:all%7Celement:labels.text.stroke%7Ccolor:0x1f1f1f',
  'style=feature:road%7Celement:geometry%7Ccolor:0x2f2f2f',
  'style=feature:road.highway%7Celement:geometry%7Ccolor:0x3a3a3a',
  'style=feature:water%7Celement:geometry%7Ccolor:0x111827',
  'style=feature:poi%7Celement:geometry%7Ccolor:0x252525',
  /*
   * No points of interest, and no transit.
   *
   * Styling `poi|geometry` recolours the shapes but leaves Google's own
   * category pins — orange for restaurants, pink for hotels — which are the
   * brightest thing in the card and compete with the one marker that matters.
   * The frame's map is desaturated to near-silence for exactly this reason:
   * it is a location, not something to browse.
   */
  'style=feature:poi%7Cvisibility:off',
  'style=feature:transit%7Cvisibility:off',
].join('&')

export interface StaticMapOptions {
  latitude: number
  longitude: number
  /** Points; the URL asks for `scale=2`, so the image comes back at 2x. */
  width: number
  height: number
  zoom?: number
  /** Cache identity. Defaults to the rounded coordinates. */
  key?: string
}

/**
 * `null` when there is no API key or no real coordinate.
 *
 * Returning null rather than a URL that will 403 matters: the caller draws a
 * plain surface instead, which looks deliberate. A broken image inside a card
 * looks like the card is broken.
 */
export function staticMapUrl({
  latitude,
  longitude,
  width,
  height,
  zoom = 15,
  key,
}: StaticMapOptions): string | null {
  const apiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY
  if (!apiKey) return null
  // 0,0 is in the Gulf of Guinea and is what an unset coordinate looks like in
  // this schema, so it is treated as absent rather than drawn.
  if (!latitude || !longitude) return null

  const w = Math.min(640, Math.max(100, Math.round(width)))
  const h = Math.min(640, Math.max(100, Math.round(height)))
  const cacheKey = key ?? `${latitude.toFixed(5)},${longitude.toFixed(5)}:${w}x${h}:${zoom}`

  const cached = getMapImageUrlCache(cacheKey)
  if (cached) return cached

  const centre = `${latitude},${longitude}`
  /*
   * The pin in the brand accent.
   *
   * The frame draws a 48pt gradient circle with a white glyph, which the static
   * API cannot render — it takes a flat colour or a hosted icon. `0xFF906D` is
   * the accent's flat end, so the pin reads as ours rather than as Google's
   * default red, without shipping an icon to a CDN to get there.
   */
  const marker = `markers=color:0xFF906D%7C${centre}`
  const url =
    `https://maps.googleapis.com/maps/api/staticmap?center=${centre}` +
    `&zoom=${zoom}&size=${w}x${h}&scale=2&${marker}&${DARK_STYLE}&key=${apiKey}`

  setMapImageUrlCache(cacheKey, url)
  return url
}

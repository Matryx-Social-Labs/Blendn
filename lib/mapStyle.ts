/**
 * The dark map style, for the Maps SDK.
 *
 * Ported from `staticMap.ts`'s query-parameter form, which the Static Maps web
 * service takes, to the JSON the SDK's `customMapStyle` takes. Same style, two
 * spellings — the colours were tuned to sit against `EMBER.surfaceMedia`
 * without either glowing or disappearing, and are carried over exactly rather
 * than re-picked.
 *
 * `0x1f1f1f` becomes `#1f1f1f`: the static API writes colours as hex integers,
 * the SDK as CSS strings.
 */
export const DARK_MAP_STYLE = [
  { featureType: 'all', elementType: 'geometry', stylers: [{ color: '#1f1f1f' }] },
  { featureType: 'all', elementType: 'labels.text.fill', stylers: [{ color: '#cfcfcf' }] },
  { featureType: 'all', elementType: 'labels.text.stroke', stylers: [{ color: '#1f1f1f' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#2f2f2f' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#3a3a3a' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#111827' }] },
  { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#252525' }] },
  /*
   * No points of interest, and no transit.
   *
   * Styling `poi|geometry` recolours the shapes but leaves Google's own
   * category pins — orange for restaurants, pink for hotels — which are the
   * brightest thing in the card and compete with the one marker that matters.
   * The frame's map is desaturated to near-silence for exactly this reason:
   * it is a location, not something to browse.
   */
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
]

/**
 * How tight the frame sits around the pin.
 *
 * `staticMapUrl` used `zoom: 15`, and a `MapView` takes a span rather than a
 * zoom level. 0.005° is roughly the same framing at this latitude — about half
 * a kilometre across — which is the "roughly where is this" the Location card
 * is answering, not a street view.
 */
export const LOCATION_CARD_DELTA = 0.005

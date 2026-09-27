import { Linking } from 'react-native'

/**
 * Open a place in Google Maps — the app when it is installed, the web
 * otherwise. Coordinates when we have them, the address when we do not.
 *
 * One copy. The event screen and the Going tab each had their own, and the
 * Pulse's check-in refusal needs it too ("Not quite there yet" → Open Maps).
 */
export async function openInMaps(place: {
  latitude?: number | null
  longitude?: number | null
  address?: string | null
  venue_name?: string | null
  title?: string | null
}): Promise<void> {
  const lat = place.latitude
  const lon = place.longitude
  const hasCoords = Number.isFinite(lat) && Number.isFinite(lon)
  const addressQuery = encodeURIComponent(place.address || place.venue_name || place.title || 'Event Location')
  const googleScheme = 'comgooglemaps://'
  const googleAppUrl = hasCoords ? `${googleScheme}?q=${lat},${lon}` : `${googleScheme}?q=${addressQuery}`
  const googleWebUrl = hasCoords
    ? `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`
    : `https://www.google.com/maps/search/?api=1&query=${addressQuery}`
  try {
    if (await Linking.canOpenURL(googleScheme)) return Linking.openURL(googleAppUrl)
  } catch {}
  return Linking.openURL(googleWebUrl)
}

import { router } from 'expo-router'

import type { VenueListItem } from '../../lib/apiClient'
import type { DistanceShown } from '../../lib/placesPane'

/** A place opens with the distance the list showed (none from another city), said as the list said it ("about 1 km"), so the page need not ask where the phone is. */
export function openPlace(venue: VenueListItem, reading: DistanceShown) {
  // To the metre: the page reads at most three decimals (`kmParam`), and the server's haversine has fifteen.
  const distance = reading && venue.distance != null ? { km: String(Math.round(venue.distance * 1000) / 1000), ...(reading === 'approximate' ? { reading } : {}) } : {}
  router.push({ pathname: '/venue/[id]', params: { id: venue.id, ...distance } } as never)
}

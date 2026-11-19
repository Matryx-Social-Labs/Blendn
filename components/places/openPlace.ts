import { router } from 'expo-router'

import type { VenueListItem } from '../../lib/apiClient'
import type { DistanceReading } from '../../lib/placesPane'

/** A place opens with the distance the list showed, said as the list said it ("about 1 km"), so the page need not ask where the phone is. */
export function openPlace(venue: VenueListItem, reading: DistanceReading) {
  const distance = venue.distance != null ? { km: String(venue.distance), ...(reading === 'approximate' ? { reading } : {}) } : {}
  router.push({ pathname: '/venue/[id]', params: { id: venue.id, ...distance } } as never)
}

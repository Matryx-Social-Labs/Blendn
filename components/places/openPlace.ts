import { router } from 'expo-router'

import type { VenueListItem } from '../../lib/apiClient'

/** A place opens with the distance the list showed, so the page need not ask where the phone is. */
export function openPlace(venue: VenueListItem) {
  router.push({ pathname: '/venue/[id]', params: { id: venue.id, ...(venue.distance != null ? { km: String(venue.distance) } : {}) } } as never)
}

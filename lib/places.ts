/**
 * The Places list's loading, as a reducer: what a page arriving, failing or
 * going stale does to what is on screen (plan v2 step 2; step 2 review).
 *
 * Kept pure so the races are tested here rather than found on a phone: a city
 * change while page 2 is in flight, a refresh that fails over a full list, a
 * venue taken over between two pages.
 */

import type { VenueListItem } from './apiClient'

export interface PlacesState {
  /** What the list is of (`placesKey`): a page for any other key is stale. */
  key: string
  /** `loading`: nothing to show yet. `error`: nothing to show, and it failed. */
  status: 'idle' | 'loading' | 'ready' | 'error'
  venues: VenueListItem[]
  /** The last page that arrived. */
  page: number
  hasMore: boolean
  /** A page past the first is on its way: `onEndReached` must not ask again. */
  loadingMore: boolean
  /** A refresh failed over a list already shown: keep the list, say so inline, offer a retry. */
  refreshFailed: boolean
}

export type PlacesAction =
  | { type: 'reset'; key: string }
  | { type: 'request'; key: string; page: number }
  | { type: 'loaded'; key: string; page: number; venues: VenueListItem[]; hasMore: boolean }
  | { type: 'failed'; key: string; page: number }

export const initialPlaces = (key: string): PlacesState => ({
  key,
  status: 'idle',
  venues: [],
  page: 0,
  hasMore: false,
  loadingMore: false,
  refreshFailed: false,
})

/** What the list is of: the city, and the spot distances are from (to ~100 m, so a GPS jitter is not a new list). */
export function placesKey(city: string | null, location: { latitude: number; longitude: number } | null): string {
  const at = location ? `${location.latitude.toFixed(3)},${location.longitude.toFixed(3)}` : '-'
  return `${city ?? '-'}|${at}`
}

export function placesReducer(state: PlacesState, action: PlacesAction): PlacesState {
  if (action.type === 'reset') return action.key === state.key ? state : initialPlaces(action.key)
  // A page for another city or another spot is never applied over this one.
  if (action.key !== state.key) return state

  switch (action.type) {
    case 'request':
      if (action.page > 1) return { ...state, loadingMore: true }
      // A refresh over a list keeps the list; only an empty list shows the spinner.
      return { ...state, status: state.venues.length > 0 ? 'ready' : 'loading', refreshFailed: false }
    case 'loaded': {
      if (action.page <= 1) {
        return { ...state, status: 'ready', venues: action.venues, page: 1, hasMore: action.hasMore, loadingMore: false, refreshFailed: false }
      }
      // A venue taken over (or back) between pages shifts the offsets; never show one twice.
      const seen = new Set(state.venues.map((v) => v.id))
      return {
        ...state,
        venues: [...state.venues, ...action.venues.filter((v) => !seen.has(v.id))],
        page: action.page,
        hasMore: action.hasMore,
        loadingMore: false,
      }
    }
    case 'failed':
      // A later page failing leaves the list and `hasMore` as they were: the next scroll asks again.
      if (action.page > 1) return { ...state, loadingMore: false }
      return state.venues.length > 0 ? { ...state, status: 'ready', refreshFailed: true } : { ...state, status: 'error' }
  }
}

/** Whether the end of the list may ask for the next page now. */
export const mayLoadMore = (s: PlacesState) => s.status === 'ready' && s.hasMore && !s.loadingMore

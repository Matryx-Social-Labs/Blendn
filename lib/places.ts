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
  /** The server ordered this list live first (`order: 'live'`): Live now and Open tonight are all in the first pages. */
  orderedLive: boolean
  /** A page past the first is on its way: `onEndReached` must not ask again. */
  loadingMore: boolean
  /** A refresh failed over a list already shown: keep the list, say so inline, offer a retry. */
  refreshFailed: boolean
  /** The server's `pagination.totalCount` for these params (the stat line's "6,422 places"); null before the first page. */
  total: number | null
  /** When the last page 1 arrived (ms): "Live as of 9:41 PM" while offline. */
  readAt: number | null
  /** A read the server refused for asking too fast (Flow 15 #15): the wait, and which page it was. Not a failure; nothing asks until it is over. */
  rateLimit: { seconds: number; page: number } | null
}

export type PlacesAction =
  | { type: 'reset'; key: string }
  | { type: 'request'; key: string; page: number }
  | { type: 'loaded'; key: string; page: number; venues: VenueListItem[]; hasMore: boolean; orderedLive?: boolean; total?: number; at?: number }
  | { type: 'failed'; key: string; page: number; /** Seconds the server asked us to wait, when the failure was a 429. */ rateLimit?: number }
  /** The wait is over: the list may ask again. */
  | { type: 'rateLimitDone'; key: string }

export const initialPlaces = (key: string): PlacesState => ({
  key,
  status: 'idle',
  venues: [],
  page: 0,
  hasMore: false,
  orderedLive: false,
  loadingMore: false,
  refreshFailed: false,
  total: null,
  readAt: null,
  rateLimit: null,
})

/** What the list is of: the city, the spot distances are from (to ~100 m, so a GPS jitter is not a new list), the type chip, the search and the radius. */
export function placesKey(
  city: string | null,
  location: { latitude: number; longitude: number } | null,
  venueType: string | null = null,
  search: string | null = null,
  radiusKm: number | null = null
): string {
  const at = location ? `${location.latitude.toFixed(3)},${location.longitude.toFixed(3)}` : '-'
  return `${city ?? '-'}|${at}|${venueType ?? '-'}|${search ?? '-'}|${radiusKm ?? '-'}`
}

/** First occurrence wins: a venue that went live between two page loads can be on both (`order=live` moves it up the order). */
export function uniqueById(venues: readonly VenueListItem[], seen: ReadonlySet<string> = new Set()): VenueListItem[] {
  const taken = new Set(seen)
  return venues.filter((v) => !taken.has(v.id) && (taken.add(v.id), true))
}

export function placesReducer(state: PlacesState, action: PlacesAction): PlacesState {
  if (action.type === 'reset') return action.key === state.key ? state : initialPlaces(action.key)
  // A page for another city or another spot is never applied over this one.
  if (action.key !== state.key) return state

  switch (action.type) {
    case 'request':
      if (action.page > 1) return { ...state, loadingMore: true }
      // A refresh over a list keeps the list; only an empty list shows the spinner.
      return { ...state, status: state.venues.length > 0 ? 'ready' : 'loading', refreshFailed: false, rateLimit: null }
    case 'loaded': {
      if (action.page <= 1) {
        return { ...state, rateLimit: null, status: 'ready', venues: uniqueById(action.venues), page: 1, hasMore: action.hasMore, orderedLive: action.orderedLive === true, loadingMore: false, refreshFailed: false, total: action.total ?? null, readAt: action.at ?? null }
      }
      // A venue taken over (or back) between pages shifts the offsets; never show one twice.
      return {
        ...state,
        venues: [...state.venues, ...uniqueById(action.venues, new Set(state.venues.map((v) => v.id)))],
        page: action.page,
        hasMore: action.hasMore,
        loadingMore: false,
        total: action.total ?? state.total,
      }
    }
    case 'failed': {
      const rateLimit = action.rateLimit === undefined ? null : { seconds: action.rateLimit, page: action.page }
      // A later page failing leaves the list and `hasMore` as they were: the next scroll asks again (not while it is told to wait).
      if (action.page > 1) return { ...state, loadingMore: false, rateLimit }
      // Asked too fast is not a failure to retry: the list stays, or stays empty, and the banner says the wait.
      if (rateLimit) return { ...state, status: state.venues.length > 0 ? 'ready' : 'idle', rateLimit }
      return state.venues.length > 0 ? { ...state, status: 'ready', refreshFailed: true } : { ...state, status: 'error' }
    }
    case 'rateLimitDone':
      return { ...state, rateLimit: null }
  }
}

/** Whether the end of the list may ask for the next page now. */
export const mayLoadMore = (s: PlacesState) => s.status === 'ready' && s.hasMore && !s.loadingMore && s.rateLimit === null

/** When a page was read, for "Live as of 9:41 PM". Here and not in the list, which never reasons about time (HM-CU04). */
export const readStamp = () => Date.now()

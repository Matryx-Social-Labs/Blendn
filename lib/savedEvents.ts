/**
 * The Going tab's rows, from `GET /users/:id/favorites`.
 *
 * The server sends `{ events, timeFilter, pagination }`. The screen read
 * `result.data` as the array itself, `.map` threw, the `catch` swallowed it,
 * and the tab showed "No saved events yet" to everyone with saves — while the
 * Me tab beside it counted them (SCRUM-175). This is the one place the shape
 * is read, and the test feeds it the real payload.
 */

export interface SavedEventRow {
  id: string
  title: string
  venue_name: string
  address: string
  start_time: string
  end_time: string
  cover_image_url: string | null
  latitude: number
  longitude: number
  /** `cancelled` stays in the list — history — and the card must say so. */
  status: 'published' | 'cancelled' | 'completed' | 'draft'
}

export interface SavedEventsPayload {
  events: {
    id: string
    title: string
    venueName?: string | null
    address?: string | null
    startTime: string
    endTime: string
    coverImageUrl?: string | null
    latitude?: number | null
    longitude?: number | null
    status: SavedEventRow['status']
  }[]
  pagination?: { page: number; totalCount: number; hasMore: boolean }
}

export function savedEventRows(data: SavedEventsPayload | undefined | null): SavedEventRow[] {
  if (!data || !Array.isArray(data.events)) return []
  return data.events.map((e) => ({
    id: e.id,
    title: e.title,
    venue_name: e.venueName ?? '',
    address: e.address ?? '',
    start_time: e.startTime,
    end_time: e.endTime,
    cover_image_url: e.coverImageUrl ?? null,
    latitude: e.latitude ?? NaN,
    longitude: e.longitude ?? NaN,
    status: e.status,
  }))
}

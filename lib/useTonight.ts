import * as Location from 'expo-location'
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'

import { getEvents, type BlendnEvent } from './api'
import { apiClient, type RoomPreview } from './apiClient'
import { subscribeCheckInChanged } from './checkIn'
import { readStoredCity } from './cityStorage'
import { liveWindow } from './eventSession'
import { getDistanceKm } from './geo'
import { Logger } from './logger'
import { printable } from './pulseSections'
import { pickTonight } from './roomMoments'
import { FIX_MAX_AGE_MS, FIX_REQUIRED_ACCURACY_M, fixOf, type PreciseFix } from './roomButton'
import { getRoomSignal, publishRoomSignal, subscribeRoomSignal } from './roomSignal'
import { useLiveSync } from './useLiveSync'

/**
 * What's on tonight, for the Blend'n screen before you've checked in.
 *
 * Reads the same feed the Pulse does, with the same parameters, so a Pulse
 * that has already loaded makes this a cache hit rather than a second request
 * (`apiClient.getEvents` is SWR-cached per query).
 *
 * **Never asks for location.** The permission prompt belongs to the Pulse,
 * where it is explained; a centre button that pops a system dialog is a
 * control that ambushes people. With permission already granted it uses the
 * last known fix — instant, and good enough to order a list — and without it
 * falls back to the stored city, ordered by start time.
 */

export interface TonightEvent {
  id: string
  title: string
  venue: string
  photo: string | null
  startsAt: string
  endsAt: string
  /** The event's own zone (IANA): its clock and its day are said there, not in the phone's (R6-4). */
  timeZone?: string | null
  distanceKm: number | null
  /** Inside now: the room preview's count when it answered, else the feed's. */
  hereCount: number
  capacity: number | null
  /** Saved or RSVP'd — yours, so it sorts first. */
  going: boolean
  /** How many here share your taste; null when withheld, unknown, or not fetched. */
  tasteMatchCount: number | null
  /** RSVPs, for the card's "N going" pill (Flow 4 Tonight #06); null until the detail answers (the list carries none). */
  goingCount: number | null
  /** The event's category slug, for its plate when it has no cover (rc7 ruling 5); absent from an older server. */
  category?: string
}

/** What Tonight can say about your location (Flow 4 Tonight #10, R3-D4 4.7). */
export type TonightLocation = 'on' | 'off' | 'approximate'

export interface TonightState {
  status: 'loading' | 'ready' | 'error'
  events: TonightEvent[]
  /**
   * `off`: no permission, so the list is by city with no distances, said in a
   * banner with Turn on (#10). `approximate`: iOS Precise Location is off, so
   * no door can be checked (R3-D4 4.7). Never prompts: read, not asked.
   */
  location: TonightLocation
  /** The last refresh failed and what is shown loaded earlier (#11, "Offline."). */
  offline: boolean
  /** The event whose fence you are standing in, per the centre button's signal. */
  insideEventId: string | null
  refresh(): Promise<void>
}

/** The inside event plus this many from the top get a room preview. */
const PREVIEW_TOP = 3

/** The Pulse's page size, so the query — and so the cache entry — is the same. */
const PULSE_PAGE = 20

type QuietCoords = PreciseFix & { approximate: boolean }

/** A fix only if the person already said yes. Never prompts. */
async function quietLocation(): Promise<{ coords: QuietCoords | null; location: TonightLocation }> {
  try {
    const permission = await Location.getForegroundPermissionsAsync()
    if (permission.status !== 'granted') return { coords: null, location: 'off' }
    const location = permission.ios?.accuracy === 'reduced' ? 'approximate' : 'on'
    const last = await Location.getLastKnownPositionAsync({ maxAge: FIX_MAX_AGE_MS, requiredAccuracy: FIX_REQUIRED_ACCURACY_M })
    return {
      coords: last?.coords
        ? { ...fixOf(last), approximate: location === 'approximate' }
        : null,
      location,
    }
  } catch {
    return { coords: null, location: 'on' }
  }
}

function toTonight(
  e: BlendnEvent,
  coords: { latitude: number; longitude: number } | null,
  goingIds: ReadonlySet<string>
): TonightEvent {
  // The server's distance when it computed one; else ours from the same fix.
  const distanceKm =
    typeof e.distance === 'number' && Number.isFinite(e.distance)
      ? e.distance
      : coords && Number.isFinite(e.latitude) && Number.isFinite(e.longitude)
        ? getDistanceKm(coords.latitude, coords.longitude, e.latitude as number, e.longitude as number)
        : null
  // Today's day of a multi-day run, not the run: LIVE is what the door says.
  const live = liveWindow(e)
  return {
    id: e.id,
    title: e.title,
    venue: e.venue_name,
    photo: e.cover_image_url,
    startsAt: live.start_time,
    endsAt: live.end_time ?? e.end_time,
    timeZone: e.timezone,
    distanceKm,
    // Inside now (the Room's rule), never everybody who came; 0 from an older server.
    hereCount: e.here_count ?? 0,
    // `eventFromApi` writes 0 for "no cap"; 0 is not a capacity anyone set.
    capacity: e.max_capacity > 0 ? e.max_capacity : null,
    going: e.is_favorited || goingIds.has(e.id),
    tasteMatchCount: null,
    // The list's `goingCount` (RSVPs), the same number as the detail's `stats.rsvpCount`; under five it is not said.
    goingCount: printable(e.going_count),
    category: e.category_group || undefined,
  }
}

export function useTonight(): TonightState {
  const signal = useSyncExternalStore(subscribeRoomSignal, getRoomSignal, getRoomSignal)
  const [status, setStatus] = useState<TonightState['status']>('loading')
  const [events, setEvents] = useState<TonightEvent[]>([])
  const [location, setLocation] = useState<TonightLocation>('on')
  const [offline, setOffline] = useState(false)
  const [previews, setPreviews] = useState<Record<string, RoomPreview>>({})
  const loadIdRef = useRef(0)
  const eventsRef = useRef<TonightEvent[]>([])

  const load = useCallback(async (force: boolean) => {
    const loadId = ++loadIdRef.current
    const [{ coords, location: where }, stored, rsvps] = await Promise.all([
      quietLocation(),
      readStoredCity(),
      // RSVPs are the other half of "yours". A failure only loses the sort.
      apiClient.getMyRsvps().catch(() => null),
    ])

    const result = await getEvents(
      {
        page: 0,
        limit: PULSE_PAGE,
        city: stored?.city ?? undefined,
        lat: coords?.latitude,
        lon: coords?.longitude,
        include: 'checkins,activeCheckins,profile',
      },
      { force }
    )
    if (loadId !== loadIdRef.current) return
    setLocation(where)

    if (!result.data) {
      Logger.warn('events', 'Tonight could not load events', { error: result.error })
      // Keep what is on screen: a failed refresh is not "nothing on", it is "offline" (#11).
      if (eventsRef.current.length === 0) setStatus('error')
      else setOffline(true)
      return
    }
    setOffline(false)

    /*
     * Hand the centre button what this fetch knows — but only with a fix. A
     * city feed has no distances, and publishing from it would clear an
     * "inside" the Pulse had correctly worked out.
     */
    if (coords) publishRoomSignal(result.data, Date.now(), coords)

    const goingIds = new Set<string>(
      (rsvps?.data?.events ?? []).filter((e) => e.rsvpStatus === 'going').map((e) => e.id)
    )
    const next = pickTonight(
      result.data.map((e) => toTonight(e, coords, goingIds)),
      Date.now()
    )
    eventsRef.current = next
    setEvents(next)
    setStatus('ready')
  }, [])

  useEffect(() => {
    let cancelled = false
    // Inside its effect, the shape React documents for fetching in one.
    const run = async () => {
      try {
        await load(false)
      } catch (e) {
        Logger.error('events', 'Tonight failed to load', { error: e })
        if (!cancelled && eventsRef.current.length === 0) setStatus('error')
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [load])

  useLiveSync({
    // Cached: focus and the timer revalidate behind the paint.
    onSync: () => load(false),
    domains: ['events'],
    connectedIntervalMs: 60000,
    disconnectedIntervalMs: 30000,
  })

  /*
   * A check-in or check-out on this device changes which row is yours and how
   * many are inside. Forced, because a person just acted and the feed's
   * cached copy predates it.
   */
  useEffect(
    () =>
      subscribeCheckInChanged(() => {
        load(true).catch((e) => Logger.warn('events', 'Tonight reload failed', { error: e }))
      }),
    [load]
  )

  const refresh = useCallback(async () => {
    // Retrying from the error state: back to the skeleton while it tries, so
    // "Try again" visibly does something.
    if (eventsRef.current.length === 0) setStatus('loading')
    try {
      // A human asked.
      await load(true)
    } catch (e) {
      Logger.error('events', 'Tonight refresh failed', { error: e })
      if (eventsRef.current.length === 0) setStatus('error')
    }
  }, [load])

  /*
   * Room previews for the rows people actually look at: the room you are
   * standing in, and the top few. An older server 404s the endpoint; that
   * row simply keeps the feed's count and no taste line.
   */
  const insideEventId = signal.insideEventId
  const previewKey = [
    ...new Set([insideEventId, ...events.slice(0, PREVIEW_TOP).map((e) => e.id)].filter((id): id is string => !!id)),
  ].join(',')

  useEffect(() => {
    if (!previewKey) return
    let cancelled = false
    const ids = previewKey.split(',')
    Promise.all(
      ids.map((id) =>
        apiClient
          .getRoomPreview(id)
          .then((r) => (r.success && r.data ? ([id, r.data] as const) : null))
          .catch(() => null)
      )
    ).then((answers) => {
      if (cancelled) return
      const found = answers.filter((a): a is readonly [string, RoomPreview] => a !== null)
      if (found.length === 0) return
      setPreviews((prev) => ({ ...prev, ...Object.fromEntries(found) }))
    })
    return () => {
      cancelled = true
    }
  }, [previewKey])

  const merged = useMemo(
    () =>
      events.map((e) => {
        const preview = previews[e.id]
        return preview ? { ...e, hereCount: preview.hereCount, tasteMatchCount: preview.tasteMatchCount } : e
      }),
    [events, previews]
  )

  return { status, events: merged, insideEventId, location, offline, refresh }
}

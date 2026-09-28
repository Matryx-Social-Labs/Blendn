import * as Location from 'expo-location'
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'

import { getEvents, type BlendnEvent } from './api'
import { apiClient, type RoomPreview } from './apiClient'
import { subscribeCheckInChanged } from './checkIn'
import { readStoredCity } from './cityStorage'
import { liveWindow } from './eventSession'
import { getDistanceKm } from './geo'
import { Logger } from './logger'
import { pickTonight } from './roomMoments'
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
  distanceKm: number | null
  /** Inside now: the room preview's count when it answered, else the feed's. */
  hereCount: number
  capacity: number | null
  /** Saved or RSVP'd — yours, so it sorts first. */
  going: boolean
  /** How many here share your taste; null when withheld, unknown, or not fetched. */
  tasteMatchCount: number | null
}

export interface TonightState {
  status: 'loading' | 'ready' | 'error'
  events: TonightEvent[]
  /** The event whose fence you are standing in, per the centre button's signal. */
  insideEventId: string | null
  refresh(): Promise<void>
}

/** The inside event plus this many from the top get a room preview. */
const PREVIEW_TOP = 3

/** The Pulse's page size, so the query — and so the cache entry — is the same. */
const PULSE_PAGE = 20

/** A fix only if the person already said yes. Never prompts. */
async function quietLocation(): Promise<{ latitude: number; longitude: number } | null> {
  try {
    const { status } = await Location.getForegroundPermissionsAsync()
    if (status !== 'granted') return null
    const last = await Location.getLastKnownPositionAsync()
    return last?.coords ? { latitude: last.coords.latitude, longitude: last.coords.longitude } : null
  } catch {
    return null
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
    distanceKm,
    hereCount: e.current_capacity || 0,
    // `eventFromApi` writes 0 for "no cap"; 0 is not a capacity anyone set.
    capacity: e.max_capacity > 0 ? e.max_capacity : null,
    going: e.is_favorited || goingIds.has(e.id),
    tasteMatchCount: null,
  }
}

export function useTonight(): TonightState {
  const signal = useSyncExternalStore(subscribeRoomSignal, getRoomSignal, getRoomSignal)
  const [status, setStatus] = useState<TonightState['status']>('loading')
  const [events, setEvents] = useState<TonightEvent[]>([])
  const [previews, setPreviews] = useState<Record<string, RoomPreview>>({})
  const loadIdRef = useRef(0)
  const eventsRef = useRef<TonightEvent[]>([])

  const load = useCallback(async (force: boolean) => {
    const loadId = ++loadIdRef.current
    const [coords, stored, rsvps] = await Promise.all([
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

    if (!result.data) {
      Logger.warn('events', 'Tonight could not load events', { error: result.error })
      // Keep what is on screen: a failed refresh is not "nothing on".
      if (eventsRef.current.length === 0) setStatus('error')
      return
    }

    /*
     * Hand the centre button what this fetch knows — but only with a fix. A
     * city feed has no distances, and publishing from it would clear an
     * "inside" the Pulse had correctly worked out.
     */
    if (coords) publishRoomSignal(result.data)

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
  const previewKey = [insideEventId, ...events.slice(0, PREVIEW_TOP).map((e) => e.id)]
    .filter((id): id is string => !!id)
    .filter((id, i, all) => all.indexOf(id) === i)
    .join(',')

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
      setPreviews((prev) => {
        const copy = { ...prev }
        for (const [id, preview] of found) copy[id] = preview
        return copy
      })
    })
    return () => {
      cancelled = true
    }
  }, [previewKey])

  const merged = useMemo(
    () =>
      events.map((e) => {
        const preview = previews[e.id]
        return preview
          ? { ...e, hereCount: preview.hereCount, tasteMatchCount: preview.tasteMatchCount }
          : e
      }),
    [events, previews]
  )

  return { status, events: merged, insideEventId, refresh }
}

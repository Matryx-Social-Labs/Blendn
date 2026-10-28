import AsyncStorage from '@react-native-async-storage/async-storage'
import * as Application from 'expo-application'
import { useEffect, useState } from 'react'
import { Platform } from 'react-native'

import { apiClient } from './apiClient'
import { dateParts } from './shareEvent'
import { parseLink, routeFor, type LinkTarget } from './shareLinks'
import { isGone } from './loadFailure'
import { guestTypeLabel } from './placesPane'
import { Logger } from './logger'

/**
 * Arriving from a link (Flow 16 · 16.7): the one-time "You were sent Neon Nights" banner on the Pulse.
 *
 * A link opened with the app installed goes straight to the event or the venue (`app/+native-intent.tsx`); this is for
 * the person who did not have the app. On Android the public page's "Open in Blend'n" goes through Google Play with an
 * install referrer, `link=e/<event id>` or `link=v/<venue id>` (the server's contract, `docs`), which the first launch
 * can read. On iOS a link cannot survive the App Store, so v1 lands on the Pulse with nothing to say.
 *
 * Shown once, ever: marked as soon as it is drawn, so a person who ignores it is not nagged on the next launch, and a
 * link whose event is gone says nothing at all (the Scene says "No longer available" if they follow it by hand).
 */
export const ARRIVAL_SEEN_KEY = 'blendn_arrival_seen'

/** What the install referrer points at: an event or a venue, never a friend invite (a person's, and handled on its own). */
export function arrivalFromReferrer(referrer: string | null | undefined): LinkTarget | null {
  const link = referrer
    ?.split('&')
    .map((part) => part.split('='))
    .find(([key]) => key === 'link')?.[1]
  let decoded: string | null = null
  try {
    decoded = link ? decodeURIComponent(link) : null
  } catch {
    return null
  }
  const target = parseLink(decoded)
  return target && target.kind !== 'invite' ? target : null
}

export type ArrivalDetails = { title: string; meta: string; cover: string | null; route: string }

/** `ready` to show · `gone` the link points at nothing (say nothing) · `retry` it could not be asked (try next launch). */
export type ArrivalLookup = { status: 'ready'; details: ArrivalDetails } | { status: 'gone' | 'retry' }

/** What the banner says about the target, from the server: an unlisted event names its area only. */
export async function lookUpArrival(target: LinkTarget): Promise<ArrivalLookup> {
  try {
    if (target.kind === 'event') {
      const result = await apiClient.getEvent(target.id)
      if (isGone(result)) return { status: 'gone' }
      if (!result.success || !result.data) return { status: 'retry' }
      const e = result.data
      if (e.status === 'draft' || e.visibility === 'private') return { status: 'gone' }
      // An unlisted event names its area, never the venue.
      const area = e.area || e.city
      const place = e.visibility === 'unlisted' ? area : [e.venueName, area].filter(Boolean).join(', ')
      const when = dateParts(e.startTime, e.timezone).dateText
      return {
        status: 'ready',
        details: { title: e.title, meta: [when, place].filter(Boolean).join(' · '), cover: e.coverImageUrl || null, route: routeFor(target) },
      }
    }
    const result = await apiClient.getVenue(target.id)
    if (isGone(result)) return { status: 'gone' }
    if (!result.success || !result.data) return { status: 'retry' }
    const v = result.data.venue
    return { status: 'ready', details: { title: v.name, meta: [guestTypeLabel(v), v.city].filter(Boolean).join(' · '), cover: null, route: routeFor(target) } }
  } catch (error) {
    Logger.warn('general', 'arrival:lookup:failed', { error })
    return { status: 'retry' }
  }
}

/** The banner's content for this launch, or null: not Android, already seen, no referrer, a dead link. */
export function useArrival(): ArrivalDetails | null {
  const [details, setDetails] = useState<ArrivalDetails | null>(null)
  useEffect(() => {
    if (Platform.OS !== 'android') return
    let live = true
    void (async () => {
      try {
        if (await AsyncStorage.getItem(ARRIVAL_SEEN_KEY)) return
        const target = arrivalFromReferrer(await Application.getInstallReferrerAsync())
        if (!target) return void (await AsyncStorage.setItem(ARRIVAL_SEEN_KEY, '1'))
        const lookup = await lookUpArrival(target)
        if (lookup.status === 'retry' || !live) return
        // Said once, or nothing to say: either way it is not asked again.
        await AsyncStorage.setItem(ARRIVAL_SEEN_KEY, '1')
        if (lookup.status === 'ready') setDetails(lookup.details)
      } catch (error) {
        Logger.warn('general', 'arrival:read:failed', { error })
      }
    })()
    return () => {
      live = false
    }
  }, [])
  return details
}

/*
 * The one mapping from a server event to the shape the app holds.
 *
 * There were four of it. `lib/api.ts` had the real one and three more were
 * written by hand — two in `app/(tabs)/events.tsx` building the same
 * `checkedInEvents` list from the active check-ins payload, and they disagreed:
 * one carried the coordinates through, the other wrote `latitude: 0,
 * longitude: 0`. Both called `setCheckedInEvents`, so whether a checked-in card
 * could work out how far away it was came down to which one had run last.
 *
 * Zero is not a missing coordinate. It is a real point in the Gulf of Guinea,
 * about 700 km off Ghana, and every distance measured from it is a plausible
 * four-digit number rather than an obvious error — which is why nothing caught
 * this by looking at the screen.
 *
 * So the properties pinned here are the ones the copies got wrong: absent
 * fields come back null or empty, never zero, and a coordinate that *is* sent
 * survives the trip.
 */

// `lib/api.ts` reaches for both at module scope, and neither loads under
// `testEnvironment: node`. The mapper touches neither.
jest.mock('../lib/apiClient', () => ({ apiClient: {} }))
jest.mock('../lib/logger', () => ({
  Logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), journey: jest.fn() },
}))

import { eventFromApi } from '../lib/api'

const serverEvent = (over: Record<string, unknown> = {}) =>
  ({
    id: 'e1',
    title: 'Jazz at the Pier',
    startTime: '2026-09-01T18:00:00.000Z',
    endTime: '2026-09-01T22:00:00.000Z',
    ...over,
  }) as never

describe('eventFromApi', () => {
  it('keeps a coordinate that was sent', () => {
    const e = eventFromApi(serverEvent({ latitude: 12.9716, longitude: 77.5946 }))
    expect(e.latitude).toBe(12.9716)
    expect(e.longitude).toBe(77.5946)
  })

  it('returns null for a coordinate that was not sent, never zero', () => {
    // The bug. `0` reads as a valid coordinate to every caller downstream;
    // `null` fails the `if (!event.latitude)` guard they all already have.
    const e = eventFromApi(serverEvent())
    expect(e.latitude).toBeNull()
    expect(e.longitude).toBeNull()
  })

  it('defaults the fields the hand-written copies left off entirely', () => {
    /*
     * These were absent rather than wrong, which is worse: `undefined` on a
     * card renders as nothing and looks like an event with no favourites and
     * no category rather than one the mapper forgot.
     */
    const e = eventFromApi(serverEvent())
    expect(e.is_favorited).toBe(false)
    expect(e.favorite_count).toBe(0)
    expect(e.interested_preview).toEqual([])
    expect(e.media).toEqual([])
    expect(e.user_checkin).toBeNull()
    expect(e.timezone).toBe('UTC')
    expect(e.check_in_radius).toBe(100)
  })

  it('reads the category family from the parent, not the leaf', () => {
    // Events are tagged to leaves, so grouping on `category` can only ever
    // match that one leaf. The parent slug is what "everything musical" means.
    const e = eventFromApi(
      serverEvent({
        categories: [{ name: 'Classical and Carnatic', slug: 'classical', parent: { slug: 'music' } }],
      })
    )
    expect(e.category).toBe('Classical and Carnatic')
    expect(e.category_group).toBe('music')
  })

  it('falls back to the leaf slug when the category is already top level', () => {
    // So a caller can group on `category_group` alone without special-casing.
    const e = eventFromApi(serverEvent({ categories: [{ name: 'Nightlife', slug: 'nightlife' }] }))
    expect(e.category_group).toBe('nightlife')
  })

  it('passes a null city through rather than inventing a string', () => {
    // `resolveDisplayCity` is what decides what to print, and it needs to be
    // able to tell "no city" from "a city named something".
    expect(eventFromApi(serverEvent({ city: null })).city).toBeNull()
    expect(eventFromApi(serverEvent({ city: 'Saarbrücken' })).city).toBe('Saarbrücken')
  })
})

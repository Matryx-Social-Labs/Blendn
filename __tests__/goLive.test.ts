import AsyncStorage from '@react-native-async-storage/async-storage'

import {
  choiceLabel,
  countdownLabel,
  countdownSpoken,
  EXPIRY_PROMPT_LEAD_MS,
  goLiveRefusal,
  liveCountLine,
  liveEndedMessage,
  markLivePrompted,
  promptDelayMs,
  readLiveSession,
  rememberLiveSession,
  remainingMs,
  venueAction,
} from '../lib/goLive'

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
)

/** Go Live on the app (plan v2 step 5): PL-CU01, PL-CU02, PL-M02's timing, D-19 on the place screen. */

const NOW = Date.parse('2026-10-09T20:00:00.000Z')
const at = (minutes: number) => new Date(NOW + minutes * 60_000).toISOString()

describe('the countdown reads the server clock (PL-CU02)', () => {
  it("counts down to the server's expiresAt, whenever it is asked", () => {
    expect(remainingMs(at(20), NOW)).toBe(20 * 60_000)
    // Asked again after the phone slept: the same expiry, less left — not 20 minutes from a tap.
    expect(remainingMs(at(20), NOW + 15 * 60_000)).toBe(5 * 60_000)
  })

  it('never goes below zero, and has nothing to count without a window', () => {
    expect(remainingMs(at(-3), NOW)).toBe(0)
    expect(remainingMs(null, NOW)).toBeNull()
    expect(remainingMs('not a date', NOW)).toBeNull()
  })

  it('reads m:ss, h:mm:ss past an hour, and rounds the last second up', () => {
    expect(countdownLabel(18 * 60_000 + 42_000)).toBe('18:42')
    expect(countdownLabel(65 * 60_000 + 9_000)).toBe('1:05:09')
    expect(countdownLabel(400)).toBe('0:01')
    expect(countdownLabel(0)).toBe('0:00')
  })

  it('speaks whole minutes', () => {
    expect(countdownSpoken(18 * 60_000 + 42_000)).toBe('19 minutes left')
    expect(countdownSpoken(30_000)).toBe('Less than a minute left')
    expect(countdownSpoken(90 * 60_000)).toBe('1 hour 30 minutes left')
  })
})

describe('the expiry prompt (PL-M02)', () => {
  it('shows five minutes before a fixed window ends', () => {
    expect(EXPIRY_PROMPT_LEAD_MS).toBe(5 * 60_000)
    expect(promptDelayMs({ expiresAt: at(20), stay: false }, NOW, false)).toBe(15 * 60_000)
    // Already inside the last five minutes: now.
    expect(promptDelayMs({ expiresAt: at(3), stay: false }, NOW, false)).toBe(0)
  })

  it('shows at most once a night, never for an ended window, never for "stay"', () => {
    expect(promptDelayMs({ expiresAt: at(20), stay: false }, NOW, true)).toBeNull()
    expect(promptDelayMs({ expiresAt: at(-1), stay: false }, NOW, false)).toBeNull()
    expect(promptDelayMs({ expiresAt: at(20), stay: true }, NOW, false)).toBeNull()
    expect(promptDelayMs({ expiresAt: null, stay: false }, NOW, false)).toBeNull()
  })

  it('remembers a prompt for the venue day it was shown on, and forgets it for a new one', async () => {
    await AsyncStorage.clear()
    await rememberLiveSession({ venueDayId: 'day-1', venueId: 'v1', venueName: 'The Humming Tree' })
    await markLivePrompted('day-1')
    // Going live again the same night (extend, or go again) keeps it asked.
    await rememberLiveSession({ venueDayId: 'day-1', venueId: 'v1', venueName: 'The Humming Tree' })
    expect((await readLiveSession())?.prompted).toBe(true)
    // Tomorrow's room is another night.
    await rememberLiveSession({ venueDayId: 'day-2', venueId: 'v1', venueName: 'The Humming Tree' })
    expect(await readLiveSession()).toEqual({ venueDayId: 'day-2', venueId: 'v1', venueName: 'The Humming Tree', prompted: false })
  })

  it('remembers the window chosen, so the place offers it again in one tap after the screen is gone (PL-M05)', async () => {
    await AsyncStorage.clear()
    await rememberLiveSession({ venueDayId: 'day-1', venueId: 'v1', venueName: 'Cubbon Park Bandstand', choice: { minutes: 20 } })
    expect((await readLiveSession())?.choice).toEqual({ minutes: 20 })
    expect(choiceLabel({ minutes: 20 })).toBe('20 minutes')
    expect(choiceLabel({ stay: true })).toBe("Stay while I'm here")
  })
})

describe('the live count on the place screen is a bucket, never a number (D-19)', () => {
  it('names the bucket for somebody looking in', () => {
    expect(liveCountLine('quiet', false)).toBe('Under 5 live here')
    expect(liveCountLine('5-9', false)).toBe('5–9 live here')
    expect(liveCountLine('10-19', false)).toBe('10–19 live here')
    expect(liveCountLine('20+', false)).toBe('20+ live here')
  })

  it("reads as the others for somebody live — the server's figure never counts you", () => {
    expect(liveCountLine('quiet', true)).toBe('You and under 5 others')
    expect(liveCountLine('5-9', true)).toBe('You and 5–9 others')
    expect(liveCountLine('20+', true)).toBe('You and 20+ others')
  })

  it('says nothing for a viewer the server gives no figure', () => {
    expect(liveCountLine(null, false)).toBeNull()
  })

  it('never carries a figure below the floor', () => {
    for (const bucket of ['quiet', '5-9', '10-19', '20+'] as const) {
      for (const live of [true, false]) {
        expect(liveCountLine(bucket, live)).not.toMatch(/(^|[^–\d])[0-4]($|[^\d])/)
      }
    }
  })
})

describe('what the place screen offers', () => {
  const live = { open: true, closedReason: null, eventId: null, youAreLive: false }

  it('Go Live when the door is open; the live state when you are live', () => {
    expect(venueAction(live)).toEqual({ kind: 'goLive' })
    expect(venueAction({ ...live, youAreLive: true })).toEqual({ kind: 'live' })
    // Live already, and an event starts within the hour: your window stands until it ends.
    expect(venueAction({ ...live, open: false, closedReason: 'event_live_here', eventId: 'e1', youAreLive: true })).toEqual({ kind: 'live' })
  })

  it("hands off to the event when one has the place, and says why when nobody drew its area", () => {
    expect(venueAction({ ...live, open: false, closedReason: 'event_live_here', eventId: 'e1' })).toEqual({ kind: 'handoff', eventId: 'e1' })
    expect(venueAction({ ...live, open: false, closedReason: 'no_check_in_area' })).toMatchObject({ kind: 'closed', message: expect.stringMatching(/no check-in area/) })
  })
})

describe("a refused Go Live is read by its code, never its sentence (PL-CU01)", () => {
  it('EVENT_LIVE_HERE is a hand-off to the event, not an error', () => {
    expect(goLiveRefusal('EVENT_LIVE_HERE', 'Friday session is on here. Check in to it instead.', 'e1')).toEqual({
      kind: 'handoff',
      eventId: 'e1',
      message: 'Friday session is on here. Check in to it instead.',
    })
  })

  it('PLUS_REQUIRED opens the Plus placeholder', () => {
    expect(goLiveRefusal('PLUS_REQUIRED', 'Staying live is part of Blendn+.')).toEqual({ kind: 'plus' })
  })

  it("keeps the server's sentence and offers a map only when you are in the wrong place", () => {
    expect(goLiveRefusal('OUT_OF_RANGE', "You're not at The Humming Tree yet.")).toEqual({
      kind: 'refused',
      title: 'Not quite there yet',
      message: "You're not at The Humming Tree yet.",
      offerDirections: true,
    })
    expect(goLiveRefusal('AGE_RESTRICTED', 'Blendn is for adults.')).toMatchObject({ title: 'Not open to you', offerDirections: false })
    expect(goLiveRefusal('FORBIDDEN', 'Finish onboarding.')).toMatchObject({ title: 'Finish your profile first', offerDirections: false })
    expect(goLiveRefusal('NOT_FOUND', 'Venue not found')).toMatchObject({ title: "This place isn't available" })
    expect(goLiveRefusal('RATE_LIMITED', 'Slow down.')).toMatchObject({ title: 'Too many tries' })
  })

  it('an unknown code still shows the sentence; an event hand-off without its id is not a hand-off', () => {
    expect(goLiveRefusal(undefined, 'Something specific')).toMatchObject({ kind: 'refused', title: "Couldn't go live", message: 'Something specific' })
    expect(goLiveRefusal(undefined, undefined)).toMatchObject({ message: expect.stringMatching(/try again/) })
    expect(goLiveRefusal('EVENT_LIVE_HERE', 'On here.', null)).toMatchObject({ kind: 'refused' })
  })
})

describe('live:ended says what happened, and nothing for an end you made', () => {
  it('names the place', () => {
    expect(liveEndedMessage('expired', 'Cubbon Park Bandstand')).toBe("You're no longer live at Cubbon Park Bandstand.")
    expect(liveEndedMessage('event_started', null)).toMatch(/^An event just started\./)
    expect(liveEndedMessage('manual', 'X')).toBeNull()
    expect(liveEndedMessage('switched_event', 'X')).toBeNull()
  })
})

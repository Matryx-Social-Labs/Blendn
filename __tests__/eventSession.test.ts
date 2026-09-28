/*
 * A multi-day event is live on its days, not for its whole run.
 *
 * Staging, 2026-09-28 23:05 IST, "Bengaluru Design Festival 2026"
 * (`blr-design-festival`): three days of 00:45–08:45 IST, day 3 cancelled.
 * Day 2 had ended at 08:45. The Going tab said "Happening now", Tonight said
 * LIVE and YOU'RE GOING, and the Scene offered "Blend in" — every one judged by
 * `start_time`/`end_time`, the whole run, which still had a (cancelled) day
 * left. The door goes by the day and refused.
 *
 * The server now sends `session`, the day the door goes by. These are the
 * staging rows, with and without it.
 */

jest.mock('../lib/apiClient', () => ({ apiClient: {} }))
jest.mock('../lib/logger', () => ({
  Logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(), journey: jest.fn() },
}))

import { eventFromApi } from '../lib/api'
import { liveWindow, sessionFromApi, sessionOver } from '../lib/eventSession'
import { nextUpLabel, HAPPENING_NOW } from '../lib/pulse'
import { pickTonight, startsLabel } from '../lib/roomMoments'
import { pickInsideEvent, pickTodayEvents } from '../lib/roomButton'
import { rsvpEventRows } from '../lib/savedEvents'

const NOW = new Date('2026-09-28T17:35:00Z').getTime() // 23:05 IST

const RUN = { startTime: '2026-09-26T19:15:00.000Z', endTime: '2026-09-29T03:15:00.000Z' }
const DAY_2 = { startTime: '2026-09-27T19:15:00.000Z', endTime: '2026-09-28T03:15:00.000Z' }

/** The festival as `GET /events` sends it, `session` as the server computes it at 23:05. */
const festival = (session: typeof DAY_2 | null | undefined) =>
  eventFromApi({
    id: 'fest',
    title: 'Bengaluru Design Festival 2026',
    ...RUN,
    ...(session !== undefined && { session }),
    // Standing inside the fence, 12.9982,77.5920.
    distance: 0.05,
    checkInRadius: 400,
    isFavorited: true,
  } as never)

describe('the staging report: day 2 over, day 3 cancelled', () => {
  const e = festival(DAY_2)

  it('the window is day 2, which has ended', () => {
    expect(liveWindow(e)).toEqual({ start_time: DAY_2.startTime, end_time: DAY_2.endTime })
    expect(sessionOver(e, NOW)).toBe(true)
  })

  it('Tonight does not list it, and would not call it LIVE', () => {
    const w = liveWindow(e)
    const row = { id: e.id, startsAt: w.start_time, endsAt: w.end_time, distanceKm: 0.05, going: true }
    expect(pickTonight([row], NOW)).toEqual([])
    expect(startsLabel(row, NOW).kind).toBe('ended')
  })

  it('the Going hero does not say Happening now', () => {
    const [row] = rsvpEventRows({ events: [{ ...RUN, session: DAY_2, id: 'fest', title: 't', status: 'published', rsvpStatus: 'going' }] })
    const w = liveWindow(row)
    expect(nextUpLabel(w.start_time, w.end_time, new Date(NOW))).not.toBe(HAPPENING_NOW)
    expect(sessionOver(row, NOW)).toBe(true)
  })

  it('the centre button does not offer a check-in, and it is not "tonight"', () => {
    expect(pickInsideEvent([e], NOW)).toBeNull()
    expect(pickTodayEvents([e], NOW)).toEqual([])
  })

  it('reproduces the bug without the session: the run reads as live', () => {
    const old = festival(undefined)
    expect(nextUpLabel(old.start_time, old.end_time, new Date(NOW))).toBe(HAPPENING_NOW)
    expect(pickInsideEvent([old], NOW)).toBe('fest')
  })
})

describe('the other days of a run', () => {
  it('during day 2 it is live, and inside the fence it is a check-in', () => {
    const during = new Date('2026-09-27T22:00:00Z').getTime()
    const e = festival(DAY_2)
    expect(nextUpLabel(liveWindow(e).start_time, liveWindow(e).end_time, new Date(during))).toBe(HAPPENING_NOW)
    expect(pickInsideEvent([e], during)).toBe('fest')
  })

  it('between days the window is the next day, so it reads as upcoming', () => {
    const between = new Date('2026-09-27T10:00:00Z').getTime()
    const e = festival(DAY_2)
    const w = liveWindow(e)
    expect(startsLabel({ startsAt: w.start_time, endsAt: w.end_time }, between).kind).not.toBe('live')
    expect(pickInsideEvent([e], between)).toBeNull()
    expect(sessionOver(e, between)).toBe(false)
  })

  it('every day cancelled reads as over', () => {
    const e = festival(null)
    expect(sessionOver(e, new Date('2026-09-27T22:00:00Z').getTime())).toBe(true)
    expect(pickInsideEvent([e], new Date('2026-09-27T22:00:00Z').getTime())).toBeNull()
  })
})

describe('sessionFromApi', () => {
  it('keeps "not sent" and "none" apart', () => {
    expect(sessionFromApi(undefined)).toBeUndefined()
    expect(sessionFromApi(null)).toBeNull()
    expect(sessionFromApi(DAY_2)).toEqual({ start_time: DAY_2.startTime, end_time: DAY_2.endTime })
  })

  it('an older server with no session keeps the run as the window', () => {
    const e = festival(undefined)
    expect(liveWindow(e)).toEqual({ start_time: RUN.startTime, end_time: RUN.endTime })
  })
})

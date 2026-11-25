jest.mock('expo-router', () => ({ router: { push: jest.fn() } }))
jest.mock('../lib/apiClient', () => ({ apiClient: { queuedRequest: jest.fn() }, TokenStorage: {} }))
jest.mock('../lib/logger', () => ({ Logger: { debug: jest.fn(), warn: jest.fn(), error: jest.fn(), info: jest.fn() } }))

import { apiClient } from '../lib/apiClient'
import { notificationTarget } from '../lib/notifications'
import {
  codeIsFresh,
  codeLife,
  endedLine,
  knownLine,
  LIVE_LEVEL,
  maybeLaterKey,
  nextRefreshMs,
  OFFER_REPORT_REASONS,
  REGULAR_COPY,
  offersApi,
  offerStateLine,
  passView,
  spacedCode,
  validUntil,
  validityLine,
  LIVE_FOOT,
} from '../lib/offers'

/**
 * Step 12 on the app: an offer's push opens the offer (the push names no
 * place), the pass refreshes before its code turns, and "Maybe later" never
 * reaches the server — only an explicit yes does (RG-I02).
 */
describe('an offer from a place', () => {
  it('opens the offer from its push, and somewhere sensible without an id', () => {
    expect(notificationTarget({ type: 'venue_offer', offerId: 'o1' })).toEqual({ pathname: '/offer/[id]', params: { id: 'o1' } })
    expect(notificationTarget({ type: 'venue_offer' })).toBe('/(tabs)/events')
  })

  it('asks again a second before the code turns, never later than 10 s, never sooner than 1 s', () => {
    const now = Date.parse('2026-10-11T20:00:10Z')
    expect(nextRefreshMs('2026-10-11T20:00:30Z', now)).toBe(10_000)
    expect(nextRefreshMs('2026-10-11T20:00:15Z', now)).toBe(4_000)
    expect(nextRefreshMs('2026-10-11T20:00:10.500Z', now)).toBe(1_000)
    expect(nextRefreshMs(null, now)).toBe(10_000)
  })

  it('drains the bar over the code’s 30 seconds', () => {
    const now = Date.parse('2026-10-11T20:00:15Z')
    expect(codeLife('2026-10-11T20:00:30Z', now)).toBe(0.5)
    expect(codeLife('2026-10-11T20:00:10Z', now)).toBe(0)
    expect(codeLife(null, now)).toBe(0)
  })

  it('reads the code as two groups of three', () => {
    expect(spacedCode('K7Q4M2')).toBe('K7Q 4M2')
  })

  it('says what became of an offer that can no longer be shown', () => {
    expect(offerStateLine('live', 'Toit')).toBeNull()
    expect(offerStateLine('redeemed', 'Toit')).toBe('Redeemed. Enjoy it.')
    expect(offerStateLine('used_tonight', 'Toit')).toMatch(/Toit tonight — one a night/)
    expect(offerStateLine('ended', 'Toit')).toBe('This offer has ended.')
  })

  it('sends only the choice that changed: a yes is `known: true`, and nothing else rides along', async () => {
    const request = apiClient.queuedRequest as jest.Mock
    request.mockResolvedValue({ success: true, data: { known: true, offersMuted: false } })
    await offersApi.setPrefs('v1', { known: true })
    expect(request).toHaveBeenLastCalledWith('/api/mobile/venues/v1/regular', { method: 'PUT', body: '{"known":true}' }, true, 2)
  })

  it('says which organisation would see a yes (M2)', () => {
    expect(knownLine({ ownerName: 'Indiranagar Hospitality' }, 'Toit')).toBe(
      'Indiranagar Hospitality, who runs Toit on Blendn, will see that a regular was here, and how many nights in the last 30 days.'
    )
    expect(knownLine({ ownerName: null }, 'Toit')).toMatch(/^Toit will see that a regular was here/)
  })

  it('never promises the venue a name (SCRUM-888): hosts see "A regular · N nights" only (SCRUM-887)', () => {
    for (const text of [knownLine({ ownerName: null }, 'Toit'), REGULAR_COPY.sees, REGULAR_COPY.why]) expect(text).not.toMatch(/name/i)
    expect(REGULAR_COPY.wontSee).toMatch(/^who you are,/)
  })

  it('shows a code only until two seconds past its turn (L2)', () => {
    const turn = '2026-10-11T20:00:30Z'
    expect(codeIsFresh(turn, Date.parse('2026-10-11T20:00:29Z'))).toBe(true)
    expect(codeIsFresh(turn, Date.parse('2026-10-11T20:00:31.900Z'))).toBe(true)
    expect(codeIsFresh(turn, Date.parse('2026-10-11T20:00:32Z'))).toBe(false)
    expect(codeIsFresh(null, Date.parse('2026-10-11T20:00:00Z'))).toBe(false)
  })

  it('remembers "Maybe later" per place, and reports and the global switch go where the server expects (L9, M5, M6)', async () => {
    expect(maybeLaterKey('v1')).toBe('blendn.offers.maybeLater.v1')
    const request = apiClient.queuedRequest as jest.Mock
    request.mockResolvedValue({ success: true, data: {} })
    await offersApi.report('o1', 'misleading')
    expect(request).toHaveBeenLastCalledWith('/api/mobile/offers/o1/report', { method: 'POST', body: '{"reason":"misleading"}' }, true, 2)
    // One switch carries both answers: the audience and the push's yes (SCRUM-628, App Store 4.5.4).
    await offersApi.setOffersFromPlaces(false)
    expect(request).toHaveBeenLastCalledWith('/api/mobile/me/offers', { method: 'PUT', body: '{"enabled":false,"pushes":false}' }, true, 2)
    await offersApi.setOffersFromPlaces(true)
    expect(request).toHaveBeenLastCalledWith('/api/mobile/me/offers', { method: 'PUT', body: '{"enabled":true,"pushes":true}' }, true, 2)
  })
})

describe('the pass’s face (passView)', () => {
  const venue = { id: 'v1', name: 'Toit' }
  const turn = '2026-10-11T20:00:30Z'
  const live = { state: 'live', venue, pass: { code: 'K7Q4M2', rotatesAt: turn } } as const
  const at = (s: string) => Date.parse(s)

  it('live with a fresh code: the code, the disc part full, the server’s sentence', () => {
    expect(passView(live, at('2026-10-11T20:00:10Z'), false)).toMatchObject({
      door: 'live',
      level: LIVE_LEVEL,
      spent: false,
      stamp: null,
      foot: 'Works once, today. Staff type the code and tap Redeemed.',
    })
  })

  it('live with a stale code: no code (L2) — it needs a connection after a failed ask, else a fresh one is coming', () => {
    const stale = at('2026-10-11T20:00:33Z')
    expect(passView(live, stale, true)).toMatchObject({ door: 'offline', foot: 'This offer code needs a connection to show.' })
    expect(passView(live, stale, false)).toMatchObject({ door: 'offline', foot: 'Getting a fresh code…' })
  })

  it('live with no pass at all is the same as a stale one', () => {
    expect(passView({ state: 'live', venue, pass: null }, at('2026-10-11T20:00:10Z'), false).door).toBe('offline')
  })

  it('redeemed: full, stamped (with the time when the server gives it), the code gone', () => {
    expect(passView({ state: 'redeemed', venue, pass: null }, 0, false)).toMatchObject({ door: 'redeemed', level: 1, stamp: 'Redeemed', redeemedClock: undefined, foot: 'Redeemed. Enjoy it.' })
    expect(passView({ state: 'redeemed', venue, pass: null, redeemedAt: '2026-10-11T19:43:00Z' }, 0, false).stamp).toMatch(/^Redeemed \d{1,2}:\d{2}/)
  })

  it('used tonight: full, still, stamped; ended: empty, still, nothing to stamp', () => {
    expect(passView({ state: 'used_tonight', venue, pass: null }, 0, false)).toMatchObject({ door: 'used', level: 1, spent: true, stamp: 'Used tonight' })
    expect(passView({ state: 'ended', venue, pass: null }, 0, false)).toMatchObject({ door: 'ended', level: 0, spent: true, stamp: null, foot: 'This offer has ended.' })
  })

  it('names how long an offer runs', () => {
    expect(validUntil('2026-10-18T12:00:00Z')).toMatch(/^until /)
  })

  /*
   * Flow 4 audit B-1 (SCRUM-1045): an ended pass said "Valid today, till 9:52 AM" in its validity slot. The slot says
   * when it ended instead, in the one date grammar (`dayWord`), on the venue's own day and clock, with no zone named.
   */
  describe('the validity slot of an ended pass says when it ended (audit B-1)', () => {
    const NBSP = '\u00A0'
    // 11:30 AM in Bengaluru, 2 AM in Toronto, 11 PM the day before in Vancouver.
    const now = Date.parse('2026-10-18T06:00:00Z')
    const ended = '2026-10-18T04:22:00Z'

    it('earlier today, on the venue’s clock: "Ended today at 9:52 AM"', () => {
      expect(endedLine(ended, now, 'Asia/Kolkata')).toBe(`Ended today at 9:52${NBSP}AM`)
      // Control: the same moment is a different day and clock in another city.
      expect(endedLine(ended, now, 'America/Toronto')).toBe(`Ended today at 12:22${NBSP}AM`)
    })

    it('from 5 PM it is the grammar’s "tonight"', () => {
      expect(endedLine(ended, now, 'America/Vancouver')).toBe(`Ended tonight at 9:22${NBSP}PM`)
    })

    it('the day before: "Ended yesterday at …"; further back, the day itself', () => {
      expect(endedLine('2026-10-17T04:22:00Z', now, 'Asia/Kolkata')).toBe(`Ended yesterday at 9:52${NBSP}AM`)
      expect(endedLine('2026-10-11T04:22:00Z', now, 'Asia/Kolkata')).toBe('Ended Sun 11 Oct')
    })

    it('an offer ended before its end (its venue retired or changed hands) names no time it cannot know', () => {
      expect(endedLine('2026-10-20T04:22:00Z', now, 'Asia/Kolkata')).toBeNull()
    })
  })

  it('an offer that ends today says so with its clock, in its own slot (Flow 4 polish: "Valid today, till 11 PM")', () => {
    const now = new Date(2026, 9, 18, 20, 0).getTime()
    expect(validityLine(new Date(2026, 9, 18, 23, 0).toISOString(), now)).toBe('Valid today, till 11 PM')
    // Control: one that runs past today names its day.
    expect(validityLine(new Date(2026, 9, 21, 23, 0).toISOString(), now)).toMatch(/^Valid until \w{3} 21 Oct$/)
  })
  it('a live offer’s day and clock are the venue’s, not the phone’s', () => {
    const now = Date.parse('2026-10-18T06:00:00Z')
    expect(validityLine('2026-10-18T17:30:00Z', now, 'Asia/Kolkata')).toBe('Valid today, till 11 PM')
    expect(validityLine('2026-10-18T17:30:00Z', now, 'America/Toronto')).toBe('Valid today, till 1:30 PM')
  })
  it('the pass says it works once, and how staff take it', () => {
    expect(LIVE_FOOT).toBe('Works once, today. Staff type the code and tap Redeemed.')
  })
})

describe('reporting an offer', () => {
  it('offers the five reasons the server takes, in the design’s order', () => {
    expect(OFFER_REPORT_REASONS.map((r) => r.value)).toEqual(['offensive', 'misleading', 'spam', 'unsafe', 'other'])
    expect(OFFER_REPORT_REASONS.map((r) => r.label)).toEqual(['Offensive', 'Misleading', 'Spam', 'Feels unsafe', 'Something else'])
  })
})

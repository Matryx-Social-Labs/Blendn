/*
 * Room info (Flow 5 C6, I-A): who the sheet names as host, the event's line, and the exact count.
 */
import { hereNowCount, roomHost, roomInfoLine } from '../lib/roomInfo'

describe('roomHost: the org, never a person, never the platform standing in', () => {
  it('names the organisation the server sends', () => {
    expect(roomHost({ id: 'u-org', name: 'Nightshift Collective' })).toEqual({ name: 'Nightshift Collective' })
  })

  // Control: the server's platform answer (a curated event nobody claimed is "Blendn", a venue day is the venue) has no id.
  it('no host when the platform stands in (id null), even with a name', () => {
    expect(roomHost({ id: null, name: 'Blendn' })).toBeNull()
  })

  it('no host when there is no organizer or no name', () => {
    expect(roomHost(null)).toBeNull()
    expect(roomHost(undefined)).toBeNull()
    expect(roomHost({ id: 'u-org', name: '   ' })).toBeNull()
  })

  it('carries only the name: nothing a person-shaped row could draw (no photo, no id)', () => {
    expect(Object.keys(roomHost({ id: 'u-org', name: 'Nightshift Collective', image: 'https://x/y.jpg' } as never) ?? {})).toEqual(['name'])
  })
})

describe('roomInfoLine', () => {
  // 18:00 in Bengaluru (UTC+5:30) is 12:30Z.
  const tonight = '2026-11-14T12:30:00.000Z'

  it('"Tonight · 6 PM · High Ultra Lounge", in the event city’s clock', () => {
    expect(roomInfoLine({ startTime: tonight, timezone: 'Asia/Kolkata', venueName: 'High Ultra Lounge' })).toBe('Tonight · 6 PM · High Ultra Lounge')
  })

  it('a festival says tonight’s session, not its first night', () => {
    expect(roomInfoLine({ startTime: '2026-11-12T04:30:00.000Z', session: { startTime: tonight }, timezone: 'Asia/Kolkata', venueName: 'Palace Grounds' })).toBe(
      'Tonight · 6 PM · Palace Grounds'
    )
  })

  it('no venue: the time alone; no time: the venue alone', () => {
    expect(roomInfoLine({ startTime: tonight, timezone: 'Asia/Kolkata', venueName: null })).toBe('Tonight · 6 PM')
    expect(roomInfoLine({ startTime: null, venueName: 'High Ultra Lounge' })).toBe('High Ultra Lounge')
  })
})

describe('hereNowCount', () => {
  it('the number in full, grouped (the bar says 12k, the sheet 12,480)', () => {
    expect(hereNowCount(12480)).toBe('12,480')
    expect(hereNowCount(214)).toBe('214')
  })
  it('nothing under the floor', () => expect(hereNowCount(null)).toBeNull())
})

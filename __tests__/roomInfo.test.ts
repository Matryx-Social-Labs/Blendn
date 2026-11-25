/*
 * Room info (Flow 5 C6, I-A): who the sheet names as host, the event's line, and the exact count.
 */
import { byLine, hereNowCount, roomHost, roomInfoLine } from '../lib/roomInfo'

describe('roomHost: the org, never a person, never the platform or a venue standing in (C6 D2 A)', () => {
  it('names the organisation the server sends (kind "org")', () => {
    expect(roomHost({ id: 'u-org', name: 'Nightshift Collective', kind: 'org' })).toEqual({ name: 'Nightshift Collective' })
  })

  // The server's other kinds carry a name, and a person's is somebody's own: none of them is a host to name.
  it.each(['person', 'venue', 'platform'] as const)('no host for kind "%s", even with an id and a name', (kind) => {
    expect(roomHost({ id: 'u-1', name: 'Priya Raman', kind })).toBeNull()
  })

  // Control: the id is not the rule any more. A person's event has an id (the creator), and that was drawn as Host.
  it('no host without a kind, even with an id (an older server)', () => {
    expect(roomHost({ id: 'u-org', name: 'Nightshift Collective' })).toBeNull()
  })

  it('no host when there is no organizer or no name', () => {
    expect(roomHost(null)).toBeNull()
    expect(roomHost(undefined)).toBeNull()
    expect(roomHost({ id: 'u-org', name: '   ', kind: 'org' })).toBeNull()
  })

  it('carries only the name: nothing a person-shaped row could draw (no photo, no id)', () => {
    expect(Object.keys(roomHost({ id: 'u-org', name: 'Nightshift Collective', kind: 'org', image: 'https://x/y.jpg' } as never) ?? {})).toEqual(['name'])
  })
})

describe('byLine: the event page signs for the org, the venue and Blendn, never for a person', () => {
  it.each([['org', 'Nightshift Collective'], ['venue', 'Toit'], ['platform', 'Blendn']] as const)('kind "%s" signs its name', (kind, name) => {
    expect(byLine({ kind, name: `  ${name} ` })).toBe(name)
  })
  it('a person’s own event, a missing kind or a blank name: no line', () => {
    expect(byLine({ kind: 'person', name: 'Priya Raman' })).toBeNull()
    expect(byLine({ name: 'Priya Raman' })).toBeNull()
    expect(byLine({ kind: 'org', name: ' ' })).toBeNull()
    expect(byLine(null)).toBeNull()
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

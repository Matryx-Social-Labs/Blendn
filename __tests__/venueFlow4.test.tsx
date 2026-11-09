/**
 * Flow 4 V-A (owner's pick 2026-11-05, `flow-4/screens.js` venueA): the hours line in its own slot, only when known; the
 * date stamp the Coming up rows lead with; the dock's three states.
 */
import { render, screen } from '@testing-library/react-native'

import { DateStamp } from '../components/ds/DateStamp'
import { hoursLine, venueDockLine } from '../lib/venuePage'

const IST = 'Asia/Kolkata'
// Sat 15 Nov 2025, 21:00 IST.
const NINE_PM = Date.parse('2025-11-15T15:30:00Z')
const SAT = 6
const week = (open: string, close: string) => [{ day: SAT, open, close }]
const venue = (hours: unknown) => ({ hours, dayResetHour: 6, timezone: IST }) as never

describe('hoursLine: its own line, only when the hours are known', () => {
  it('open now: "Open till 1 AM", lit', () => {
    expect(hoursLine(venue(week('18:00', '01:00')), NINE_PM)).toEqual({ text: 'Open till 1 AM', open: true })
  })
  it('before the doors: "Opens 10 PM"; after the close: "Closed today"', () => {
    expect(hoursLine(venue(week('22:00', '02:00')), NINE_PM)).toEqual({ text: 'Opens 10 PM', open: false })
    expect(hoursLine(venue(week('09:00', '17:00')), NINE_PM)).toEqual({ text: 'Closed today', open: false })
  })
  it('no hours sent, or none: no line (control: hours are)', () => {
    expect(hoursLine(venue(null), NINE_PM)).toBeNull()
    expect(hoursLine(venue([]), NINE_PM)).toBeNull()
    expect(hoursLine(venue(week('18:00', '01:00')), NINE_PM)).not.toBeNull()
  })
})

describe('venueDockLine: the state on the left, one action on the right', () => {
  it('an event on tonight: Check in to join its room', () => {
    expect(venueDockLine('handoff')).toEqual({ state: 'On here tonight', sub: 'Check in to join its room', action: { label: 'Check in', kind: 'primary', icon: 'door-open' } })
  })
  it('nothing on: a lit Go live (a world action, not a purchase)', () => {
    expect(venueDockLine('goLive')).toEqual({ state: 'Nothing on here', sub: 'Go live when you’re here', action: { label: 'Go live', kind: 'lit', icon: 'radio' } })
  })
})

describe('DateStamp', () => {
  it('is text, read as the day in full', async () => {
    await render(<DateStamp iso="2026-11-17T02:30:00Z" timeZone={IST} testID="s" />)
    expect(screen.getByTestId('s').props.accessibilityLabel).toBe('Tuesday 17 November')
    for (const t of ['TUE', '17', 'NOV']) expect(screen.getByText(t, { includeHiddenElements: true })).toBeTruthy()
  })
  it('scales its type with its size (48 on the venue, 56 in Going)', async () => {
    await render(<DateStamp iso="2026-11-17T02:30:00Z" timeZone={IST} size={48} testID="s" />)
    expect(screen.getByTestId('s').props.style).toEqual(expect.arrayContaining([expect.objectContaining({ width: 48, height: 48 })]))
  })
  it('an unreadable date draws nothing', async () => {
    await render(<DateStamp iso="nope" testID="s" />)
    expect(screen.queryByTestId('s')).toBeNull()
  })
})

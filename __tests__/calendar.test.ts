jest.mock('../lib/logger', () => ({ Logger: { warn: jest.fn() } }))

import { calendarUrl } from '../lib/calendar'

describe('calendarUrl', () => {
  it('builds the Google Calendar template link in UTC', () => {
    const url = calendarUrl({
      title: 'Jazz & wine',
      start_time: '2026-09-28T14:30:00.000Z',
      end_time: '2026-09-28T18:00:00.000Z',
      venue_name: 'The Humming Tree',
      address: 'Indiranagar',
    })
    expect(url).toBe(
      'https://calendar.google.com/calendar/render?action=TEMPLATE' +
        '&text=Jazz%20%26%20wine' +
        '&dates=20260928T143000Z/20260928T180000Z' +
        '&details=The%20Humming%20Tree%0AIndiranagar'
    )
  })

  it('offers nothing for times that do not parse', () => {
    expect(calendarUrl({ title: 'x', start_time: '', end_time: '2026-09-28T18:00:00Z' })).toBeNull()
  })
})

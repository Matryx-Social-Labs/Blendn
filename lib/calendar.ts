import { Linking } from 'react-native'

import { Logger } from './logger'

export interface CalendarEvent {
  title: string
  start_time: string
  end_time: string
  venue_name?: string | null
  address?: string | null
}

/** `20260928T200000Z`: the basic ISO form Google Calendar's template link takes. */
function toCalendarStamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

/**
 * A Google Calendar "add event" link, or null when the times don't parse.
 *
 * A link rather than `expo-calendar`: it needs no permission prompt and no
 * native module, opens the calendar app where one is installed, and was
 * already what the Going tab did. Lifted out of `going.tsx` so the event page
 * can offer it the moment you say you're going.
 */
export function calendarUrl(event: CalendarEvent): string | null {
  const start = new Date(event.start_time)
  const end = new Date(event.end_time)
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) return null
  const where = [event.venue_name, event.address].filter(Boolean).join('\n')
  return (
    'https://calendar.google.com/calendar/render?action=TEMPLATE' +
    `&text=${encodeURIComponent(event.title)}` +
    `&dates=${toCalendarStamp(start)}/${toCalendarStamp(end)}` +
    `&details=${encodeURIComponent(where)}`
  )
}

export function addToCalendar(event: CalendarEvent): void {
  const url = calendarUrl(event)
  if (!url) return
  Linking.openURL(url).catch((e) => Logger.warn('events', 'Could not open the calendar link', { error: e }))
}

/**
 * Fixed English short names, for labels that must not change shape with the
 * device's locale or ICU build ("Sept" in en-GB on one engine, "Sep" on another).
 */
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/**
 * A clock time in the design's one grammar (r7 M7): "9 PM" on the hour, "9:30 PM" otherwise. Every card, chat, pass and
 * line in the app says the time this way. Built by hand: the device locale said "05:00" on a 24-hour iPhone and "5:00 AM"
 * on Android, and `Intl` time formats vary by engine. Local time, or the clock in `timeZone` when one is named (the map's
 * event times, in the city's zone). Empty for a time it can't read.
 */
export function clockTime(time: string | number | Date, timeZone?: string): string {
  const d = new Date(time)
  if (Number.isNaN(d.getTime())) return ''
  const [h, m] = timeZone ? zonedClock(d, timeZone) : [d.getHours(), d.getMinutes()]
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, '0')}` : ''} ${h < 12 ? 'AM' : 'PM'}`
}

/** The hour (0–23) and minute in a named zone; the phone's own clock if this engine cannot (no ICU). */
function zonedClock(d: Date, timeZone: string): [number, number] {
  try {
    const [h, m] = new Intl.DateTimeFormat('en-GB', { hour: 'numeric', minute: 'numeric', hourCycle: 'h23', timeZone })
      .format(d)
      .split(':')
      .map(Number)
    if (Number.isFinite(h) && Number.isFinite(m)) return [h, m]
  } catch {
    // Falls through to the local clock.
  }
  return [d.getHours(), d.getMinutes()]
}

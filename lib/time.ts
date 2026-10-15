/**
 * Fixed English short names, for labels that must not change shape with the
 * device's locale or ICU build ("Sept" in en-GB on one engine, "Sep" on another).
 */
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export const formatTimeRange = (startIso: string, endIso: string, opts?: { includeDate?: boolean; timezone?: string }) => {
  try {
    const s = new Date(startIso)
    const e = new Date(endIso)
    const tzOptions = opts?.timezone ? { timeZone: opts.timezone } : {}
    const fmtTime = (d: Date) => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', ...tzOptions })
    const time = `${fmtTime(s)} - ${fmtTime(e)}`
    if (opts?.includeDate) {
      // The day it starts. An evening that runs past midnight is that
      // evening's event: "6:00 PM - 12:00 AM, September 30" on the 29th sent
      // people to the wrong night.
      const datePart = s.toLocaleDateString(undefined, { month: 'long', day: 'numeric', ...tzOptions })
      return `${time}, ${datePart}`
    }
    return time
  } catch {
    return ''
  }
}

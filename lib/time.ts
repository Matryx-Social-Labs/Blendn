export type DateStyle = 'short' | 'medium' | 'long';

export const formatEventDateTime = (iso: string, opts?: { dateStyle?: DateStyle; showTimezoneIfDifferent?: boolean; timezone?: string }) => {
  try {
    const date = new Date(iso)
    const dateStyle = opts?.dateStyle || 'medium'
    const eventTz = opts?.timezone
    const localTz = Intl.DateTimeFormat().resolvedOptions().timeZone

    const tzOptions = eventTz ? { timeZone: eventTz } : {}

    const datePart = date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: dateStyle === 'short' ? 'short' : dateStyle === 'long' ? 'long' : 'short',
      day: 'numeric',
      ...tzOptions,
    })
    const timePart = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', ...tzOptions })

    let tzSuffix = ''
    if (opts?.showTimezoneIfDifferent && eventTz && eventTz !== localTz) {
      const tzName = getShortTimeZoneName(date, eventTz)
      if (tzName) tzSuffix = ` ${tzName}`
    }

    return `${datePart} • ${timePart}${tzSuffix}`
  } catch {
    return ''
  }
}

export const formatTimeRange = (startIso: string, endIso: string, opts?: { includeDate?: boolean; timezone?: string }) => {
  try {
    const s = new Date(startIso)
    const e = new Date(endIso)
    const tzOptions = opts?.timezone ? { timeZone: opts.timezone } : {}
    const fmtTime = (d: Date) => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', ...tzOptions })
    const time = `${fmtTime(s)} - ${fmtTime(e)}`
    if (opts?.includeDate) {
      const datePart = e.toLocaleDateString(undefined, { month: 'long', day: 'numeric', ...tzOptions })
      return `${time}, ${datePart}`
    }
    return time
  } catch {
    return ''
  }
}

const getShortTimeZoneName = (date: Date, timezone?: string): string => {
  try {
    const parts = new Intl.DateTimeFormat(undefined, { timeZoneName: 'short', ...(timezone ? { timeZone: timezone } : {}) }).formatToParts(date)
    const tz = parts.find(p => p.type === 'timeZoneName')?.value
    return tz || ''
  } catch {
    return ''
  }
}

export type DateStyle = 'short' | 'medium' | 'long';

export const formatEventDateTime = (iso: string, opts?: { dateStyle?: DateStyle; showTimezoneIfDifferent?: boolean }) => {
  try {
    const date = new Date(iso)
    const dateStyle = opts?.dateStyle || 'medium'
    const datePart = date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: dateStyle === 'short' ? 'short' : dateStyle === 'long' ? 'long' : 'short',
      day: 'numeric'
    })
    const timePart = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

    let tzSuffix = ''
    if (opts?.showTimezoneIfDifferent) {
      // If event timezone differs from local, append short tz name when available
      const localTz = Intl.DateTimeFormat().resolvedOptions().timeZone
      // Best-effort check using Intl parts
      const eventTzName = getShortTimeZoneName(date)
      if (eventTzName && localTz && !isSameTimezoneApprox(date)) {
        tzSuffix = ` ${eventTzName}`
      }
    }

    return `${datePart} • ${timePart}${tzSuffix}`
  } catch {
    return ''
  }
}

export const formatTimeRange = (startIso: string, endIso: string, opts?: { includeDate?: boolean }) => {
  try {
    const s = new Date(startIso)
    const e = new Date(endIso)
    const fmtTime = (d: Date) => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    const time = `${fmtTime(s)} - ${fmtTime(e)}`
    if (opts?.includeDate) {
      const datePart = e.toLocaleDateString(undefined, { month: 'long', day: 'numeric' })
      return `${time}, ${datePart}`
    }
    return time
  } catch {
    return ''
  }
}

const getShortTimeZoneName = (date: Date): string => {
  try {
    const parts = new Intl.DateTimeFormat(undefined, { timeZoneName: 'short' }).formatToParts(date)
    const tz = parts.find(p => p.type === 'timeZoneName')?.value
    return tz || ''
  } catch {
    return ''
  }
}

const isSameTimezoneApprox = (date: Date): boolean => {
  try {
    // Compare offset minutes; not perfect across DST boundaries but sufficient hint
    return date.getTimezoneOffset() === new Date().getTimezoneOffset()
  } catch {
    return true
  }
}



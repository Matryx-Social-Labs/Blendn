/**
 * The pre-event room (Flow 15 #8, R4.1 "The pre-event room · countdown header"):
 * an event's room is served to people going or saved, but it only opens for
 * writing a day before doors (the server's `PRE_EVENT_CHAT_HOURS`, lib/chat-window.ts).
 * Until then the header counts down to that opening — "Opens in 3h 20m" — and
 * the composer says the server's sentence.
 *
 * The server stays the authority: this only decides what the header says. A
 * send inside the window the client thinks is closed is still the server's call
 * (`lockFor` reads its refusal), and a room the client thinks is open that the
 * server refuses locks the composer from the answer.
 */

/** Hours before an event starts that its room opens. Mirrors the server's constant. */
export const PRE_EVENT_CHAT_HOURS = 24

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** When the room opens (epoch ms), or null when the event's start is not known. */
export function roomOpensAt(startTime: string | null | undefined): number | null {
  if (!startTime) return null
  const start = Date.parse(startTime)
  return Number.isNaN(start) ? null : start - PRE_EVENT_CHAT_HOURS * HOUR
}

/**
 * "3h 20m", "45m", "2d 4h": how long until the room opens, rounded up to the
 * minute so it never reads "0m" while closed. Null once it is open (or when the
 * start is unknown): the header goes back to its count with no ceremony.
 */
export function opensInLabel(startTime: string | null | undefined, now: number): string | null {
  const opensAt = roomOpensAt(startTime)
  if (opensAt === null || now >= opensAt) return null
  const minutes = Math.ceil((opensAt - now) / MINUTE)
  if (minutes >= DAY / MINUTE) {
    const days = Math.floor(minutes / (DAY / MINUTE))
    const hours = Math.floor((minutes % (DAY / MINUTE)) / 60)
    return hours ? `${days}d ${hours}h` : `${days}d`
  }
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60)
    const rest = minutes % 60
    return rest ? `${hours}h ${rest}m` : `${hours}h`
  }
  return `${minutes}m`
}

/** The label read aloud: "3 hours 20 minutes". */
export function opensInSpoken(label: string): string {
  return label
    .replace(/(\d+)d/, (_, n) => `${n} ${n === '1' ? 'day' : 'days'}`)
    .replace(/(\d+)h/, (_, n) => `${n} ${n === '1' ? 'hour' : 'hours'}`)
    .replace(/(\d+)m/, (_, n) => `${n} ${n === '1' ? 'minute' : 'minutes'}`)
}

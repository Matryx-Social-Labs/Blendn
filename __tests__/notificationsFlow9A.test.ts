/**
 * Flow 9 · Notifications, option A (owner 2026-11-17, SCRUM-1075): repeats fold into one row with a count, rows say what
 * happened, a named person with no photo is their initial, a landed request is lifted to the top of Waiting on you, a
 * cleared screen says so in one line, and the city's WhatsApp channel is India's only. Each rule has its negative control.
 */
import { cityChannel, type CityOption } from '../lib/city'
import { buildEntries, entryIndexOf } from '../lib/notificationEntries'
import type { NotificationItem } from '../lib/notificationFormat'
import { askItems, groupFeed, rowFor, withAsks } from '../lib/notificationRows'
import { refreshPhoneZone } from '../lib/time'

// The phone in UTC, so a night is the same night on every machine.
const zone = process.env.TZ
beforeAll(() => {
  process.env.TZ = 'UTC'
  refreshPhoneZone()
})
afterAll(() => {
  process.env.TZ = zone
  refreshPhoneZone()
})

// 21:00 UTC: a night out.
const NOW = Date.parse('2026-11-17T21:00:00Z')
const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR
const ago = (ms: number) => new Date(NOW - ms).toISOString()
const none = new Set<string>()

const item = (over: Partial<NotificationItem> & Pick<NotificationItem, 'id' | 'kind'>): NotificationItem => ({
  title: 'T',
  body: 'B',
  data: null,
  readAt: null,
  createdAt: ago(5 * MIN),
  ...over,
})
const fresh = (items: NotificationItem[]) => groupFeed(items, { fresh: new Set(items.map((n) => n.id)), resolved: none, now: NOW }).fresh

const wave = (i: number, minutesAgo: number) =>
  item({ id: `w${i}`, kind: 'match', title: 'You both waved', createdAt: ago(minutesAgo * MIN), display: { visual: { type: 'creature', pseudonym: `Fox ${i}` } } })
const CREW = 'Thiruvananthapuram Night Owls'
const arrival = (id: string, crewId: string, minutesAgo: number, body = 'Asha is in.') =>
  item({ id, kind: 'crew_here', title: CREW, body, createdAt: ago(minutesAgo * MIN), data: { type: 'crew_here', crewId, chatGroupId: `room-${crewId}` } })
const reminder = (id: string, eventId: string, daysAgo: number) =>
  item({ id, kind: 'event_update', title: 'BFlat Weekly', body: 'Starting in ~60 minutes at BFlat Bar', createdAt: ago(daysAgo * DAY + MIN), data: { type: 'event_update', eventId } })

describe('repeats fold into one row with a count', () => {
  it('15 “You both waved” tonight are one row: “15 people waved back”, two faces and +13, the latest time', () => {
    const rows = fresh(Array.from({ length: 15 }, (_, i) => wave(i, 5 + i)))
    expect(rows).toHaveLength(1)
    expect(rows[0].title).toBe('15 people waved back')
    expect(rows[0].context).toBe('Tonight · latest 5 min ago')
    expect(rows[0].visual).toEqual({ type: 'stack', people: [{ pseudonym: 'Fox 0' }, { pseudonym: 'Fox 1' }], extra: 13 })
    expect(rows[0].id).toBe('w0')
    expect(rows[0].folded).toHaveLength(15)
  })

  it('negative control: one wave is its own row, as the server wrote it', () => {
    const [row] = fresh([wave(0, 5)])
    expect(row.title).toBe('You both waved')
    expect(row.folded).toBeUndefined()
  })

  it('waves on two nights are two rows; a wave at 2 AM belongs to the night before', () => {
    const lastNight = item({ ...wave(9, 0), id: 'old', createdAt: '2026-11-17T02:00:00Z' })
    const rows = fresh([wave(0, 5), wave(1, 6), lastNight, { ...lastNight, id: 'old2', createdAt: '2026-11-16T22:00:00Z' }])
    expect(rows.map((r) => r.title)).toEqual(['2 people waved back', '2 people waved back'])
    expect(rows[1].context).toBe('Last night · latest 19 h ago')
  })

  it('folds New and Earlier apart: a seen wave never hides an unseen one', () => {
    const g = groupFeed([wave(0, 5), wave(1, 6)], { fresh: new Set(['w0']), resolved: none, now: NOW })
    expect(g.fresh.map((r) => r.title)).toEqual(['You both waved'])
    expect(g.earlier.map((r) => r.title)).toEqual(['You both waved'])
  })

  it('six reminders for one weekly event are the latest only; another event keeps its own', () => {
    const rows = fresh([...[0, 7, 14, 21, 28, 35].map((d) => reminder(`r${d}`, 'bflat', d)), reminder('x', 'other', 1)])
    expect(rows.map((r) => r.id)).toEqual(['r0', 'x'])
    expect(rows[0].title).toBe('Starting in ~60 minutes at BFlat Bar')
  })

  it('negative control: an event change is never folded into its reminders', () => {
    const change = item({ id: 'c', kind: 'event_changed', title: 'BFlat Weekly', body: 'Event updated: start time', data: { eventId: 'bflat', changed: 'time', reason: 'time' } })
    expect(fresh([reminder('r0', 'bflat', 0), change]).map((r) => r.id)).toEqual(['r0', 'c'])
  })
})

describe('a crew arrival says who is here (the server titles it, task 12)', () => {
  const titled = (id: string, crewId: string, minutesAgo: number, body?: string) => ({
    ...arrival(id, crewId, minutesAgo, body),
    display: { title: `Someone from ${CREW} is here` },
  })

  it('the server’s title is the row’s: “Someone from {crew} is here”', () => {
    const [row] = fresh([titled('a', 'k1', 60, 'Asha and Ravi are in.')])
    expect(row.title).toBe(`Someone from ${CREW} is here`)
    expect(row.context).toBe('1 h ago')
  })

  it('one row per crew a night is the server’s: the client folds nothing', () => {
    const rows = fresh([titled('a', 'k1', 60), titled('b', 'k1', 70)])
    expect(rows.map((r) => r.id)).toEqual(['a', 'b'])
    expect(rows[0].folded).toBeUndefined()
  })

  it('negative control: with no display (an ex-member, a crew gone), the bare crew name stands; the push’s names never reach the row', () => {
    const [row] = fresh([arrival('a', 'k1', 60, 'Asha and Ravi are in.')])
    expect(row.title).toBe(CREW)
  })

  it('the server decides which crew rows are arrivals (SCRUM-1098): its title is taken whatever the body says', () => {
    const two = { ...arrival('a', 'k1', 60, 'Asha and Ravi just walked in'), display: { title: `2 from ${CREW} are here` } }
    expect(fresh([two])[0].title).toBe(`2 from ${CREW} are here`)
  })

  it('negative control: a plan row (`data.kind: crew_plan`) comes untitled from the server, so the crew name stands', () => {
    const plan = arrival('p', 'k1', 30, 'Asha wants to go together. Open the crew to see the night.')
    const [row] = fresh([{ ...plan, data: { ...plan.data, kind: 'crew_plan' } }])
    expect(row.title).toBe(CREW)
  })
})

describe('an event change says what changed', () => {
  const change = (data: Record<string, string>) =>
    rowFor(item({ id: 'c', kind: 'event_changed', title: 'Kerala Design Festival 2026', body: 'Event updated: start time, venue', data: { eventId: 'e', ...data } }), NOW)
  const IST = 'Asia/Kolkata'
  const time = (from: string | undefined, to: string, timeZone = IST) =>
    change({ field: 'time', changed: 'time', reason: 'time', to, timeZone, ...(from && { from }) }).title

  it('the new time and the old, in the event’s zone, in the app’s clock grammar, no zone named', () => {
    // 14:30Z and 16:00Z are 8 PM and 9:30 PM in Kolkata; the phone is in UTC.
    expect(time('2026-12-01T14:30:00.000Z', '2026-12-01T16:00:00.000Z')).toBe('New time: 9:30 PM, was 8 PM')
    expect(time('2026-12-01T23:00:00.000Z', '2026-12-02T00:30:00.000Z', 'America/Toronto')).toBe('New time: 7:30 PM, was 6 PM')
  })

  it('a move to another day says the weekdays; a week or more says the dates (advisor 2026-11-21)', () => {
    // Fri 27 Nov 8 PM → Sat 28 Nov 9:30 PM in Kolkata.
    expect(time('2026-11-27T14:30:00.000Z', '2026-11-28T16:00:00.000Z')).toBe('New time: Sat 9:30 PM, was Fri 8 PM')
    expect(time('2026-11-20T14:30:00.000Z', '2026-11-28T16:00:00.000Z')).toBe('New time: 28 Nov, 9:30 PM, was 20 Nov, 8 PM')
  })

  it('the day is the event city’s, not the phone’s: 23:30 IST and 00:30 IST the next day differ in Kolkata, not in UTC', () => {
    expect(time('2026-11-27T18:00:00.000Z', '2026-11-27T19:00:00.000Z')).toBe('New time: Sat 12:30 AM, was Fri 11:30 PM')
  })

  it('negative controls: no old time, an unreadable one, or the same clock says the new time alone; an unreadable new one says “Time changed”', () => {
    expect(time(undefined, '2026-12-01T16:00:00.000Z')).toBe('New time: 9:30 PM')
    expect(time('soon', '2026-12-01T16:00:00.000Z')).toBe('New time: 9:30 PM')
    expect(time('2026-12-01T16:00:20.000Z', '2026-12-01T16:00:00.000Z')).toBe('New time: 9:30 PM')
    expect(time('2026-12-01T14:30:00.000Z', 'later')).toBe('Time changed')
  })

  it('the new place by name, never “was” (advisor: two long names do not fit two lines)', () => {
    expect(change({ field: 'venue', from: 'Old Hall', to: 'Saint-Jean-sur-Richelieu Hall', changed: 'venue' }).title).toBe('New place: Saint-Jean-sur-Richelieu Hall')
    expect(change({ field: 'venue', to: 'Toit', changed: 'venue' }).title).toBe('New place: Toit')
  })

  it('older rows with no field: the honest words for what moved', () => {
    expect(change({ changed: 'time' }).title).toBe('Time changed')
    expect(change({ changed: 'venue' }).title).toBe('Place changed')
    expect(change({ changed: 'time,venue' }).title).toBe('Time and place changed')
  })

  it('negative control: with nothing honest to say, today’s words stay', () => {
    expect(change({}).title).toBe('Event updated: start time, venue')
    expect(change({ changed: 'cancelled' }).title).toBe('Event updated: start time, venue')
  })

  it('names the event in the context line', () => {
    expect(change({ changed: 'time' }).context).toBe('Kerala Design Festival 2026 · 5 min ago')
  })
})

it('a title carries no emoji: “Message request accepted”', () => {
  expect(rowFor(item({ id: 'm', kind: 'message_request_response', title: 'Message request accepted 🎉' }), NOW).title).toBe('Message request accepted')
  expect(rowFor(item({ id: 'm', kind: 'message_request_response', title: 'Message request accepted' }), NOW).title).toBe('Message request accepted')
})

describe('a named person with no photo is their initial (personFace)', () => {
  const request = (id: string, name: string, photo: string | null = null) => ({ id, person: { userId: `u_${id}`, name, photo }, createdAt: ago(HOUR) })

  it('draws the initial and the whole name', () => {
    const [n] = askItems([request('r1', 'Marc-André Lefebvre-Desrosiers')], [])
    const row = rowFor(n, NOW)
    expect(row.visual).toEqual({ type: 'initial', name: 'Marc-André Lefebvre-Desrosiers' })
    expect(row.title).toBe('Marc-André Lefebvre-Desrosiers wants to be friends')
  })

  it('negative control: a photo is the photo, and no name is the glyph, never an invented initial', () => {
    const [photo, nameless] = askItems([request('a', 'Ravi', 'https://x/p.jpg'), request('b', '')], [])
    expect(rowFor(photo, NOW).visual).toEqual({ type: 'photo', uri: 'https://x/p.jpg', name: 'Ravi' })
    expect(rowFor(nameless, NOW).visual).toEqual({ type: 'glyph', icon: 'user-plus' })
  })

  it('a notification row for the same request is kept once, as the server wrote it', () => {
    const bare = item({ id: 'n1', kind: 'friend_request', data: { requestId: 'r1' } })
    const withFace = item({ id: 'n2', kind: 'friend_request', data: { requestId: 'r2' }, display: { visual: { type: 'photo', uri: 'https://x/own.jpg' } } })
    const merged = withAsks([bare, withFace], askItems([request('r1', 'Marc-André'), request('r2', 'Ravi', 'https://x/list.jpg')], []))
    expect(merged.map((n) => n.id)).toEqual(['n1', 'n2'])
    expect(rowFor(merged[1], NOW).visual).toEqual({ type: 'photo', uri: 'https://x/own.jpg' })
  })

  it('the server’s title and face for a request are the row’s (task 12: the full name, the initial)', () => {
    const n = item({ id: 'n1', kind: 'friend_request', data: { requestId: 'r1' }, display: { title: 'Venkata Subramanian Raghunathan Krishnamurthy wants to be friends', visual: { type: 'initial', name: 'Venkata Subramanian Raghunathan Krishnamurthy' } } })
    const [merged] = withAsks([n], askItems([request('r1', 'Venkata')], []))
    expect(rowFor(merged, NOW).title).toBe('Venkata Subramanian Raghunathan Krishnamurthy wants to be friends')
    expect(rowFor(merged, NOW).visual).toEqual({ type: 'initial', name: 'Venkata Subramanian Raghunathan Krishnamurthy' })
  })

  it('negative control: the list never rewrites a row the server titled', () => {
    const firstOnly = item({ id: 'n1', kind: 'friend_request', data: { requestId: 'r1' }, display: { title: 'Marc-André wants to be friends' } })
    const [merged] = withAsks([firstOnly], askItems([request('r1', 'Marc-André Lefebvre-Desrosiers')], []))
    expect(rowFor(merged, NOW).title).toBe('Marc-André wants to be friends')
  })
})

describe('named talk-asks and crew invites (task 12 display)', () => {
  it('a pending message request: “{full name} wants to message you”, their face, the line to where it waits', () => {
    const row = rowFor(item({ id: 'm', kind: 'message_request', open: true, display: { title: 'प्रियंका शर्मा wants to message you', visual: { type: 'initial', name: 'प्रियंका शर्मा' } } }), NOW)
    expect(row.title).toBe('प्रियंका शर्मा wants to message you')
    expect(row.visual).toEqual({ type: 'initial', name: 'प्रियंका शर्मा' })
    expect(row.context).toBe('Message requests · 5 min ago')
    expect(row.chevron).toBe(true)
    expect(row.actions).toEqual([])
  })

  it('negative control: an answered one has no display, and reads as the push did, glyph and all', () => {
    const row = rowFor(item({ id: 'm', kind: 'message_request', open: false, title: 'New message request' }), NOW)
    expect(row.title).toBe('New message request')
    expect(row.visual).toEqual({ type: 'glyph', icon: 'message-circle' })
  })

  it('a crew invite: “Crew invite: {crew}”, with Join and Decline', () => {
    const row = rowFor(item({ id: 'i', kind: 'crew_invite', data: { crewId: 'k1' }, display: { title: `Crew invite: ${CREW}`, context: CREW } }), NOW)
    expect(row.title).toBe(`Crew invite: ${CREW}`)
    expect(row.actions.map((x) => x.key)).toEqual(['join', 'decline'])
  })
})

describe('Waiting on you and the landing', () => {
  const requests = Array.from({ length: 14 }, (_, i) =>
    item({ id: `q${i}`, kind: 'friend_request', createdAt: ago((i + 1) * HOUR), data: { requestId: `r${i}` } })
  )
  const g = groupFeed(requests, { fresh: none, resolved: none, now: NOW })
  const shown = (lift?: string) => {
    const [first] = buildEntries(g, { allWaiting: false, hasMore: false, lift })
    return first.type === 'waiting' ? first.rows.map((r) => r.id) : []
  }

  it('a landed request behind See all is lifted to the top; the rest keep their order', () => {
    expect(shown('q10')).toEqual(['q10', 'q0', 'q1'])
    expect(entryIndexOf(buildEntries(g, { allWaiting: false, hasMore: false, lift: 'q10' }), 'q10')).toBe(0)
  })

  it('negative control: without a landing the 11th is behind See all', () => {
    expect(shown()).toEqual(['q0', 'q1', 'q2'])
    expect(entryIndexOf(buildEntries(g, { allWaiting: false, hasMore: false }), 'q10')).toBe(-1)
  })

  it('finds a folded row by any of the rows it holds', () => {
    const waves = groupFeed([wave(0, 5), wave(1, 6)], { fresh: new Set(['w0', 'w1']), resolved: none, now: NOW })
    expect(entryIndexOf(buildEntries(waves, { allWaiting: false, hasMore: false }), 'w1')).toBe(1)
  })
})

describe('a cleared screen says so in one line', () => {
  const waiting = groupFeed([item({ id: 'q', kind: 'friend_request', data: { requestId: 'r' } })], { fresh: none, resolved: none, now: NOW })

  it('Waiting on you, then the cleared line in place of the footnote', () => {
    const e = buildEntries(waiting, { allWaiting: false, hasMore: false, cleared: true })
    expect(e[e.length - 1]).toMatchObject({ type: 'footer', cleared: true })
  })

  it('negative control: a row that lands after the clear brings the footnote back', () => {
    const more = groupFeed([...waiting.waiting.map((r) => r.item), wave(0, 1)], { fresh: new Set(['w0']), resolved: none, now: NOW })
    const e = buildEntries(more, { allWaiting: false, hasMore: false, cleared: true })
    expect(e[e.length - 1]).toMatchObject({ type: 'footer', cleared: false })
    expect(buildEntries(waiting, { allWaiting: false, hasMore: false }).slice(-1)[0]).toMatchObject({ cleared: false })
  })
})

describe('the city’s WhatsApp channel (ruling 7: the server sends it where there is one)', () => {
  const city = (over: Partial<CityOption>): CityOption => ({ city: 'Thiruvananthapuram', eventCount: 3, country: 'IN', whatsappChannelUrl: 'https://whatsapp.com/channel/0029Va', ...over })

  it('a city with a channel has the row, whatever its country: which cities have one is data (task 12)', () => {
    expect(cityChannel(city({}))).toEqual({ city: 'Thiruvananthapuram', url: 'https://whatsapp.com/channel/0029Va' })
    expect(cityChannel(city({ city: 'Saint-Jean-sur-Richelieu', country: 'CA' }))).toEqual({ city: 'Saint-Jean-sur-Richelieu', url: 'https://whatsapp.com/channel/0029Va' })
  })

  it('negative controls: null (staging today, Canada), absent, and a link that is not WhatsApp’s have none', () => {
    expect(cityChannel(city({ country: 'CA', whatsappChannelUrl: null }))).toBeNull()
    expect(cityChannel(city({ whatsappChannelUrl: undefined }))).toBeNull()
    expect(cityChannel(city({ whatsappChannelUrl: 'https://evil.example/channel/x' }))).toBeNull()
    expect(cityChannel(city({ whatsappChannelUrl: 'http://whatsapp.com/channel/x' }))).toBeNull()
    expect(cityChannel(null)).toBeNull()
  })
})

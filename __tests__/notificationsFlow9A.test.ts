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

describe('a crew arrival says who is here, with a verb', () => {
  it('two from one crew tonight: “2 from {crew} are here”', () => {
    const rows = fresh([arrival('a', 'k1', 60), arrival('b', 'k1', 70)])
    expect(rows).toHaveLength(1)
    expect(rows[0].title).toBe(`2 from ${CREW} are here`)
    expect(rows[0].context).toBe('1 h ago')
  })

  it('one: “Someone from {crew} is here”; the push’s names never reach the row', () => {
    const [row] = fresh([arrival('a', 'k1', 60, 'Asha and Ravi are in.')])
    expect(row.title).toBe(`Someone from ${CREW} is here`)
  })

  it('negative control: two crews are two rows, and a plan push keeps its own words', () => {
    const plan = arrival('p', 'k1', 30, 'Asha wants to go together. Open the crew to see the night.')
    const rows = fresh([plan, arrival('a', 'k1', 60), arrival('b', 'k2', 70)])
    expect(rows.map((r) => r.title)).toEqual([CREW, `Someone from ${CREW} is here`, `Someone from ${CREW} is here`])
  })

  it('a title the server sends with its own verb wins', () => {
    const [row] = fresh([{ ...arrival('a', 'k1', 60), display: { title: 'Asha is here with Night Owls' } }])
    expect(row.title).toBe('Asha is here with Night Owls')
  })
})

describe('an event change says what changed', () => {
  const change = (data: Record<string, string>) =>
    rowFor(item({ id: 'c', kind: 'event_changed', title: 'Kerala Design Festival 2026', body: 'Event updated: start time, venue', data: { eventId: 'e', ...data } }), NOW)

  it('names the new value and the old one once the server sends them', () => {
    expect(change({ field: 'time', from: '8:00 PM', to: '9:30 PM', changed: 'time' }).title).toBe('New time: 9:30 PM, was 8:00 PM')
    expect(change({ field: 'venue', from: 'BFlat', to: 'Toit', changed: 'venue' }).title).toBe('New place: Toit')
  })

  it('until then, the honest words for what moved', () => {
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
    expect(rowFor(photo, NOW).visual).toEqual({ type: 'photo', uri: 'https://x/p.jpg' })
    expect(rowFor(nameless, NOW).visual).toEqual({ type: 'glyph', icon: 'user-plus' })
  })

  it('a notification row for the same request takes the list’s face where the server sent none', () => {
    const bare = item({ id: 'n1', kind: 'friend_request', data: { requestId: 'r1' } })
    const withFace = item({ id: 'n2', kind: 'friend_request', data: { requestId: 'r2' }, display: { visual: { type: 'photo', uri: 'https://x/own.jpg' } } })
    const merged = withAsks([bare, withFace], askItems([request('r1', 'Marc-André'), request('r2', 'Ravi', 'https://x/list.jpg')], []))
    expect(merged.map((n) => rowFor(n, NOW).visual)).toEqual([
      { type: 'initial', name: 'Marc-André' },
      { type: 'photo', uri: 'https://x/own.jpg' },
    ])
    expect(merged.map((n) => n.id)).toEqual(['n1', 'n2'])
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

describe('the city’s WhatsApp channel (ruling 7: India only)', () => {
  const city = (over: Partial<CityOption>): CityOption => ({ city: 'Thiruvananthapuram', eventCount: 3, country: 'IN', whatsAppChannel: 'https://whatsapp.com/channel/0029Va', ...over })

  it('an Indian city with a channel has the row', () => {
    expect(cityChannel(city({}))).toEqual({ city: 'Thiruvananthapuram', url: 'https://whatsapp.com/channel/0029Va' })
  })

  it('negative controls: Canada has none, a city with no channel yet has none, and a link that is not WhatsApp’s is refused', () => {
    expect(cityChannel(city({ city: 'Saint-Jean-sur-Richelieu', country: 'CA' }))).toBeNull()
    expect(cityChannel(city({ whatsAppChannel: undefined }))).toBeNull()
    expect(cityChannel(city({ whatsAppChannel: 'https://evil.example/channel/x' }))).toBeNull()
    expect(cityChannel(city({ whatsAppChannel: 'http://whatsapp.com/channel/x' }))).toBeNull()
    expect(cityChannel(null)).toBeNull()
  })
})

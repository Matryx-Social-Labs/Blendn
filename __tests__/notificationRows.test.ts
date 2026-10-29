import type { NotificationItem } from '../lib/notificationFormat'
import {
  arrivedUnread,
  closeAnsweredElsewhere,
  findLandingRow,
  groupFeed,
  isRequestKind,
  mergeFeed,
  notificationWhen,
  parseVisual,
  rowFor,
  WAITING_DAYS,
} from '../lib/notificationRows'

const NOW = Date.parse('2026-10-22T12:00:00Z')
const ago = (ms: number) => new Date(NOW - ms).toISOString()
const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

const item = (over: Partial<NotificationItem> & Pick<NotificationItem, 'id' | 'kind'>): NotificationItem => ({
  title: 'T',
  body: 'B',
  data: null,
  readAt: null,
  createdAt: ago(5 * MIN),
  ...over,
})

describe('notificationWhen', () => {
  it('reads the way the flow writes it', () => {
    expect(notificationWhen(ago(20_000), NOW)).toBe('Just now')
    expect(notificationWhen(ago(2 * MIN), NOW)).toBe('2 min ago')
    expect(notificationWhen(ago(3 * HOUR), NOW)).toBe('3 h ago')
    expect(notificationWhen(ago(30 * HOUR), NOW)).toBe('Yesterday')
    // 2026-10-19 is a Monday.
    expect(notificationWhen(ago(3 * DAY), NOW)).toBe('Mon')
    expect(notificationWhen(ago(10 * DAY), NOW)).toBe('12 Oct')
    expect(notificationWhen(ago(400 * DAY), NOW)).toBe('17 Sep 2025')
  })

  it('does not go backwards on a clock skew, or print NaN', () => {
    expect(notificationWhen(new Date(NOW + 5000).toISOString(), NOW)).toBe('Just now')
    expect(notificationWhen('nope', NOW)).toBe('')
  })
})

describe('a row from the stored push, which names nobody', () => {
  it('draws a glyph tile for a person, never a photo or creature it does not have', () => {
    const row = rowFor(item({ id: 'a', kind: 'friend_request', title: 'New friend request', data: { requestId: 'r1' } }), NOW)
    expect(row.visual).toEqual({ type: 'glyph', icon: 'user-plus' })
    expect(row.title).toBe('New friend request')
    expect(row.context).toBe('5 min ago')
  })

  it('asks Accept and Decline of a friend request, Join and Decline of an invite, View of the rest', () => {
    const labels = (kind: NotificationItem['kind']) => rowFor(item({ id: kind, kind }), NOW).actions.map((a) => a.label)
    expect(labels('friend_request')).toEqual(['Accept', 'Decline'])
    expect(labels('crew_invite')).toEqual(['Join', 'Decline'])
    for (const k of ['reveal_request', 'board_request', 'message_request'] as const) expect(labels(k)).toEqual(['View'])
    for (const k of ['match', 'friend_accepted', 'crew_here', 'blend', 'announcement'] as const) expect(labels(k)).toEqual([])
  })

  it('makes the first pill lit, with its glyph: Accept (user-check) and Join (users), nothing else', () => {
    expect(rowFor(item({ id: 'a', kind: 'friend_request' }), NOW).actions).toEqual([
      { key: 'accept', label: 'Accept', kind: 'lit', icon: 'user-check' },
      { key: 'decline', label: 'Decline', kind: 'secondary' },
    ])
    expect(rowFor(item({ id: 'c', kind: 'crew_invite' }), NOW).actions[0]).toEqual({ key: 'join', label: 'Join', kind: 'lit', icon: 'users' })
    expect(rowFor(item({ id: 'b', kind: 'reveal_request' }), NOW).actions.map((a) => a.kind)).toEqual(['secondary'])
  })

  // A friend request comes only through your invite link (app/f/[token]), so it is a person and a time: never an event or a room.
  it.each(['friend_request', 'friend_accepted'] as const)('%s is the person and the time, never an event or a room', (kind) => {
    const row = rowFor(item({ id: kind, kind, title: 'New friend request', body: 'Priya asked at Vinyl Night' }), NOW)
    expect(row.context).toBe('5 min ago')
    expect(row.context).not.toContain('·')
    expect(row.context).not.toContain('Vinyl')
  })

  // SCRUM-750: a request from a match says so, and only that: the match was made in a room, and the row never says which.
  describe('a friend request from a match', () => {
    const viaMatch = (extra: Partial<Parameters<typeof item>[0]> = {}) =>
      rowFor(item({ id: 'm', kind: 'friend_request', data: { requestId: 'r1', via: 'match' }, ...extra }), NOW)

    it('says "From your match" beside the time', () => {
      expect(viaMatch().context).toBe('From your match · 5 min ago')
    })

    it('keeps the Accept and Decline pills', () => {
      expect(viaMatch().actions.map((x) => x.label)).toEqual(['Accept', 'Decline'])
    })

    it('never takes an event or room from the server’s context or the body', () => {
      const row = viaMatch({ body: 'Priya asked at Vinyl Night', display: { context: 'Vinyl Night · 2 min ago' } })
      expect(row.context).toBe('From your match · 5 min ago')
      expect(row.context).not.toContain('Vinyl')
    })

    it('is the time alone for a request through your link, or any other via', () => {
      const link = rowFor(item({ id: 'l', kind: 'friend_request', data: { requestId: 'r1' } }), NOW)
      const other = rowFor(item({ id: 'o', kind: 'friend_request', data: { requestId: 'r1', via: 'link' } }), NOW)
      expect(link.context).toBe('5 min ago')
      expect(other.context).toBe('5 min ago')
    })

    it('is said of a request only, not of the accepted notice', () => {
      expect(rowFor(item({ id: 'a', kind: 'friend_accepted', data: { via: 'match' } }), NOW).context).toBe('5 min ago')
    })
  })

  it('draws an event tile with the kind’s badge for the event kinds', () => {
    expect(rowFor(item({ id: 'a', kind: 'event_update' }), NOW).visual).toMatchObject({ type: 'event', badge: 'clock', cancelled: false })
    expect(rowFor(item({ id: 'b', kind: 'announcement' }), NOW).visual).toMatchObject({ type: 'event', badge: 'megaphone' })
    expect(rowFor(item({ id: 'c', kind: 'waitlist_promoted' }), NOW).visual).toMatchObject({ type: 'event', badge: 'star' })
    expect(rowFor(item({ id: 'd', kind: 'rating_request' }), NOW).visual).toMatchObject({ type: 'event', badge: 'star' })
  })

  it('tells a venue change and a cancellation apart once the server sends the reason', () => {
    expect(rowFor(item({ id: 'a', kind: 'event_update', data: { reason: 'venue' } }), NOW).visual).toMatchObject({ badge: 'map-pin' })
    expect(rowFor(item({ id: 'b', kind: 'event_update', data: { reason: 'cancelled' } }), NOW).visual).toMatchObject({ badge: 'clock', cancelled: true })
  })

  it('writes the event kinds as the flow does: what happened, then where and when', () => {
    expect(rowFor(item({ id: 'a', kind: 'event_update', title: 'Vinyl Night', body: 'New start time: 9:30 pm' }), NOW)).toMatchObject({
      title: 'New start time: 9:30 pm',
      context: 'Vinyl Night · 5 min ago',
    })
    expect(rowFor(item({ id: 'b', kind: 'announcement', title: '📢 Vinyl Night', body: 'Doors at 9, not 8:30' }), NOW)).toMatchObject({
      title: 'From the organizer: Doors at 9, not 8:30',
      context: 'Vinyl Night · 5 min ago',
    })
    expect(rowFor(item({ id: 'c', kind: 'waitlist_promoted', title: 'You’re in', body: 'A place opened up at Toit.' }), NOW)).toMatchObject({
      title: 'You’re in: a place opened up',
      context: 'Toit · 5 min ago',
    })
    expect(rowFor(item({ id: 'd', kind: 'rating_request', title: 'Vinyl Night', body: 'How was it?' }), NOW)).toMatchObject({
      title: 'How was Vinyl Night?',
      context: '5 min ago',
    })
  })
})

// C34: a takedown of your post is told with the moderation shield, not the generic bell. Negative control: no GLYPH entry fails it.
describe('a post of yours taken down', () => {
  it('a report’s outcome draws the shield too, not the bell (SYS-06)', () => {
    expect(rowFor(item({ id: 'r', kind: 'report_actioned', title: 'We reviewed your report' }), NOW).visual).toEqual({ type: 'glyph', icon: 'shield' })
  })

  it('draws the shield glyph', () => {
    const row = rowFor(item({ id: 'm', kind: 'board_post_removed', title: 'Your post was taken down' }), NOW)
    expect(row.visual).toEqual({ type: 'glyph', icon: 'shield' })
  })
})

// C32: a match tells which match it was when the server names the counterpart the reader may see (S-2's `display.context`).
it('a match reads the server’s context, the pseudonym this reader may see', () => {
  expect(rowFor(item({ id: 'p', kind: 'match', display: { context: 'Plover · 2 min ago' } }), NOW).context).toBe('Plover · 2 min ago')
})

describe('a row with what the server resolved for the reader', () => {
  it('uses its title, context and visual', () => {
    const row = rowFor(
      item({
        id: 'a',
        kind: 'match',
        display: { title: 'You and Priya matched', context: 'Vinyl Night · 2 min ago', visual: { type: 'photo', uri: 'https://x/p.jpg' } },
      }),
      NOW
    )
    expect(row).toMatchObject({ title: 'You and Priya matched', context: 'Vinyl Night · 2 min ago', visual: { type: 'photo', uri: 'https://x/p.jpg' } })
  })

  // A friend request comes only through your invite link: whatever context the server sends, the row is the person and the time.
  it.each(['friend_request', 'friend_accepted'] as const)('%s takes the server’s title and face, never its context', (kind) => {
    const row = rowFor(
      item({
        id: 'a',
        kind,
        display: { title: 'Priya wants to be friends', context: 'Vinyl Night · 2 min ago', visual: { type: 'photo', uri: 'https://x/p.jpg' } },
      }),
      NOW
    )
    expect(row).toMatchObject({ title: 'Priya wants to be friends', context: '5 min ago', visual: { type: 'photo', uri: 'https://x/p.jpg' } })
  })

  it('falls back field by field when a part is missing or malformed', () => {
    const row = rowFor(item({ id: 'a', kind: 'match', title: 'You have a new match', display: { title: '  ', visual: { type: 'photo' } } }), NOW)
    expect(row.title).toBe('You have a new match')
    expect(row.visual).toEqual({ type: 'glyph', icon: 'heart' })
  })
})

describe('parseVisual', () => {
  it('accepts exactly the six shapes the design draws, minus the glyph tile', () => {
    expect(parseVisual({ type: 'creature', pseudonym: 'Cosmic Panda' })).toEqual({ type: 'creature', pseudonym: 'Cosmic Panda' })
    expect(parseVisual({ type: 'emblem', seed: 'abc' })).toEqual({ type: 'emblem', seed: 'abc' })
    expect(parseVisual({ type: 'event', cover: 'https://x/c.jpg', badge: 'map-pin', cancelled: true })).toEqual({
      type: 'event',
      cover: 'https://x/c.jpg',
      badge: 'map-pin',
      cancelled: true,
    })
    expect(parseVisual({ type: 'stack', people: [{ pseudonym: 'A' }, { uri: 'u' }, { nope: 1 }], extra: 2 })).toEqual({
      type: 'stack',
      people: [{ pseudonym: 'A' }, { uri: 'u' }],
      extra: 2,
    })
  })

  it('refuses anything else rather than drawing it', () => {
    for (const bad of [null, 'photo', [], { type: 'glyph', icon: 'bell' }, { type: 'event', badge: 'skull' }, { type: 'stack', people: [] }, { type: 'emblem', seed: '' }]) {
      expect(parseVisual(bad)).toBeNull()
    }
  })

  it('caps a stack at six people and drops a non-positive or fractional extra', () => {
    const people = Array.from({ length: 9 }, (_, i) => ({ pseudonym: `P${i}` }))
    expect(parseVisual({ type: 'stack', people, extra: 0 })).toMatchObject({ people: expect.any(Array), extra: undefined })
    expect((parseVisual({ type: 'stack', people }) as { people: readonly unknown[] }).people).toHaveLength(6)
    expect(parseVisual({ type: 'stack', people, extra: 1.5 })).toMatchObject({ extra: undefined })
  })
})

describe('groupFeed', () => {
  const none = new Set<string>()
  const friend = item({ id: 'fr', kind: 'friend_request', data: { requestId: 'r' } })
  const invite = item({ id: 'ci', kind: 'crew_invite', data: { crewId: 'c' } })
  const match = item({ id: 'm', kind: 'match' })
  const old = item({ id: 'o', kind: 'friend_accepted', readAt: ago(DAY), createdAt: ago(3 * DAY) })

  it('puts open requests in Waiting on you, the unseen in New and the rest in Earlier', () => {
    const g = groupFeed([friend, invite, match, old], { fresh: new Set(['m', 'fr']), resolved: none, now: NOW })
    expect(g.waiting.map((r) => r.id)).toEqual(['fr', 'ci'])
    expect(g.fresh.map((r) => r.id)).toEqual(['m'])
    expect(g.earlier.map((r) => r.id)).toEqual(['o'])
  })

  it('does not wait on a request that has lapsed, or that the server says is closed: it is history, with no pills', () => {
    const lapsed = item({ id: 'l', kind: 'friend_request', createdAt: ago((WAITING_DAYS + 1) * DAY) })
    const closed = item({ id: 'c', kind: 'friend_request', open: false })
    const g = groupFeed([lapsed, closed], { fresh: none, resolved: none, now: NOW })
    expect(g.waiting).toEqual([])
    expect(g.earlier.map((r) => r.actions)).toEqual([[], []])
  })

  it('leaves an answered request out of every section once it has left', () => {
    const g = groupFeed([friend, match], { fresh: none, resolved: new Set(['fr']), now: NOW })
    expect(g.waiting).toEqual([])
    expect(g.earlier.map((r) => r.id)).toEqual(['m'])
  })

  it('knows which kinds ask something', () => {
    expect(isRequestKind('friend_request')).toBe(true)
    expect(isRequestKind('match')).toBe(false)
  })
})

describe('mergeFeed and arrivedUnread', () => {
  const a = item({ id: 'a', kind: 'match', createdAt: ago(3 * HOUR) })
  const b = item({ id: 'b', kind: 'match', createdAt: ago(2 * HOUR) })
  const c = item({ id: 'c', kind: 'match', createdAt: ago(MIN) })

  it('folds a page into the loaded list, newest first, without shortening it', () => {
    expect(mergeFeed([a, b], [c, { ...b, readAt: 'x' }]).map((n) => n.id)).toEqual(['c', 'b', 'a'])
    expect(mergeFeed([a, b], [c]).find((n) => n.id === 'a')).toBe(a)
  })

  it('takes the page’s copy of a row it carries', () => {
    const read = { ...b, readAt: 'x' }
    expect(mergeFeed([a, b], [read]).find((n) => n.id === 'b')).toBe(read)
  })

  it('counts only the unread rows that were not there before', () => {
    expect(arrivedUnread([a], [c, { ...b, readAt: 'x' }, a])).toEqual(['c'])
  })
})

describe('findLandingRow', () => {
  const requests = [
    item({ id: 'one', kind: 'friend_request', data: { requestId: 'r1' } }),
    item({ id: 'two', kind: 'friend_request', data: { requestId: 'r2' } }),
    item({ id: 'ev', kind: 'event_update', data: { eventId: 'e1' } }),
  ]

  it('finds the row whose kind and ids agree with the payload', () => {
    expect(findLandingRow(requests, { type: 'friend_request', requestId: 'r2' })?.id).toBe('two')
    expect(findLandingRow(requests, { type: 'event_update', eventId: 'e1' })?.id).toBe('ev')
  })

  it('finds nothing for a payload with no id, a wrong kind or a missing row', () => {
    expect(findLandingRow(requests, { type: 'friend_request' })).toBeNull()
    expect(findLandingRow(requests, { type: 'match', requestId: 'r1' })).toBeNull()
    expect(findLandingRow(requests, { type: 'friend_request', requestId: 'zzz' })).toBeNull()
    expect(findLandingRow(requests, undefined)).toBeNull()
  })
})

describe('closeAnsweredElsewhere', () => {
  const req = (id: string, requestId: string) => item({ id, kind: 'friend_request', data: { requestId } })

  it('closes a friend request no longer among the incoming ones, and leaves the rest', () => {
    const rows = closeAnsweredElsewhere([req('a', 'r1'), req('b', 'r2'), item({ id: 'c', kind: 'crew_invite', data: { crewId: 'x' } })], new Set(['r2']))
    expect(rows.map((n) => n.open)).toEqual([false, undefined, undefined])
  })

  it('closes nothing when the list did not load', () => {
    expect(closeAnsweredElsewhere([req('a', 'r1')], null)[0].open).toBeUndefined()
  })
})

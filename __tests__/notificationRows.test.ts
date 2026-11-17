import type { NotificationItem } from '../lib/notificationFormat'
import {
  arrivedUnread,
  askItems,
  closeAnsweredElsewhere,
  findLandingRow,
  groupFeed,
  isRequestKind,
  isTalkAskKind,
  mergeFeed,
  notificationWhen,
  parseVisual,
  rowFor,
  withAsks,
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

  // Requests placement A (owner 2026-11-15): every pill in Waiting on you answers; the asks that open a chat have none.
  it('asks Accept and Decline of a friend request, Join and Decline of an invite, and nothing of a talk-ask', () => {
    const labels = (kind: NotificationItem['kind']) => rowFor(item({ id: kind, kind }), NOW).actions.map((a) => a.label)
    expect(labels('friend_request')).toEqual(['Accept', 'Decline'])
    expect(labels('crew_invite')).toEqual(['Join', 'Decline'])
    for (const k of ['reveal_request', 'board_request', 'message_request'] as const) expect(labels(k)).toEqual([])
    for (const k of ['match', 'friend_accepted', 'crew_here', 'blend', 'announcement'] as const) expect(labels(k)).toEqual([])
  })

  it('draws a talk-ask as a plain line with a chevron, saying where it waits, whatever the server’s context', () => {
    const row = (kind: NotificationItem['kind']) => rowFor(item({ id: kind, kind, display: { context: 'Met in the room' } }), NOW)
    expect(row('message_request')).toMatchObject({ chevron: true, actions: [], waiting: false, context: 'Message requests · 5 min ago' })
    expect(row('reveal_request')).toMatchObject({ chevron: true, context: 'In your chat · 5 min ago' })
    expect(row('board_request')).toMatchObject({ chevron: true, context: 'The Lobby · 5 min ago' })
    // Control: a join-ask has its pills and no chevron; a plain row neither.
    expect(row('friend_request')).toMatchObject({ chevron: false, waiting: true })
    expect(row('match')).toMatchObject({ chevron: false, context: 'Met in the room' })
    expect(['message_request', 'board_request', 'reveal_request'].every(isTalkAskKind)).toBe(true)
    expect(['friend_request', 'crew_invite', 'match'].some(isTalkAskKind)).toBe(false)
  })

  it('makes the first pill lit, with its glyph: Accept (user-check) and Join (users), nothing else', () => {
    expect(rowFor(item({ id: 'a', kind: 'friend_request' }), NOW).actions).toEqual([
      { key: 'accept', label: 'Accept', kind: 'lit', icon: 'user-check' },
      { key: 'decline', label: 'Decline', kind: 'secondary' },
    ])
    expect(rowFor(item({ id: 'c', kind: 'crew_invite' }), NOW).actions[0]).toEqual({ key: 'join', label: 'Join', kind: 'lit', icon: 'users' })
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

  /*
   * SCRUM-1062: a friend request has no lapse (Friends lists it until it is answered), and a crew invite's is the server's
   * (`open: false` once it lapses). Aged out here at 14 days, Waiting on you said 8 while Friends said 14 waiting.
   */
  it('waits on an open request however old it is: the server says when one has closed, not its age', () => {
    const old15 = item({ id: 'l', kind: 'friend_request', createdAt: ago(15 * DAY), data: { requestId: 'r15' } })
    const oldInvite = item({ id: 'li', kind: 'crew_invite', createdAt: ago(15 * DAY), data: { crewId: 'c15' } })
    const g = groupFeed([old15, oldInvite], { fresh: none, resolved: none, now: NOW })
    expect(g.waiting.map((r) => r.id)).toEqual(['l', 'li'])
    expect(g.waiting.map((r) => r.actions.map((a) => a.key))).toEqual([
      ['accept', 'decline'],
      ['join', 'decline'],
    ])
    expect(g.earlier).toEqual([])
  })

  it('orders Waiting on you newest first, whichever list a row came from', () => {
    const recent = item({ id: 'n', kind: 'crew_invite', createdAt: ago(HOUR), data: { crewId: 'c1' } })
    const older = item({ id: 'o2', kind: 'friend_request', createdAt: ago(9 * DAY), data: { requestId: 'r9' } })
    const g = groupFeed([older, recent], { fresh: none, resolved: none, now: NOW })
    expect(g.waiting.map((r) => r.id)).toEqual(['n', 'o2'])
  })

  // Requests placement A: Waiting on you is the join-asks only. A talk-ask, open and unseen, is a New line.
  it('never puts a talk-ask in Waiting on you, however open and unseen', () => {
    const talk = (['message_request', 'board_request', 'reveal_request'] as const).map((kind) => item({ id: kind, kind }))
    const g = groupFeed([...talk, friend], { fresh: new Set(talk.map((t) => t.id)), resolved: none, now: NOW })
    expect(g.waiting.map((r) => r.id)).toEqual(['fr'])
    expect(g.fresh.map((r) => r.id)).toEqual(['message_request', 'board_request', 'reveal_request'])
  })

  /*
   * SCRUM-1036: a friend request answered (Accept or Not now, here or on Friends › Requests) stayed in the feed as "New
   * friend request": the server sends `open: false` and no `display` for it, so the row fell back to the push's title,
   * which is the unanswered request's. It leaves the feed, as a request answered here does once its outcome has shown.
   */
  it('leaves out a friend request that is no longer open: it is not a "New friend request" any more', () => {
    const answered = item({ id: 'a', kind: 'friend_request', title: 'New friend request', open: false, data: { requestId: 'r2' } })
    const g = groupFeed([answered, friend, match], { fresh: new Set(['a', 'm']), resolved: none, now: NOW })
    expect([...g.waiting, ...g.fresh, ...g.earlier].map((r) => r.id)).toEqual(['fr', 'm'])
  })

  // A crew invite joined or declined anywhere leaves too (board 05, A · 1: the row collapses); an open request still waits.
  it('leaves out a crew invite that is no longer open, and keeps a request still open', () => {
    const closedInvite = item({ id: 'x', kind: 'crew_invite', open: false, data: { crewId: 'c' } })
    const g = groupFeed([closedInvite, friend, match], { fresh: none, resolved: none, now: NOW })
    expect(g.waiting.map((r) => r.id)).toEqual(['fr'])
    expect(g.earlier.map((r) => r.id)).toEqual(['m'])
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
  const inv = (id: string, crewId: string) => item({ id, kind: 'crew_invite', data: { crewId } })
  const none = { open: null, left: new Set<string>() }

  it('closes a friend request or crew invite no longer on its whole list, and leaves the rest', () => {
    const rows = closeAnsweredElsewhere([req('a', 'r1'), req('b', 'r2'), inv('c', 'x'), inv('d', 'y'), item({ id: 'm', kind: 'match' })], {
      friend_request: { open: new Set(['r2']), left: new Set() },
      crew_invite: { open: new Set(['y']), left: new Set() },
    })
    expect(rows.map((n) => n.open)).toEqual([false, undefined, false, undefined, undefined])
  })

  // One answer anywhere leaves every surface: a list read only in part cannot say an ask is gone, but an answer can.
  it('closes what was answered this session even when the list is partial, and nothing else', () => {
    const rows = closeAnsweredElsewhere([req('a', 'r1'), req('b', 'r2'), inv('c', 'x')], {
      friend_request: { open: null, left: new Set(['r1']) },
      crew_invite: { open: null, left: new Set(['x']) },
    })
    expect(rows.map((n) => n.open)).toEqual([false, undefined, false])
  })

  it('closes nothing when neither list has loaded', () => {
    expect(closeAnsweredElsewhere([req('a', 'r1'), inv('c', 'x')], { friend_request: none, crew_invite: none }).map((n) => n.open)).toEqual([undefined, undefined])
  })
})

/*
 * SCRUM-1062: Waiting on you is the shared lists (`lib/friendRequests`, `lib/crewInvites`), not the notification rows. A request
 * with no row in the feed (older than its first page, cleared, seeded, swept) is still waiting, and is drawn from the list.
 */
describe('askItems and withAsks', () => {
  const none = new Set<string>()
  const person = (name: string, photo: string | null = null) => ({ userId: `u_${name}`, name, photo })
  const request = (id: string, days: number, name = 'Asha Rao') => ({ id, person: person(name), createdAt: ago(days * DAY) })
  const crewInvite = (crewId: string, days: number) => ({
    crewId,
    name: `Crew ${crewId}`,
    bio: null,
    emblemSeed: `seed-${crewId}`,
    tags: [],
    size: 3,
    invitedBy: 'Asha',
    invitedAt: ago(days * DAY),
  })

  it('draws a request older than 7 days from the list, with its pills, the person and the time', () => {
    const [row] = groupFeed(askItems([request('r8', 8)], []), { fresh: none, resolved: none, now: NOW }).waiting
    expect(row.item.data).toEqual({ type: 'friend_request', requestId: 'r8' })
    expect(row.title).toBe('Asha wants to be friends')
    expect(row.context).toBe(notificationWhen(ago(8 * DAY), NOW))
    expect(row.actions.map((a) => a.key)).toEqual(['accept', 'decline'])
  })

  it('draws a crew invite older than 7 days from the list the same way: its emblem, its name, Join and Decline', () => {
    const [row] = groupFeed(askItems([], [crewInvite('c9', 9)]), { fresh: none, resolved: none, now: NOW }).waiting
    expect(row.item.data).toEqual({ type: 'crew_invite', crewId: 'c9' })
    expect(row.visual).toEqual({ type: 'emblem', seed: 'seed-c9' })
    expect(row.context).toBe('Crew c9')
    expect(row.actions.map((a) => a.key)).toEqual(['join', 'decline'])
  })

  it('a photo the list has is the row’s face; a name it lacks is the push’s own words, never an invented one', () => {
    const [withPhoto, nameless] = askItems([{ ...request('a', 1), person: person('Ravi', 'https://x/p.jpg') }, { ...request('b', 1), person: person('') }], [])
    expect(rowFor(withPhoto, NOW).visual).toEqual({ type: 'photo', uri: 'https://x/p.jpg' })
    expect(rowFor(nameless, NOW).title).toBe('New friend request')
    expect(rowFor(nameless, NOW).visual).toEqual({ type: 'glyph', icon: 'user-plus' })
  })

  it('keeps the notification row where the feed has one for the same ask, and adds the rest once each', () => {
    const feedRow = item({ id: 'n1', kind: 'friend_request', data: { requestId: 'r1' } })
    const asks = askItems([request('r1', 1), request('r2', 8)], [crewInvite('c1', 10)])
    const merged = withAsks([feedRow], [...asks, ...asks])
    expect(merged.map((n) => n.id)).toEqual(['n1', 'friend_request:r2', 'crew_invite:c1'])
  })

  // Negative control: 14 waiting on the list, 8 of them with a row in the feed, is 14 in Waiting on you, not 8.
  it('14 on the list and 8 in the feed is 14 waiting', () => {
    const list = Array.from({ length: 14 }, (_, i) => request(`r${i}`, i))
    const feed = list.slice(0, 8).map((r) => item({ id: `n${r.id}`, kind: 'friend_request', createdAt: r.createdAt, data: { requestId: r.id } }))
    const g = groupFeed(withAsks(feed, askItems(list, [])), { fresh: none, resolved: none, now: NOW })
    expect(g.waiting).toHaveLength(14)
    expect(groupFeed(feed, { fresh: none, resolved: none, now: NOW }).waiting).toHaveLength(8)
  })
})

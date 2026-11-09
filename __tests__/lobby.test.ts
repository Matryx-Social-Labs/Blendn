/**
 * The Lobby's pure rules (SCRUM-1026, board `mockups/redesign-2026-11/lobby/`): the words each post carries, the
 * composer's slot, the sheet's choices, the room card's rows and the event page's state.
 */
import {
  badgeCount,
  codePoints,
  composerSlot,
  countLine,
  doorsAt,
  filterQuery,
  fromLobbyCard,
  FROM_LOBBY_ROWS,
  type LobbySummary,
  joinedLine,
  joinedTitle,
  kindGlyph,
  asksWords,
  freshOnTop,
  lobbyChips,
  lobbyLayout,
  lobbyNews,
  LOBBY_NEWS_PAGE,
  newestPostAt,
  newPostsWords,
  previewReadOnlyLine,
  photoView,
  readOnlyLine,
  kindWords,
  lobbyDraft,
  mayPost,
  postAction,
  postAge,
  previewView,
  spotsWords,
  subKindChips,
  takesSpots,
  untilWords,
  type LobbyMeta,
} from '../lib/lobby'
import { WORST } from './helpers/longText'

const ALL: LobbyMeta['subKinds'] = { offer: ['ride', 'spots', 'ticket'], seeking: ['ride', 'buddy', 'ticket'], chat: [] }

describe('a post’s words', () => {
  it('names the kind in plain words, with the number in its own slot', () => {
    expect(kindWords('offer', 'ride')).toBe('Offering a ride')
    expect(kindWords('offer', 'ticket')).toBe('Offering a spare ticket')
    expect(kindWords('seeking', 'buddy')).toBe('Looking for someone to go with')
    expect(kindWords('chat', null)).toBe('Just saying')
    // An installed build posts with no sub-kind.
    expect(kindWords('offer', null)).toBe('Offering spots')
    expect(kindGlyph('offer', 'ride')).toBe('car')
    expect(kindGlyph('chat', null)).toBe('message-square')
  })

  it('counts spots, a spare ticket as "1 left", and an offer at 0 as Full', () => {
    expect(spotsWords({ kind: 'offer', spacesLeft: 2, subKind: 'ride' })).toBe('2 spots left')
    expect(spotsWords({ kind: 'offer', spacesLeft: 1, subKind: 'spots' })).toBe('1 spot left')
    expect(spotsWords({ kind: 'offer', spacesLeft: 1, subKind: 'ticket' })).toBe('1 left')
    expect(spotsWords({ kind: 'offer', spacesLeft: 0, subKind: 'ride' })).toBe('Full')
    expect(spotsWords({ kind: 'seeking', spacesLeft: null })).toBeNull()
    expect(spotsWords({ kind: 'offer', spacesLeft: null })).toBeNull()
  })

  it('carries one action: Ask to join on an offer, Say hi on a search, none on a chat post (the server refuses that ask)', () => {
    expect(postAction('offer')?.label).toBe('Ask to join')
    expect(postAction('seeking')?.label).toBe('Say hi')
    expect(postAction('chat')).toBeNull()
  })

  it('says its age as the cards do', () => {
    const now = Date.parse('2026-11-08T12:00:00Z')
    expect(postAge('2026-11-08T11:59:40Z', now)).toBe('now')
    expect(postAge('2026-11-08T11:48:00Z', now)).toBe('12 min')
    expect(postAge('2026-11-08T09:00:00Z', now)).toBe('3 h')
    expect(postAge('2026-11-07T10:00:00Z', now)).toBe('1 d')
  })
})

describe('the chips', () => {
  it('ask the server, which filters', () => {
    expect(filterQuery('all')).toEqual({})
    expect(filterQuery('offer')).toEqual({ kind: 'offer' })
    expect(filterQuery('mine')).toEqual({ filter: 'mine' })
    expect(filterQuery('replies')).toEqual({ filter: 'replies' })
  })

  it('are compact past 999, and the badge caps at 9+', () => {
    expect(countLine({ all: 2188, offerRides: WORST.count })).toEqual({ posts: '2.1k', postsWord: 'posts', rides: '12k', ridesWord: 'offering rides' })
    expect(badgeCount(5)).toBe('5')
    expect(badgeCount(48)).toBe('9+')
  })

  it('says one post and one ride in the singular, and leaves the rides out at none (control: 18 and 3)', () => {
    expect(countLine({ all: 18, offerRides: 3 })).toEqual({ posts: '18', postsWord: 'posts', rides: '3', ridesWord: 'offering rides' })
    expect(countLine({ all: 1, offerRides: 1 })).toEqual({ posts: '1', postsWord: 'post', rides: '1', ridesWord: 'offering a ride' })
    expect(countLine({ all: 4, offerRides: 0 }).rides).toBeNull()
  })
})

describe('Going’s "New in the Lobby"', () => {
  const at = (min: number) => new Date(Date.parse('2026-11-08T10:00:00Z') + min * 60_000).toISOString()
  const post = (id: string, min: number, mine = false) => ({ id, author: `Creature ${id}`, createdAt: at(min), mine })
  const page = [post('e', 50), post('d', 40, true), post('c', 30), post('b', 20), post('a', 10)]

  it('counts what others posted since you last opened the Lobby, and leads with the three newest', () => {
    const news = lobbyNews(page, at(25))
    expect(news.count).toBe(2)
    expect(news.authors.map((a) => a.id)).toEqual(['e', 'c'])
  })

  it('counts everything when you never opened it, never your own, and nothing when you have seen it all (control)', () => {
    expect(lobbyNews(page, null).count).toBe(4)
    expect(lobbyNews(page, null).authors.map((a) => a.id)).toEqual(['e', 'c', 'b'])
    expect(lobbyNews(page, at(50)).count).toBe(0)
  })

  it('is 9+ when a whole page is newer than you saw (the page cannot say how many more)', () => {
    const full = Array.from({ length: LOBBY_NEWS_PAGE }, (_, i) => post(String(i), 100 - i))
    expect(badgeCount(lobbyNews(full, at(0)).count)).toBe('9+')
    // Control: one of them seen, so the count is exact.
    expect(lobbyNews(full, at(91)).count).toBe(9)
  })

  it('remembers the newest post you were shown, by the server’s clock', () => {
    expect(newestPostAt(page)).toBe(at(50))
    expect(newestPostAt([])).toBeNull()
  })
})

describe('the composer’s slot', () => {
  it('is the composer, a gate with its one way forward, or the doors', () => {
    expect(composerSlot({ state: 'open', compose: { allowed: true, message: null, reasonCode: null } })).toEqual({ kind: 'composer' })
    expect(composerSlot({ state: 'open', compose: { allowed: false, message: 'x', reasonCode: 'BOARD_NOT_GOING' } })).toEqual({ kind: 'gate', gate: 'going' })
    expect(composerSlot({ state: 'open', compose: { allowed: false, message: 'x', reasonCode: 'BOARD_PROFILE_INCOMPLETE' } })).toEqual({ kind: 'gate', gate: 'profile' })
    // A cap has no button that fixes it: the composer stays and the sheet says the server's sentence.
    expect(composerSlot({ state: 'open', compose: { allowed: false, message: 'x', reasonCode: 'BOARD_WEEKLY_LIMIT' } })).toEqual({ kind: 'composer' })
    expect(composerSlot({ state: 'read_only', compose: { allowed: false, message: 'x', reasonCode: 'LOBBY_READ_ONLY' } })).toEqual({ kind: 'readOnly' })
  })
})

describe('the compose sheet', () => {
  it('offers each type its sub-kinds, without the ticket ones where tickets are sold on Blend’n', () => {
    expect(subKindChips('offer', ALL, false).map((c) => c.label)).toEqual(['Ride', 'Spots', 'Spare ticket'])
    expect(subKindChips('seeking', { ...ALL, seeking: ['ride', 'buddy'] }, true).map((c) => c.label)).toEqual(['A ride', 'Someone to go with'])
    expect(subKindChips('offer', null, true).map((c) => c.subKind)).toEqual(['ride', 'spots'])
    expect(subKindChips('chat', ALL, false)).toEqual([])
  })

  it('counts spots only on an offer of a ride or spots, and the words in code points', () => {
    expect(takesSpots('offer', 'ride')).toBe(true)
    expect(takesSpots('offer', 'ticket')).toBe(false)
    expect(takesSpots('seeking', 'ride')).toBe(false)
    expect(codePoints('🚗🚗')).toBe(2)
  })

  it('never offers a ticket where tickets are hidden, even when a server lists one', () => {
    expect(subKindChips('offer', ALL, true).map((c) => c.subKind)).toEqual(['ride', 'spots'])
    expect(subKindChips('seeking', ALL, true).map((c) => c.subKind)).toEqual(['ride', 'buddy'])
  })

  it('sends what the server takes: a sub-kind but not a chat, spots on a ride or spots only, the photo and its alt', () => {
    const base = { body: '  Two seats  ', spots: 2, attachment: null }
    expect(lobbyDraft({ ...base, kind: 'offer', subKind: 'ride' })).toEqual({ kind: 'offer', subKind: 'ride', body: 'Two seats', spacesLeft: 2 })
    expect(lobbyDraft({ ...base, kind: 'offer', subKind: 'ticket' })).toEqual({ kind: 'offer', subKind: 'ticket', body: 'Two seats' })
    expect(lobbyDraft({ ...base, kind: 'seeking', subKind: 'buddy' })).toEqual({ kind: 'seeking', subKind: 'buddy', body: 'Two seats' })
    expect(lobbyDraft({ ...base, kind: 'chat', subKind: 'ride' })).toEqual({ kind: 'chat', body: 'Two seats' })
    expect(lobbyDraft({ ...base, kind: 'chat', subKind: null, attachment: { url: 'https://x/p.jpg', alt: '  ' } })).toEqual({ kind: 'chat', body: 'Two seats', photo: { url: 'https://x/p.jpg' } })
    expect(lobbyDraft({ ...base, kind: 'chat', subKind: null, attachment: { url: 'https://x/p.jpg', alt: ' Sunset ' } }).photo).toEqual({ url: 'https://x/p.jpg', alt: 'Sunset' })
  })

  it('posts once there are words inside 280 code points and no photo still on its way', () => {
    expect(mayPost({ body: '   ', uploading: false })).toBe(false)
    expect(mayPost({ body: 'Hi', uploading: true })).toBe(false)
    expect(mayPost({ body: 'Hi', uploading: false })).toBe(true)
    expect(mayPost({ body: '🚗'.repeat(280), uploading: false })).toBe(true)
    expect(mayPost({ body: '🚗'.repeat(281), uploading: false })).toBe(false)
  })
})

describe('the clock', () => {
  it('opens the doors 90 minutes before the start', () => {
    expect(doorsAt('2026-11-08T12:30:00Z')).toBe(Date.parse('2026-11-08T11:00:00Z'))
    expect(doorsAt(null)).toBeNull()
  })

  // The owner's one time grammar (SCRUM-1031): Tonight from 5 PM, Today before, Tomorrow, the weekday, then the date;
  // the event city's day and clock, never a zone's name.
  it('says "until" in the app’s time words, in the event city’s day and clock', () => {
    const IST = 'Asia/Kolkata'
    const morning = new Date('2026-11-09T03:00:00Z') // Mon 9 Nov, 8:30 AM in Bengaluru
    expect(untilWords('2026-11-09T08:30:00Z', IST, morning)).toBe('Today · 2 PM')
    expect(untilWords('2026-11-09T15:00:00Z', IST, morning)).toBe('Tonight · 8:30 PM')
    expect(untilWords('2026-11-09T18:30:00Z', IST, morning)).toBe('Tomorrow · 12 AM')
    expect(untilWords('2026-11-12T15:00:00Z', IST, morning)).toBe('Thu · 8:30 PM')
    expect(untilWords('2026-11-25T15:00:00Z', IST, morning)).toBe('Wed 25 Nov · 8:30 PM')
    expect(untilWords(null, IST, morning)).toBe('')
  })

  it('takes the day from the event’s city, not the phone’s', () => {
    // Sat 14 Nov, 3 PM in Toronto; 1:30 AM Sunday in Bengaluru. The Lobby closes at 10 PM Toronto time.
    const now = new Date('2026-11-14T20:00:00Z')
    expect(untilWords('2026-11-15T03:00:00Z', 'America/Toronto', now)).toBe('Tonight · 10 PM')
    expect(untilWords('2026-11-15T03:00:00Z', 'Asia/Kolkata', now)).toBe('Today · 8:30 AM')
  })
})

describe('From the Lobby', () => {
  it('names what you are in, and who with, by pseudonym', () => {
    expect(joinedTitle({ kind: 'offer', subKind: 'ride' })).toBe('Your ride')
    expect(joinedTitle({ kind: 'offer', subKind: 'spots' })).toBe('Your group')
    expect(joinedLine({ mine: false, author: 'Lunar Fox', others: 3, body: 'From Indiranagar at 5:30' })).toBe('With Lunar Fox and 2 others: From Indiranagar at 5:30')
    expect(joinedLine({ mine: false, author: 'Lunar Fox', others: 1, body: 'x' })).toBe('With Lunar Fox: x')
    expect(joinedLine({ mine: true, author: 'Me', others: 1, body: 'x' })).toBe('1 other with you: x')
  })

  const UNTIL = '2026-11-09T18:30:00Z'
  const ride = { postId: 'p1', kind: 'offer' as const, subKind: 'ride' as const, body: 'From Indiranagar at 5:30', mine: false, author: 'Lunar Fox', others: 3, chatGroupId: 'g1', requestId: 'r1', conversationId: 'c1' }
  const ticket = { ...ride, postId: 'p2', subKind: 'ticket' as const, chatGroupId: null, conversationId: 'c2' }
  const group = { ...ride, postId: 'p3', subKind: 'spots' as const, chatGroupId: null, conversationId: null }
  const summary = (over: Partial<LobbySummary>): LobbySummary => ({ state: 'read_only', phase: 'live', readUntil: UNTIL, hasContent: true, pinned: null, joined: [], asks: { yours: 0, waitingOnYou: 0 }, ...over })

  it('is no card at all when the server says there is nothing (owner, 2026-11-06)', () => {
    expect(fromLobbyCard(summary({ hasContent: false }))).toBeNull()
    expect(fromLobbyCard(null)).toBeNull()
    // Control: the same summary with a row in it is a card.
    expect(fromLobbyCard(summary({ joined: [ride] }))).not.toBeNull()
  })

  it('lists your rides, tickets and groups, then the host’s note, then Read the Lobby', () => {
    const card = fromLobbyCard(summary({ joined: [ride, ticket, group], pinned: PIN }))!
    expect(card.rows.map((r) => r.title)).toEqual(['Your ride', 'Your ticket', 'Your group', 'From the host'])
    expect(card.rows.map((r) => r.glyph)).toEqual(['car', 'ticket', 'users', 'megaphone'])
    expect(card.rows[3]).toMatchObject({ host: true, line: 'Music starts at 6.', open: null })
    expect(card.readUntil).toBe(UNTIL)
    expect(card.bar).toBe('Your ride · Your ticket · Your group · From the host')
  })

  it('opens a row’s room when you are seated in it, else the 1:1 your ask opened, else nothing', () => {
    const [a, b, c] = fromLobbyCard(summary({ joined: [ride, ticket, group] }))!.rows
    expect(a.open).toEqual({ kind: 'room', id: 'g1' })
    expect(b.open).toEqual({ kind: 'dm', id: 'c2' })
    expect(c.open).toBeNull()
  })

  it('is only the note when the host’s note is all there is (4b): no Read the Lobby', () => {
    const card = fromLobbyCard(summary({ pinned: PIN }))!
    expect(card.rows).toHaveLength(1)
    expect(card.rows[0].host).toBe(true)
    expect(card.readUntil).toBeNull()
  })

  it('shows three rows you joined and counts the rest', () => {
    const many = [1, 2, 3, 4, 5].map((i) => ({ ...group, postId: `p${i}` }))
    const card = fromLobbyCard(summary({ joined: many, pinned: PIN }))!
    expect(card.rows.filter((r) => !r.host)).toHaveLength(FROM_LOBBY_ROWS)
    expect(card.more).toBe(2)
    expect(fromLobbyCard(summary({ joined: [group] }))!.more).toBe(0)
  })

  it('says what is waiting when asks are all there is, and opens them', () => {
    const card = fromLobbyCard(summary({ asks: { yours: 1, waitingOnYou: 2 } }))!
    expect(card.rows).toEqual([{ key: 'asks', glyph: 'hand-heart', title: 'Your asks', line: '2 asks waiting on you · 1 of yours waiting for an answer', open: { kind: 'asks' } }])
    expect(card.readUntil).toBeNull()
    // Control: with a row you joined, the asks are not a row of their own (the board draws none).
    expect(fromLobbyCard(summary({ joined: [ride], asks: { yours: 1, waitingOnYou: 2 } }))!.rows.map((r) => r.key)).toEqual(['p1'])
  })
})

describe('the event page’s slot', () => {
  const base = { state: 'open' as const, phase: 'before' as const, canRead: true, counts: { all: 18, offer: 5, seeking: 9, chat: 4, offerRides: 3 } }
  it('is the gate, the posts, empty, read-only, or the room once live and nobody posted', () => {
    expect(previewView(base)).toBe('posts')
    expect(previewView({ ...base, canRead: false })).toBe('gate')
    expect(previewView({ ...base, counts: { ...base.counts, all: 0 } })).toBe('empty')
    expect(previewView({ ...base, state: 'read_only', phase: 'live' })).toBe('readOnly')
    expect(previewView({ ...base, state: 'read_only', phase: 'live', counts: { ...base.counts, all: 0 } })).toBe('roomOpen')
  })

  it('says after doors why it is read-only, and until when in the event’s clock', () => {
    expect(previewReadOnlyLine('2026-11-09T18:30:00Z', 'Asia/Kolkata', new Date('2026-11-09T10:00:00Z'))).toBe('The doors are open, so the Lobby is read-only. You can read it until Tomorrow · 12 AM.')
    expect(previewReadOnlyLine(undefined)).toBe('The doors are open, so the Lobby is read-only.')
  })
})

describe('the alerts sheet’s switches (admin #918)', () => {
  it('shows only the two real opt-ins; asks and accepts always push, so there is no replies switch', () => {
    const { ALERT_ROWS } = jest.requireActual('../lib/lobby') as typeof import('../lib/lobby')
    expect(ALERT_ROWS.map((r) => r.key)).toEqual(['offersMatch', 'hostPosts'])
  })

  it('doors are the room’s opening, one moment (control: an hour and a half before the start)', () => {
    const { doorsAt } = jest.requireActual('../lib/lobby') as typeof import('../lib/lobby')
    const { roomOpensAt } = jest.requireActual('../lib/preEventRoom') as typeof import('../lib/preEventRoom')
    expect(doorsAt('2026-11-08T12:30:00Z')).toBe(roomOpensAt('2026-11-08T12:30:00Z'))
  })
})

describe('the Lobby screen (L-A): what each part shows', () => {
  const meta = (over: Partial<LobbyMeta> = {}): Partial<LobbyMeta> => ({
    state: 'open',
    phase: 'before',
    counts: { all: 3, offer: 1, seeking: 1, chat: 1, offerRides: 1, mine: 0, replies: 0 },
    ...over,
  })

  it('lays out the open Lobby: the composer, the chips, the pin on All only', () => {
    expect(lobbyLayout(meta({ pinned: PIN }), 'all')).toEqual({ top: 'composer', chips: true, pinned: true, starts: false, liveEmpty: false })
    expect(lobbyLayout(meta({ pinned: PIN }), 'offer').pinned).toBe(false)
  })

  it('is the two starts, and no chips, before anybody posted (control: one post brings the chips back)', () => {
    const none = meta({ counts: { all: 0, offer: 0, seeking: 0, chat: 0, offerRides: 0, mine: 0, replies: 0 } })
    expect(lobbyLayout(none, 'all')).toMatchObject({ chips: false, starts: true, liveEmpty: false })
    expect(lobbyLayout(meta(), 'all')).toMatchObject({ chips: true, starts: false })
  })

  it('keeps the chips on a filter that found nothing, so it can be undone', () => {
    const none = meta({ counts: { all: 4, offer: 4, seeking: 0, chat: 0, offerRides: 0, mine: 0, replies: 0 } })
    expect(lobbyLayout(none, 'mine')).toMatchObject({ chips: true, starts: false })
  })

  it('after doors: read-only, no starts; empty, it says the room is open instead (4b), and keeps a pinned note', () => {
    expect(lobbyLayout(meta({ state: 'read_only', phase: 'live' }), 'all')).toMatchObject({ top: 'readOnly', chips: true, liveEmpty: false })
    const empty = meta({ state: 'read_only', phase: 'live', pinned: PIN, counts: { all: 0, offer: 0, seeking: 0, chat: 0, offerRides: 0, mine: 0, replies: 0 } })
    expect(lobbyLayout(empty, 'all')).toEqual({ top: 'none', chips: false, pinned: true, starts: false, liveEmpty: true })
  })

  it('puts the gate in the composer’s slot, and the Lobby stays readable under it', () => {
    const gated = meta({ compose: { allowed: false, message: 'x', reasonCode: 'BOARD_NOT_GOING' } })
    expect(lobbyLayout(gated, 'all')).toMatchObject({ top: 'going', chips: true })
    expect(lobbyLayout(meta({ compose: { allowed: false, message: 'x', reasonCode: 'BOARD_PROFILE_INCOMPLETE' } }), 'all').top).toBe('profile')
  })

  it('reads an older server (no meta at all) as the open Lobby, counting what it sent', () => {
    expect(lobbyLayout({}, 'all', 0)).toMatchObject({ top: 'composer', chips: false, starts: true })
    expect(lobbyLayout({}, 'all', 2)).toMatchObject({ top: 'composer', chips: false, starts: false })
  })

  it('names the chips with compact counts, and the two about you after the kinds', () => {
    const chips = lobbyChips({ all: WORST.count, offer: 418, seeking: 1200, chat: 0, offerRides: 0, mine: 2, replies: 1 })
    expect(chips.map((c) => `${c.label} ${c.count}`)).toEqual(['All 12k', 'Offering 418', 'Looking for 1.2k', 'Just saying 0', 'Mine 2', 'Replies to me 1'])
  })

  it('says how many new posts wait behind the pill, in one or many', () => {
    expect(newPostsWords(1)).toBe('1 new post')
    expect(newPostsWords(12)).toBe('12 new posts')
    expect(newPostsWords(WORST.count)).toBe('12k new posts')
  })

  it('holds back what a background read found above the list, and nothing that was already there or yours', () => {
    const shown = new Set(['a', 'b'])
    const page = [{ id: 'n1', mine: false }, { id: 'n2', mine: true }, { id: 'a', mine: false }, { id: 'b', mine: false }]
    expect(freshOnTop(page, shown)).toEqual(['n1'])
    // Control: nothing shown yet is a first load, which holds nothing back.
    expect(freshOnTop(page, new Set())).toEqual([])
  })

  it('says until when the Lobby can be read, and only the doors if the server did not say', () => {
    expect(readOnlyLine('2026-11-09T18:30:00Z', 'Asia/Kolkata', new Date('2026-11-09T10:00:00Z'))).toBe('The Lobby is read-only now. You can read it until Tomorrow · 12 AM.')
    expect(readOnlyLine(undefined)).toBe('The Lobby is read-only now.')
  })

  it('counts the asks on your post', () => {
    expect(asksWords(0)).toBe('No asks yet')
    expect(asksWords(1)).toBe('1 ask')
    expect(asksWords(WORST.count)).toBe('12k asks')
  })

  it('draws a photo only from https, and a pending or turned-down one only for its author', () => {
    const url = 'https://fly.storage.tigris.dev/blendn/chat/p.jpg'
    expect(photoView({ status: 'approved', url, alt: 'A booth' }, false)).toEqual({ kind: 'shown', url, alt: 'A booth' })
    expect(photoView({ status: 'pending', url, alt: null }, true)).toEqual({ kind: 'pending', url, alt: 'Your photo' })
    expect(photoView({ status: 'pending', url, alt: null }, false)).toEqual({ kind: 'none' })
    expect(photoView({ status: 'rejected', url: null, alt: null }, true)).toEqual({ kind: 'rejected' })
    expect(photoView({ status: 'approved', url: 'http://x.example/p.jpg', alt: null }, false)).toEqual({ kind: 'none' })
    expect(photoView({ status: 'approved', url: 'javascript:alert(1)', alt: null }, false)).toEqual({ kind: 'none' })
    expect(photoView(null, true)).toEqual({ kind: 'none' })
    expect(photoView(undefined, true)).toEqual({ kind: 'none' })
  })
})

const PIN = { id: 'h1', body: 'Music starts at 6.', host: 'Nightshift Collective', createdAt: '2026-11-06T06:00:00Z', updatedAt: '2026-11-06T06:00:00Z' }

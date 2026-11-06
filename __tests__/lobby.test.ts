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
  joinedLine,
  joinedTitle,
  kindGlyph,
  kindWords,
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
    expect(countLine({ all: 2188, offerRides: WORST.count })).toEqual({ posts: '2.1k', rides: '12k' })
    expect(badgeCount(5)).toBe('5')
    expect(badgeCount(48)).toBe('9+')
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
})

describe('the clock', () => {
  it('opens the doors 90 minutes before the start, and says "until" in the event’s clock with no zone', () => {
    expect(doorsAt('2026-11-08T12:30:00Z')).toBe(Date.parse('2026-11-08T11:00:00Z'))
    expect(doorsAt(null)).toBeNull()
    expect(untilWords('2026-11-09T18:30:00Z', 'Asia/Kolkata')).toBe('Tue 10 Nov, 12 AM')
    expect(untilWords('2026-11-15T03:00:00Z', 'America/Toronto')).toBe('Sat 14 Nov, 10 PM')
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

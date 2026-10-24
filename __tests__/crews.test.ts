// `lib/notifications` reaches apiClient and AsyncStorage; only its pure router is under test.
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }))
jest.mock('../lib/apiClient', () => ({ apiClient: {}, TokenStorage: {} }))
jest.mock('../lib/logger', () => ({ Logger: { debug: jest.fn(), warn: jest.fn(), error: jest.fn(), info: jest.fn() } }))

import {
  BLEND_CLOSED_LINE,
  CREW_GONE_LINE,
  CREW_REMOVED_LINE,
  OPEN_TO_CREWS_HELPER,
  CREW_MAX_TAGS,
  CREW_REPORT_REASONS,
  blendSides,
  blendTitle,
  blendWith,
  closesLine,
  consentBody,
  createCrewBody,
  crewMessage,
  crewRoomTitle,
  crewRoomsFrom,
  systemPreview,
  crewsThatMayLikePeople,
  friendsToInvite,
  defaultRoomName,
  hereNowLine,
  likeAs,
  mergeCrewPage,
  nextCrewOffset,
  roomClosedLine,
  roomKindParam,
  toggleTag,
  type Blend,
  type BlendPerson,
  type BlendSide,
  type CrewCard,
} from '../lib/crews'
import { notificationTarget } from '../lib/notifications'

/**
 * Crews and Blends as the app draws them (plan v2 §6; test plan §7, CR-CU01,
 * CR-M01/M02). The server's contract is `docs/api/API.md` → Crews, Blends.
 */

describe('what a refusal says (code → copy)', () => {
  it('a bare "not found" is one plain line per surface, never a guess at why', () => {
    const notFound = { error: 'Crew not found', errorCode: 'NOT_FOUND' }
    expect(crewMessage(notFound, 'crew', 'x')).toBe(`${CREW_GONE_LINE}.`)
    expect(crewMessage(notFound, 'join', 'x')).toBe('That invite isn’t open any more.')
    expect(crewMessage(notFound, 'card', 'x')).toBe('That crew isn’t here any more.')
    expect(crewMessage({ error: 'Blend not found', errorCode: 'NOT_FOUND' }, 'blend', 'x')).toBe(`${BLEND_CLOSED_LINE}.`)
  })

  it('a 404 that is a sentence is the server’s sentence (inviting a non-friend on create)', () => {
    const r = { error: 'You can only invite your friends into a crew.', errorCode: 'NOT_FOUND' }
    expect(crewMessage(r, 'create', 'Couldn’t make the crew.')).toBe('You can only invite your friends into a crew.')
  })

  it('create has no line of its own for a bare 404: the fallback', () => {
    expect(crewMessage({ error: 'Crew not found', errorCode: 'NOT_FOUND' }, 'create', 'Couldn’t make the crew.')).toBe(
      'Couldn’t make the crew.'
    )
  })

  it('CHAT_CLOSED in a Blend is the Blend closing', () => {
    expect(crewMessage({ error: 'This chat has closed', errorCode: 'CHAT_CLOSED' }, 'blend', 'x')).toBe(`${BLEND_CLOSED_LINE}.`)
  })

  it('the crew routes’ own words go through: caps, guardrails, the name check', () => {
    expect(crewMessage({ error: 'A crew has at most 12 people.', errorCode: 'CONFLICT' }, 'crew', 'x')).toBe(
      'A crew has at most 12 people.'
    )
    expect(
      crewMessage({ error: "That’s enough new crews for today — try again tomorrow.", errorCode: 'RATE_LIMITED' }, 'create', 'x')
    ).toBe("That’s enough new crews for today — try again tomorrow.")
    // A 400 refusal of the name or bio carries no errorCode at all.
    expect(crewMessage({ error: 'A phone number. A crew card is shown to people you haven’t met…' }, 'create', 'x')).toBe(
      'A phone number. A crew card is shown to people you haven’t met…'
    )
  })

  it('the rate limiter’s "Too many requests" (with retryAfter) is said as a person would', () => {
    expect(crewMessage({ error: 'Too many requests', errorCode: 'RATE_LIMITED', retryAfter: 30 }, 'card', 'x')).toBe(
      'Slow down — try again in a moment.'
    )
  })

  it('a validation failure names the field from errors[], not "Validation failed"', () => {
    const r = {
      error: 'Validation failed',
      errorCode: 'VALIDATION_FAILED',
      errors: [{ message: 'A crew name can’t contain invisible characters' }],
    }
    expect(crewMessage(r, 'create', 'x')).toBe('A crew name can’t contain invisible characters')
    expect(crewMessage({ error: 'Validation failed', errorCode: 'VALIDATION_FAILED' }, 'create', 'fallback')).toBe('fallback')
  })

  it('a server fault or a developer’s string is the screen’s sentence', () => {
    expect(crewMessage({ error: 'Failed to create the crew', errorCode: 'SERVER_ERROR' }, 'create', 'fallback')).toBe('fallback')
    expect(crewMessage({ error: 'HTTP 502 Bad Gateway (/api/mobile/crews)' }, 'create', 'fallback')).toBe('fallback')
    expect(crewMessage(null, 'create', 'fallback')).toBe('fallback')
  })
})

describe('a crew or Blend room that is over', () => {
  it('a Blend reads closed for a 404, a 403 and CHAT_CLOSED alike — no oracle on why', () => {
    for (const code of ['NOT_FOUND', 'FORBIDDEN', 'CHAT_CLOSED']) expect(roomClosedLine('blend', code)).toBe(BLEND_CLOSED_LINE)
  })

  it('a mute or a rate limit is not a closing', () => {
    expect(roomClosedLine('blend', 'USER_MUTED')).toBeNull()
    expect(roomClosedLine('blend', 'RATE_LIMITED')).toBeNull()
    expect(roomClosedLine('blend', undefined)).toBeNull()
  })

  it('a crew room is gone only on its 404', () => {
    expect(roomClosedLine('crew', 'NOT_FOUND')).toBe(CREW_GONE_LINE)
    expect(roomClosedLine('crew', 'FORBIDDEN')).toBeNull()
  })

  it('reads the kind from a route param, and an event room is null', () => {
    expect(roomKindParam('blend')).toBe('blend')
    expect(roomKindParam('crew')).toBe('crew')
    expect(roomKindParam(undefined)).toBeNull()
    expect(roomKindParam(['blend'])).toBeNull()
    expect(defaultRoomName('blend')).toBe('Your Blend')
    expect(defaultRoomName(null)).toBe('Event chat')
  })
})

describe('consent and anonymity', () => {
  it('nothing is consented until the person ticks it', () => {
    expect(consentBody({ consented: false, keepMeAnonymous: false })).toBeNull()
    expect(consentBody({ consented: false, keepMeAnonymous: true })).toBeNull()
  })

  it('a ticked consent sends revealConsent: true with the person’s own anonymity choice', () => {
    expect(consentBody({ consented: true, keepMeAnonymous: false })).toEqual({ revealConsent: true, keepMeAnonymous: false })
    expect(consentBody({ consented: true, keepMeAnonymous: true })).toEqual({ revealConsent: true, keepMeAnonymous: true })
  })
})

describe('the create body', () => {
  const form = { name: '  Saturday   Lot ', bio: ' Quiz on Tuesdays ', tags: ['quiz-team'], openToSolo: true, inviteUserIds: ['u1'] }
  const agreed = { consented: true, keepMeAnonymous: true }

  it('is refused without consent, and never carries revealConsent: false', () => {
    const body = createCrewBody(form, { consented: false, keepMeAnonymous: false })
    expect(body).toEqual({ problem: expect.stringMatching(/reveal/) })
  })

  it('trims and folds spaces, and carries the consent and the friends', () => {
    expect(createCrewBody(form, agreed)).toEqual({
      name: 'Saturday Lot',
      bio: 'Quiz on Tuesdays',
      tags: ['quiz-team'],
      openToSolo: true,
      inviteUserIds: ['u1'],
      revealConsent: true,
      keepMeAnonymous: true,
    })
  })

  it('leaves an empty bio out', () => {
    expect(createCrewBody({ ...form, bio: '   ' }, agreed)).not.toHaveProperty('bio')
  })

  it('sends "Here for" when one is chosen, and nothing when none is', () => {
    expect(createCrewBody({ ...form, intent: ['friendship', 'dating'] }, agreed)).toHaveProperty('intent', ['friendship', 'dating'])
    expect(createCrewBody({ ...form, intent: [] }, agreed)).not.toHaveProperty('intent')
    expect(createCrewBody(form, agreed)).not.toHaveProperty('intent')
  })

  it('holds the name to 2–32 characters as a person counts them', () => {
    expect(createCrewBody({ ...form, name: 'A' }, agreed)).toHaveProperty('problem')
    expect(createCrewBody({ ...form, name: 'A'.repeat(33) }, agreed)).toHaveProperty('problem')
    expect(createCrewBody({ ...form, name: 'A'.repeat(32) }, agreed)).not.toHaveProperty('problem')
    // Two emoji are two characters, not four UTF-16 units.
    expect(createCrewBody({ ...form, name: '🔥🔥' }, agreed)).not.toHaveProperty('problem')
  })

  it('holds the bio to 140, the tags to 3 and the invites to 11', () => {
    expect(createCrewBody({ ...form, bio: 'b'.repeat(141) }, agreed)).toHaveProperty('problem')
    expect(createCrewBody({ ...form, tags: ['a', 'b', 'c', 'd'] }, agreed)).toHaveProperty('problem')
    expect(createCrewBody({ ...form, inviteUserIds: Array.from({ length: 12 }, (_, i) => `u${i}`) }, agreed)).toHaveProperty('problem')
    expect(createCrewBody({ ...form, inviteUserIds: Array.from({ length: 11 }, (_, i) => `u${i}`) }, agreed)).not.toHaveProperty('problem')
  })

  it('a fourth tag does nothing rather than drop the first', () => {
    const three = ['a', 'b', 'c']
    expect(toggleTag(three, 'd')).toEqual(three)
    expect(toggleTag(three, 'b')).toEqual(['a', 'c'])
    expect(toggleTag(['a'], 'b')).toEqual(['a', 'b'])
    expect(CREW_MAX_TAGS).toBe(3)
  })

  it('reports with exactly the server’s reasons', () => {
    expect(CREW_REPORT_REASONS.map((r) => r.value).sort()).toEqual(
      ['contact_details', 'impersonation', 'offensive', 'other', 'spam'].sort()
    )
  })
})

describe('lines', () => {
  it('a card is counts', () => {
    expect(hereNowLine({ presentCount: 3, size: 5 })).toBe('Here now · 3 of 5')
  })

  it('the Blend’s clock', () => {
    const now = Date.parse('2026-10-09T20:00:00Z')
    expect(closesLine('2026-10-10T05:00:00Z', now)).toBe('Closes in 9h')
    expect(closesLine('2026-10-09T20:25:00Z', now)).toBe('Closes in 25m')
    expect(closesLine('2026-10-09T19:59:00Z', now)).toBe('Closing now')
    expect(closesLine('nonsense', now)).toBeNull()
  })
})

const person = (over: Partial<BlendPerson>): BlendPerson => ({ userId: 'rh_x', pseudonym: 'Cosmic Panda', name: null, photo: null, ...over })
const side = (over: Partial<BlendSide>): BlendSide => ({
  kind: 'crew',
  crewId: 'c1',
  name: 'Nebula',
  emblemSeed: 'seed',
  mine: false,
  count: 0,
  revealed: 0,
  keptPrivate: 0,
  people: [],
  ...over,
})

describe('a Blend’s sides', () => {
  it('yours is the side with your own id; the title is theirs', () => {
    const blend: Blend = {
      blendId: 'b1',
      chatGroupId: 'g1',
      eventId: 'e1',
      closesAt: '2026-10-10T05:00:00Z',
      sides: [side({ name: 'Two', mine: true, count: 2, people: [person({ userId: 'me' })] }), side({ name: 'Five', people: [person({ userId: 'rh_1' })] })],
    }
    expect(blendSides(blend, 'me').mine?.name).toBe('Two')
    expect(blendSides(blend, 'me').theirs?.name).toBe('Five')
    // One name on every surface (TG-11): the other side's name as given, never "Crew " before it.
    expect(blendTitle(blend, 'me')).toBe('Blend with Five')
    expect(blendTitle({ ...blend, sides: [blend.sides[0], { ...blend.sides[1], name: 'RC4 Crew Y' }] }, 'me')).toBe(blendWith('RC4 Crew Y'))
  })

  it('one person’s side is named by their first name once revealed, else their pseudonym; a solo person is not "Crew"', () => {
    const solo = (name: string | null): Blend => ({
      blendId: 'b',
      chatGroupId: 'g',
      eventId: 'e',
      closesAt: '2026-10-10T05:00:00Z',
      sides: [side({ name: 'Two', mine: true, people: [person({ userId: 'me' })] }), side({ kind: 'person', name: null, people: [person({ name })] })],
    })
    expect(blendTitle(solo(null), 'me')).toBe('Blend with Cosmic Panda')
    expect(blendTitle(solo('Kavya'), 'me')).toBe('Blend with Kavya')
    const alone: Blend = { ...solo(null), sides: [side({ kind: 'person', name: null, mine: true, people: [person({ userId: 'me' })] }), side({ name: 'Nebula' })] }
    expect(blendTitle(alone, 'me')).toBe('Blend with Nebula')
    expect(blendTitle({ ...alone, sides: [alone.sides[0]] }, 'me')).toBe('Your Blend')
  })
})

const card = (crewId: string): CrewCard => ({
  crewId,
  name: crewId,
  bio: null,
  emblemSeed: crewId,
  size: 4,
  presentCount: 2,
  tags: [],
  intent: [],
  youLiked: false,
})

describe('the Crews view: paging and liking', () => {
  it('offset 0 starts over', () => {
    expect(mergeCrewPage([card('a'), card('b')], [card('c')], 0).map((c) => c.crewId)).toEqual(['c'])
  })

  it('a later page appends, and a crew that moved up between pages is not drawn twice', () => {
    expect(mergeCrewPage([card('a'), card('b')], [card('b'), card('c')], 2).map((c) => c.crewId)).toEqual(['a', 'b', 'c'])
  })

  it('the next page starts where the server’s last page ended, not where the dedupe left the list', () => {
    expect(nextCrewOffset(30, [card('b'), card('c')])).toBe(32)
    expect(nextCrewOffset(0, [])).toBe(0)
  })

  it('only a crew with "Room for one more" and 6 or fewer is offered a like of a person', () => {
    const here = [
      { crewId: 'open6', name: 'Open six', presentCount: 2 },
      { crewId: 'closed', name: 'Closed', presentCount: 2 },
      { crewId: 'big', name: 'Big', presentCount: 3 },
      { crewId: 'unknown', name: 'Not in my list', presentCount: 2 },
    ]
    const mine = [
      { crewId: 'open6', openToSolo: true, size: 6 },
      { crewId: 'closed', openToSolo: false, size: 2 },
      { crewId: 'big', openToSolo: true, size: 7 },
    ]
    expect(crewsThatMayLikePeople(here, mine).map((c) => c.crewId)).toEqual(['open6'])
    expect(crewsThatMayLikePeople(here, [])).toEqual([])
  })

  it('a like is from you, your one crew here, or a crew you choose — never one the app picks', () => {
    expect(likeAs([])).toEqual({ as: 'me' })
    expect(likeAs([{ crewId: 'c1', name: 'Two', presentCount: 2 }])).toEqual({ as: 'crew', crewId: 'c1' })
    expect(
      likeAs([
        { crewId: 'c1', name: 'Two', presentCount: 2 },
        { crewId: 'c2', name: 'Five', presentCount: 3 },
      ])
    ).toEqual({ as: 'choose' })
  })
})

describe('pass 2 (review of #369)', () => {
  it('C1: a crew is made with at least one friend asked', () => {
    const body = createCrewBody(
      { name: 'Two', bio: '', tags: [], openToSolo: false, inviteUserIds: [] },
      { consented: true, keepMeAnonymous: false }
    )
    expect(body).toEqual({ problem: 'Pick at least one friend to ask.' })
  })

  it('M10: a ban closes the room — a Blend as closed, a crew chat as you being out of it', () => {
    expect(roomClosedLine('blend', 'USER_BANNED')).toBe(BLEND_CLOSED_LINE)
    expect(roomClosedLine('crew', 'USER_BANNED')).toBe(CREW_REMOVED_LINE)
  })

  it('H3: yours is the side the server marks mine, even when your id is not on it', () => {
    const blend: Blend = {
      blendId: 'b',
      chatGroupId: 'g',
      eventId: 'e',
      closesAt: '2026-10-10T05:00:00Z',
      sides: [side({ name: 'Theirs', people: [person({ userId: 'me' })] }), side({ name: 'Mine', mine: true, count: 2 })],
    }
    expect(blendSides(blend, 'me').mine?.name).toBe('Mine')
    expect(blendSides(blend, 'me').theirs?.name).toBe('Theirs')
  })

  it('M5: the picker leaves out a friend already in the crew — matched once, never guessed', () => {
    const friends = [
      { userId: 'u-rohan', name: 'Rohan Desai', photo: 'r.jpg' },
      { userId: 'u-kavya', name: 'Kavya', photo: null },
      { userId: 'u-kavya2', name: 'Kavya N', photo: null },
      { userId: 'u-meera', name: 'Meera', photo: null },
    ]
    const members = [
      { isFriend: true, name: 'Rohan', photo: 'r.jpg' },
      // Two friends could be this Kavya: neither is hidden.
      { isFriend: true, name: 'Kavya', photo: null },
      // Not a friend: never matched against the friends list.
      { isFriend: false, name: 'Meera', photo: null },
    ]
    expect(friendsToInvite(friends, members).map((f) => f.userId)).toEqual(['u-kavya', 'u-kavya2', 'u-meera'])
  })

  it('M7: the open-to-crews copy says what the server does — nobody is told, it lets crews like you', () => {
    expect(OPEN_TO_CREWS_HELPER).toMatch(/^Nobody is told/)
    expect(OPEN_TO_CREWS_HELPER).toMatch(/likes of you count/)
    expect(OPEN_TO_CREWS_HELPER).not.toMatch(/can see you/)
  })

  it('S5: crew and Blend rooms from GET /chat/groups, and only those', () => {
    const rows = crewRoomsFrom({
      groups: [{ id: 'e1', kind: 'event' }],
      rooms: [
        { id: 'g1', kind: 'crew', name: 'Lot S9', crewId: 'c1', blendId: null, unreadCount: 2, lastMessageAt: '2026-10-10T02:00:00Z', lastMessage: { content: 'hi', user: { id: 'rh_1', name: 'Ishan' } } },
        { id: 'g2', kind: 'blend', name: 'Lot S9 × Nebula S9', crewId: null, blendId: 'b1', closesAt: '2026-10-10T23:00:00Z', unreadCount: 0, lastMessage: null },
        { id: 'g3', kind: 'board_post', name: 'nope' },
        { kind: 'crew' },
      ],
    })
    expect(rows.map((r) => [r.id, r.kind])).toEqual([
      ['g1', 'crew'],
      ['g2', 'blend'],
    ])
    expect(rows[0].lastMessage?.user.name).toBe('Ishan')
    expect(rows[0].unreadCount).toBe(2)
    expect(crewRoomTitle(rows[1])).toBe('Blend · Lot S9 × Nebula S9')
    expect(crewRoomTitle(rows[0])).toBe('Lot S9')
    expect(crewRoomsFrom({ groups: [] })).toEqual([])
  })
})

describe('crew pushes land where they mean something, and name nobody', () => {
  it('H2: a reply in a crew or Blend room opens as that room; an event or venue day reply as an event room', () => {
    expect(notificationTarget({ type: 'group_message', chatGroupId: 'g1', kind: 'blend', blendId: 'b1' })).toEqual({
      pathname: '/chat/[id]',
      params: { id: 'g1', kind: 'blend', blendId: 'b1' },
    })
    expect(notificationTarget({ type: 'group_message', chatGroupId: 'g2', kind: 'crew', crewId: 'c1' })).toEqual({
      pathname: '/chat/[id]',
      params: { id: 'g2', kind: 'crew', crewId: 'c1' },
    })
    expect(notificationTarget({ type: 'group_message', chatGroupId: 'g3', kind: 'event' })).toEqual({
      pathname: '/chat/[id]',
      params: { id: 'g3' },
    })
  })

  it('an invite opens the crews screen', () => {
    expect(notificationTarget({ type: 'crew_invite', crewId: 'c1' })).toEqual({
      pathname: '/crews/invite/[crewId]',
      params: { crewId: 'c1' },
    })
    expect(notificationTarget({ type: 'crew_invite' })).toBe('/crews')
  })

  it('"We’re here" opens the crew’s chat, where its line is', () => {
    expect(notificationTarget({ type: 'crew_here', crewId: 'c1', chatGroupId: 'g1' })).toEqual({
      pathname: '/chat/[id]',
      params: { id: 'g1', kind: 'crew', crewId: 'c1' },
    })
    expect(notificationTarget({ type: 'crew_here', crewId: 'c1' })).toBe('/crews')
  })

  it('a Blend opens its room, as a Blend', () => {
    expect(notificationTarget({ type: 'blend', blendId: 'b1', chatGroupId: 'g1' })).toEqual({
      pathname: '/chat/[id]',
      params: { id: 'g1', kind: 'blend', blendId: 'b1' },
    })
    expect(notificationTarget({ type: 'blend' })).toBe('/(tabs)/chat')
  })
})

describe('systemPreview (TG-10, S-7)', () => {
  const last = (content: string, type?: string) => ({ content, ...(type ? { type } : null), user: { id: 'u', name: 'Rohan' } })
  it('a system like names who; any other system line is its words; a person’s message is null', () => {
    expect(systemPreview(last('liked Crew Nebula for the crew', 'system'), 'You')).toBe('You liked Crew Nebula for the crew')
    expect(systemPreview(last('The Blend closed', 'system'), 'Rohan')).toBe('The Blend closed')
    expect(systemPreview(last('liked Crew Nebula for the crew', 'text'), 'You')).toBeNull()
  })
  it('a server with no type falls back to the like’s words', () => {
    expect(systemPreview(last('liked Two for the crew'), 'Rohan')).toBe('Rohan liked Two for the crew')
    expect(systemPreview(last('hello'), 'Rohan')).toBeNull()
    expect(systemPreview(null, 'You')).toBeNull()
  })
  it('crewRoomsFrom keeps the type when the server sends one', () => {
    const rows = crewRoomsFrom({ rooms: [{ id: 'r', kind: 'crew', lastMessage: { content: 'x', type: 'system', user: { id: 'u' } } }] })
    expect(rows[0].lastMessage?.type).toBe('system')
    expect(crewRoomsFrom({ rooms: [{ id: 'r', kind: 'crew', lastMessage: { content: 'x', user: { id: 'u' } } }] })[0].lastMessage).not.toHaveProperty('type')
  })
})

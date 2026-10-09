// `lib/notifications` reaches apiClient and AsyncStorage; only its pure router is under test.
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }))
jest.mock('../lib/apiClient', () => ({ apiClient: {}, TokenStorage: {} }))
jest.mock('../lib/logger', () => ({ Logger: { debug: jest.fn(), warn: jest.fn(), error: jest.fn(), info: jest.fn() } }))

import {
  BLEND_CLOSED_LINE,
  COLLAGE_MAX,
  CREW_GONE_LINE,
  CREW_MAX_TAGS,
  CREW_REPORT_REASONS,
  NO_CONSENT,
  blendSides,
  blendTitle,
  closesLine,
  consentBody,
  createCrewBody,
  crewMessage,
  defaultRoomName,
  hereLine,
  hereNowLine,
  invitedLine,
  likeAs,
  mergeCrewPage,
  nextCrewOffset,
  revealCountLine,
  roomClosedLine,
  roomKindParam,
  sideView,
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
      crewMessage({ error: "That's enough new crews for today — try again tomorrow.", errorCode: 'RATE_LIMITED' }, 'create', 'x')
    ).toBe("That's enough new crews for today — try again tomorrow.")
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
    expect(NO_CONSENT).toEqual({ consented: false, keepMeAnonymous: false })
    expect(consentBody(NO_CONSENT)).toBeNull()
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
    const body = createCrewBody(form, NO_CONSENT)
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
  it('an invite says how many you asked, never who got one', () => {
    expect(invitedLine(1)).toBe('Asked 1 friend')
    expect(invitedLine(3)).toBe('Asked 3 friends')
    expect(invitedLine(0)).toBeNull()
    expect(invitedLine(Number.NaN)).toBeNull()
  })

  it('"We’re here" the second time tells nobody, and says so', () => {
    expect(hereLine({ repeated: false })).toBe('Told your crew you’re here 👋')
    expect(hereLine({ repeated: true })).toBe('Your crew already knows you’re here tonight')
  })

  it('a card is counts', () => {
    expect(hereNowLine({ presentCount: 3, size: 5 })).toBe('Here now · 3 of 5')
  })

  it('"N revealed · M keep it private", and nothing before a reveal', () => {
    expect(revealCountLine(0, 2)).toBeNull()
    expect(revealCountLine(4, 0)).toBe('4 revealed')
    expect(revealCountLine(4, 1)).toBe('4 revealed · 1 keeps it private')
    expect(revealCountLine(3, 2)).toBe('3 revealed · 2 keep it private')
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
  revealed: 0,
  keptPrivate: 0,
  people: [],
  ...over,
})

describe('a side of a Blend: the menagerie, then the collage', () => {
  it('anonymous: every person a pseudonym tile, no count line', () => {
    const view = sideView(side({ people: [person({ userId: 'a' }), person({ userId: 'b', pseudonym: 'Quiet Otter' })] }))
    expect(view.mode).toBe('menagerie')
    expect(view.faces).toEqual([])
    expect(view.tiles.map((p) => p.pseudonym)).toEqual(['Cosmic Panda', 'Quiet Otter'])
    expect(view.countLine).toBeNull()
  })

  it('revealed: the revealed are faces, and whoever kept themselves anonymous stays a tile', () => {
    const view = sideView(
      side({
        revealed: 2,
        keptPrivate: 1,
        people: [
          person({ userId: 'a', name: 'Ananya', photo: 'a.jpg' }),
          person({ userId: 'b', name: 'Rohan', photo: 'r.jpg' }),
          person({ userId: 'c', pseudonym: 'Velvet Heron' }),
        ],
      })
    )
    expect(view.mode).toBe('collage')
    expect(view.faces.map((p) => p.name)).toEqual(['Ananya', 'Rohan'])
    expect(view.tiles.map((p) => p.pseudonym)).toEqual(['Velvet Heron'])
    expect(view.countLine).toBe('2 revealed · 1 keeps it private')
  })

  it('a photo without a name is not a reveal: it stays a tile', () => {
    const view = sideView(side({ people: [person({ userId: 'a', photo: 'leak.jpg' })] }))
    expect(view.mode).toBe('menagerie')
    expect(view.tiles).toHaveLength(1)
  })

  it('the collage draws four faces, then "+N"', () => {
    const people = Array.from({ length: 6 }, (_, i) => person({ userId: `p${i}`, name: `N${i}` }))
    const view = sideView(side({ people }))
    expect(view.faces).toHaveLength(COLLAGE_MAX)
    expect(view.more).toBe(2)
  })

  it('one person’s side is named by their first name once revealed, else their pseudonym', () => {
    expect(sideView(side({ kind: 'person', name: null, people: [person({})] })).title).toBe('Cosmic Panda')
    expect(sideView(side({ kind: 'person', name: null, people: [person({ name: 'Kavya' })] })).title).toBe('Kavya')
    expect(sideView(side({ kind: 'person', revealed: 1, people: [person({ name: 'Kavya' })] })).countLine).toBeNull()
  })

  it('yours is the side with your own id; the title is theirs', () => {
    const blend: Blend = {
      blendId: 'b1',
      chatGroupId: 'g1',
      eventId: 'e1',
      closesAt: '2026-10-10T05:00:00Z',
      sides: [side({ name: 'Two', people: [person({ userId: 'me' })] }), side({ name: 'Five', people: [person({ userId: 'rh_1' })] })],
    }
    expect(blendSides(blend, 'me').mine?.name).toBe('Two')
    expect(blendSides(blend, 'me').theirs?.name).toBe('Five')
    expect(blendTitle(blend, 'me')).toBe('Blend with Five')
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

describe('crew pushes land where they mean something, and name nobody', () => {
  it('an invite opens the crews screen', () => {
    expect(notificationTarget({ type: 'crew_invite', crewId: 'c1' })).toBe('/crews')
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

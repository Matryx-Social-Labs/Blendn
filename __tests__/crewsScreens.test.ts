/**
 * What the crew screens say (lib/crewsScreens.ts): the invite lines, the make-a-crew
 * validation and mapping, the refusal titles, the leave sheets and the Blend header.
 */
import type { Blend, BlendSide, CrewInvite } from '../lib/crews'
import {
  blendPeople,
  blendWelcome,
  peopleLine,
  rememberReveal,
  revealRemembered,
  closesAtLine,
  CREW_HEAD_HEIGHT,
  crewBarState,
  closingSoon,
  CREW_NAME_ERROR,
  crewRowSub,
  intentChoice,
  intentLine,
  intentOf,
  inviteLapsed,
  inviteRows,
  inviteSub,
  inviteTitle,
  invitedAgo,
  isGate,
  endSheet,
  heirOf,
  leaveSheet,
  ownerSheet,
  leavingClosesCrew,
  madeLine,
  askedYouIn,
  crewVerb,
  inviteMeta,
  inviteNote,
  makeLabel,
  nameError,
  refusalTitle,
  removeSheet,
  revealedFor,
  sideShape,
  stepLine,
  textFieldOf,
  editOf,
  crewPatch,
} from '../lib/crewsScreens'

const DAY = 24 * 60 * 60 * 1000
const NOW = Date.parse('2026-10-17T12:00:00Z')
const ago = (days: number) => new Date(NOW - days * DAY).toISOString()
const invite = (over: Partial<CrewInvite> = {}): CrewInvite => ({
  crewId: 'c1',
  name: 'The Usual Suspects',
  bio: null,
  emblemSeed: 's',
  tags: [],
  size: 6,
  invitedBy: 'Aisha',
  invitedAt: ago(3),
  ...over,
})

describe('invites', () => {
  it('lapse 14 days after they were sent', () => {
    expect(inviteLapsed(ago(13), NOW)).toBe(false)
    expect(inviteLapsed(ago(14), NOW)).toBe(true)
    expect(inviteLapsed('not a date', NOW)).toBe(false)
  })

  it('say how long ago they came, in words', () => {
    expect(invitedAgo(ago(0), NOW)).toBe('today')
    expect(invitedAgo(ago(1), NOW)).toBe('yesterday')
    expect(invitedAgo(ago(3), NOW)).toBe('3 days ago')
    expect(invitedAgo('nope', NOW)).toBeNull()
  })

  it('put open invites before expired ones', () => {
    const rows = inviteRows([invite({ crewId: 'c-old', invitedAt: ago(20) }), invite({ crewId: 'c-open' })], NOW)
    expect(rows.map((r) => [r.invite.crewId, r.lapsed])).toEqual([
      ['c-open', false],
      ['c-old', true],
    ])
  })

  it('title with the friend and the crew, and a second line that is Expired once lapsed', () => {
    expect(inviteTitle(invite())).toBe('Aisha invited you to The Usual Suspects')
    expect(inviteSub({ invite: invite(), lapsed: false }, NOW)).toBe('Crew of 6 · 3 days ago')
    expect(inviteSub({ invite: invite(), lapsed: true }, NOW)).toBe('Expired')
    expect(inviteSub({ invite: invite({ invitedAt: 'nope' }), lapsed: false }, NOW)).toBe('Crew of 6')
  })
})

describe('a crew row', () => {
  it('says a crew of one is forming without guessing how many were asked', () => {
    expect(crewRowSub(1)).toBe('Just you · starts when someone joins')
    expect(crewRowSub(4)).toBe('Crew of 4')
  })
})

describe('making a crew', () => {
  it('holds the name to 2–32 characters as a person counts them', () => {
    expect(nameError('N')).toBe(CREW_NAME_ERROR)
    expect(nameError('  N  ')).toBe(CREW_NAME_ERROR)
    expect(nameError('Ne')).toBeUndefined()
    expect(nameError('x'.repeat(32))).toBeUndefined()
    expect(nameError('x'.repeat(33))).toBe(CREW_NAME_ERROR)
    // An emoji is one character, as the server's char_length counts it.
    expect(nameError('🎉'.repeat(32))).toBeUndefined()
  })

  it('maps the Here for choice to the intents the server takes, and back', () => {
    expect(intentOf('friendship')).toEqual(['friendship'])
    expect(intentOf('dating')).toEqual(['dating'])
    expect(intentOf('both')).toEqual(['friendship', 'dating'])
    expect(intentChoice(['dating', 'friendship'])).toBe('both')
    expect(intentChoice(['dating'])).toBe('dating')
    expect(intentChoice(['friendship'])).toBe('friendship')
    // A crew set up elsewhere with an intent the picker has no chip for is not forced onto one.
    expect(intentChoice(['networking'])).toBeNull()
    expect(intentChoice([])).toBeNull()
  })

  it('writes the invite card the way board 03 A does: who asked, the crew in one line, the days left', () => {
    const now = Date.parse('2026-11-13T12:00:00Z')
    const inv = (over: Partial<CrewInvite> = {}): CrewInvite => ({
      crewId: 'c',
      name: 'Nebula',
      bio: null,
      emblemSeed: 's',
      tags: [{ slug: 'gig-goers', label: 'Gig goers' }, { slug: 'foodies', label: 'Foodies' }],
      size: 4,
      invitedBy: 'Priya',
      invitedAt: new Date(now - DAY).toISOString(),
      expiresAt: new Date(now + 13 * DAY).toISOString(),
      ...over,
    })
    expect(askedYouIn('प्रियंका')).toBe('प्रियंका asked you in')
    // Hashtags (board crews/tags/01 · Invite card): an old slug's label with its spaces closed up.
    expect(inviteMeta(inv())).toBe('Crew of 4 · #Giggoers · #Foodies')
    expect(inviteMeta(inv({ tags: [] }))).toBe('Crew of 4')
    // The first three, then "+N": one centred line.
    const five = ['sundayrunclub', 'कैफ़ेहॉपिंग', 'chai🍵', 'dosaafter', 'latenight'].map((t) => ({ slug: t, label: t }))
    expect(inviteMeta(inv({ size: 25, tags: five }))).toBe('Crew of 25 · #sundayrunclub · #कैफ़ेहॉपिंग · #chai🍵 · +2')
    // Control: three exactly is all three, no "+0".
    expect(inviteMeta(inv({ tags: five.slice(0, 3) }))).toBe('Crew of 4 · #sundayrunclub · #कैफ़ेहॉपिंग · #chai🍵')
    expect(inviteNote(inv(), now)).toBe('Open for 13 more days · Priya isn’t told if you say not now')
    // Part of a day left is a day: never "0 more days".
    expect(inviteNote(inv({ expiresAt: new Date(now + 2 * 60 * 60 * 1000).toISOString() }), now)).toBe('Open for 1 more day · Priya isn’t told if you say not now')
    expect(inviteNote(inv({ expiresAt: new Date(now + 12.5 * DAY).toISOString() }), now)).toMatch(/^Open for 13 more days/)
    // The server's expiresAt is the clock, not invitedAt + 14 (a shorter TTL is told as it is).
    expect(inviteNote(inv({ invitedAt: new Date(now - 10 * DAY).toISOString(), expiresAt: new Date(now + 2 * DAY).toISOString() }), now)).toMatch(/^Open for 2 more days/)
    // An older server sends no expiresAt: 14 days from the invite.
    expect(inviteNote(inv({ expiresAt: undefined, invitedAt: new Date(now - 4 * DAY).toISOString() }), now)).toMatch(/^Open for 10 more days/)
    // Past it, or unreadable: no days are claimed.
    expect(inviteNote(inv({ expiresAt: new Date(now - 1000).toISOString() }), now)).toBe('Priya isn’t told if you say not now')
    expect(inviteNote(inv({ expiresAt: 'soon', invitedAt: 'never' }), now)).toBe('Priya isn’t told if you say not now')
  })

  it('writes the intent as a line, or nothing', () => {
    expect(intentLine(['friendship', 'dating'])).toBe('Friendship · Dating')
    expect(intentLine([])).toBeUndefined()
  })

  it('writes the step and the Make button the way board 02 A does', () => {
    expect(stepLine(1)).toBe('1 of 2 · Name and friends')
    expect(stepLine(2)).toBe('2 of 2 · Your crew’s vibe')
    expect(makeLabel('Nebula', 3)).toBe('Make Nebula · ask 3 friends')
    expect(makeLabel('Nebula', 1)).toBe('Make Nebula · ask 1 friend')
    // A long name never pushes "ask 3 friends" off the button: the crew is named "the crew" there.
    expect(makeLabel('Indiranagar Sunrise Run Club Cre', 3)).toBe('Make the crew · ask 3 friends')
    // Twelve characters is the last that is named; an emoji is one (the server's char_length).
    expect(crewVerb('Join', 'Twelve chars')).toBe('Join Twelve chars')
    expect(crewVerb('Join', 'Thirteen char')).toBe('Join the crew')
    expect(crewVerb('Join', 'यार टोली')).toBe('Join यार टोली')
    expect(madeLine(3)).toBe('Your crew. 3 invited; it starts when someone joins.')
    expect(madeLine(0)).toBe('Your crew.')
  })

  it('files a refusal under the field the server names, or the one a sentence names', () => {
    expect(textFieldOf('This can’t be a crew’s name.')).toBe('name')
    expect(textFieldOf('This can\'t be a crew\'s bio.')).toBe('bio')
    // The server names the field when it can, and that wins over the sentence.
    expect(textFieldOf('Anything', 'bio')).toBe('bio')
    expect(textFieldOf('This can’t be a crew’s name.', 'bio')).toBe('bio')
    // Contact details are about whichever field held them: without a field it is the form's, not the bio's.
    expect(textFieldOf('A phone number. A crew card is shown to people you haven’t met, so contact details can’t go on it.')).toBeNull()
    expect(textFieldOf('You can own up to 3 crews at a time.')).toBeNull()
    // Tags (admin #981): moderation names `tags`, a validation error `tags.0`; the sentence alone says "a crew’s tag".
    expect(textFieldOf('This can’t be a crew’s tag.')).toBe('tags')
    expect(textFieldOf('Anything', 'tags')).toBe('tags')
    expect(textFieldOf('A tag is 1–24 letters, numbers, _ or emoji — no links, @ or contact details', 'tags.2')).toBe('tags')
    // Control: a field the form has no place for is not filed under one.
    expect(textFieldOf('Anything', 'tagsx')).toBeNull()
  })
})

describe('refusals', () => {
  it.each([
    ['You can own up to 3 crews at a time.', 'Can’t make another crew'],
    ['That’s enough new crews for today — try again tomorrow.', 'Can’t make another crew'],
    ['You can be in up to 10 crews at a time.', 'Can’t join another crew'],
    ['A crew has at most 12 people.', 'This crew is full'],
    ['Something else entirely', 'Couldn’t do that'],
  ])('titles %s', (text, title) => {
    expect(refusalTitle(text)).toBe(title)
  })

  it('the age and set-up gate is its own title, and the only one with a way through', () => {
    const gate = 'Crews are for people 18 and over who have finished setting up.'
    expect(refusalTitle(gate, 'FORBIDDEN')).toBe('Not yet')
    expect(isGate(gate, 'FORBIDDEN')).toBe(true)
    expect(isGate('You can own up to 3 crews at a time.', 'CONFLICT')).toBe(false)
  })
})

describe('leaving and removing', () => {
  it('a crew of two closes when one leaves, and the sheet says so', () => {
    expect(leavingClosesCrew({ size: 2 })).toBe(true)
    expect(leavingClosesCrew({ size: 3 })).toBe(false)
    expect(leaveSheet({ name: 'Nebula', size: 2 })).toEqual({
      title: 'Leave Nebula?',
      message: 'Leaving will close the crew — there’ll be one of you left.',
      action: 'Leave and close the crew',
    })
    expect(leaveSheet({ name: 'Nebula', size: 4 }).action).toBe('Leave crew')
    expect(leaveSheet({ name: 'Nebula', size: 4 }).message).toContain('Nobody is told you left')
  })

  // Crews 5A (board 06-leave, A · owner): the owner's two doors. The owner of a crew that carries on no longer gets the member's
  // Leave sheet; a crew of two still closes, owner or not. Negative control: the member's words fail the owner's.
  const at = (userId: string, name: string, role: 'owner' | 'member', joinedAt: string) => ({ userId, isFriend: true, name, photo: null, role, joinedAt })
  const owned = {
    name: 'Nebula',
    size: 4,
    you: { role: 'owner' as const, keepMeAnonymous: false },
    members: [
      at('me', 'Sam', 'owner', '2026-10-01T10:00:00Z'),
      at('rh_kabir', 'Kabir', 'member', '2026-10-05T10:00:00Z'),
      at('rh_priya', 'Priya', 'member', '2026-10-02T10:00:00Z'),
      at('rh_arjun', 'Arjun', 'member', '2026-10-03T10:00:00Z'),
    ],
  }

  it('the owner’s heir is the member who joined first, never the owner', () => {
    expect(heirOf(owned)?.name).toBe('Priya')
    expect(heirOf({ members: [at('me', 'Sam', 'owner', '2026-09-01T10:00:00Z')] })).toBeNull()
  })

  it('the owner gets two doors, each saying what happens to the others', () => {
    expect(ownerSheet(owned)).toEqual({ title: 'Nebula', message: 'You own this crew.', leave: 'Leave — Priya takes it over', end: 'End the crew for everyone' })
    // Nobody listed to hand it to (kept apart from the owner): the door still says it passes on, unnamed.
    expect(ownerSheet({ ...owned, members: owned.members.slice(0, 1) }).leave).toBe('Leave — it passes on')
  })

  it('ending says exactly what ends, and that nobody is told', () => {
    expect(endSheet(owned)).toEqual({
      title: 'End Nebula?',
      message:
        'The crew and its chat close for all 4 of you, and the chat can’t be opened again. Its invites are cancelled and open Mixes close. Your friendships stay. Nobody is notified. This can’t be undone.',
      action: 'End Nebula',
    })
  })

  it('a crew of two still closes when its owner leaves; a member’s words are unchanged', () => {
    expect(leaveSheet({ ...owned, size: 2 }).action).toBe('Leave and close the crew')
    expect(leaveSheet({ name: 'Nebula', size: 4 }).message).toContain('Nobody is told you left')
  })

  it('removing a member names them, and says they are not told who did it', () => {
    expect(removeSheet({ name: 'Nebula' }, 'Rohan')).toEqual({
      title: 'Remove Rohan from Nebula?',
      message: 'Rohan loses the crew and its chat. They aren’t told who removed them. They can be invited again later.',
    })
  })
})

describe('a Mix', () => {
  const side = (over: Partial<BlendSide>): BlendSide => ({
    kind: 'crew',
    crewId: 'c',
    name: 'Nebula',
    emblemSeed: 's',
    mine: false,
    count: 3,
    revealed: null,
    keptPrivate: null,
    people: [],
    ...over,
  })
  const blend = (closesAt: string, sides: BlendSide[] = [side({ mine: true, count: 3 }), side({ count: 4 })]): Blend => ({
    blendId: 'b',
    chatGroupId: 'g',
    eventId: 'e',
    closesAt,
    sides,
  })

  it('counts everyone you can see on both sides', () => {
    expect(blendPeople(blend(ago(0)))).toBe(7)
  })

  it('writes the header’s people line', () => {
    expect(peopleLine(blend(ago(0)))).toBe('7 people')
  })

  it('says where it was made when the event is known, and not otherwise', () => {
    const at = new Date(2026, 9, 18, 4).toISOString()
    expect(blendWelcome(at, 'Toit')).toBe('Made at Toit · closes 4 am. Everyone here is on tonight’s names until they reveal.')
    expect(blendWelcome(at)).toBe('Made tonight · closes 4 am. Everyone here is on tonight’s names until they reveal.')
  })

  it('remembers a reveal for the account that made it, on this phone', () => {
    rememberReveal('me', 'b-remembered')
    expect(revealRemembered('me', 'b-remembered')).toBe(true)
    expect(revealRemembered('someone-else', 'b-remembered')).toBe(false)
    expect(revealRemembered('me', 'b-other')).toBe(false)
    expect(revealRemembered(undefined, 'b-remembered')).toBe(false)
  })

  it('is quiet until the last hour, then says when it closes', () => {
    expect(closingSoon(new Date(NOW + 61 * 60 * 1000).toISOString(), NOW)).toBe(false)
    expect(closingSoon(new Date(NOW + 60 * 60 * 1000).toISOString(), NOW)).toBe(true)
    expect(closingSoon(new Date(NOW - 1000).toISOString(), NOW)).toBe(false)
    expect(closingSoon('nope', NOW)).toBe(false)
  })

  it('reads the closing time on the phone’s own clock', () => {
    const at = (h: number, m = 0) => new Date(2026, 9, 18, h, m).toISOString()
    expect(closesAtLine(at(4))).toBe('This Mix closes at 4 am')
    expect(closesAtLine(at(0))).toBe('This Mix closes at 12 am')
    expect(closesAtLine(at(12, 30))).toBe('This Mix closes at 12:30 pm')
    expect(closesAtLine(at(23, 5))).toBe('This Mix closes at 11:05 pm')
    expect(closesAtLine('nope')).toBeNull()
  })

  it('knows its crew revealed from the server’s flag or from the tap on this screen, and not otherwise', () => {
    expect(revealedFor(side({ crewRevealed: true }), false)).toBe(true)
    expect(revealedFor(side({ crewRevealed: null }), true)).toBe(true)
    expect(revealedFor(side({}), false)).toBe(false)
    expect(revealedFor(null, false)).toBe(false)
  })
})

describe('a side as RevealSide draws it', () => {
  const person = (userId: string, pseudonym: string, name: string | null = null, photo: string | null = null) => ({ userId, pseudonym, name, photo })
  const side = (over: Partial<BlendSide>): BlendSide => ({
    kind: 'crew',
    crewId: 'c',
    name: 'Orbit',
    emblemSeed: 'seed',
    mine: false,
    count: 3,
    revealed: 1,
    keptPrivate: 1,
    people: [],
    ...over,
  })

  it('lists their side alphabetically, a photo only for the one the server named', () => {
    const shape = sideShape(
      side({ people: [person('b', 'Quiet Otter', 'Vikram', 'v.jpg'), person('a', 'Velvet Heron'), person('c', 'Brave Turtle', null, 'leak.jpg')] }),
      'me'
    )
    expect(shape.side).toEqual({ kind: 'crew', name: 'Orbit', emblemSeed: 'seed' })
    expect(shape.people).toEqual([
      { pseudonym: 'Brave Turtle', photo: null },
      { pseudonym: 'Quiet Otter', photo: 'v.jpg' },
      { pseudonym: 'Velvet Heron', photo: null },
    ])
    expect(shape.status).toBeUndefined()
  })

  it('draws one person on their side as that person: the revealed first name, or tonight’s name', () => {
    const solo = (name: string | null) => side({ kind: 'person', crewId: null, name: null, emblemSeed: null, count: 1, people: [person('a', 'Quiet Heron', name, 'h.jpg')] })
    expect(sideShape(solo(null), 'me').side).toEqual({ kind: 'person', name: 'Quiet Heron', pseudonym: 'Quiet Heron' })
    expect(sideShape(solo('Heron'), 'me').side).toEqual({ kind: 'person', name: 'Heron', pseudonym: 'Quiet Heron' })
  })

  it('your side, when the server sends only you, is you and what is known, never a count of who kept private', () => {
    const mine = side({ mine: true, count: 4, revealed: null, keptPrivate: null, people: [person('me', 'Cosmic Panda', 'Sam', 'sam.jpg')] })
    expect(sideShape(mine, 'me')).toEqual({
      side: { kind: 'crew', name: 'Orbit', emblemSeed: 'seed' },
      people: [{ pseudonym: 'Cosmic Panda', photo: null }],
      status: '4 on tonight’s names',
    })
    // Once the crew has revealed, your own face shows and the line says so.
    expect(sideShape(mine, 'me', true)).toMatchObject({ people: [{ pseudonym: 'Cosmic Panda', photo: 'sam.jpg' }], status: 'Revealed' })
    expect(sideShape({ ...mine, crewRevealed: true }, 'me')).toMatchObject({ status: 'Revealed' })
    // The server not naming you (you keep anonymous) means no face and no "Revealed", whatever was tapped.
    const unnamed = { ...mine, people: [person('me', 'Cosmic Panda')] }
    expect(sideShape(unnamed, 'me', true)).toEqual({
      side: { kind: 'crew', name: 'Orbit', emblemSeed: 'seed' },
      people: [{ pseudonym: 'Cosmic Panda', photo: null }],
      status: '4 on tonight’s names',
    })
  })

  it('a solo person on your side is You', () => {
    const solo = side({ kind: 'person', crewId: null, name: null, emblemSeed: null, mine: true, count: 1, revealed: null, keptPrivate: null, people: [person('me', 'Cosmic Panda', 'Sam', 's.jpg')] })
    expect(sideShape(solo, 'me').side).toEqual({ kind: 'person', name: 'You', pseudonym: 'Cosmic Panda' })
    expect(sideShape(solo, 'me').status).toBe('1 on tonight’s names')
  })
})

describe('the crew page’s bar', () => {
  it('is bare at rest, glass past 8 pt, and condensed once the head has gone', () => {
    expect(crewBarState(0)).toBe('rest')
    expect(crewBarState(8)).toBe('rest')
    expect(crewBarState(9)).toBe('scrolled')
    expect(crewBarState(CREW_HEAD_HEIGHT)).toBe('scrolled')
    expect(crewBarState(CREW_HEAD_HEIGHT + 1)).toBe('condensed')
    expect(crewBarState(-40)).toBe('rest')
  })
})

describe('Edit crew’s tags (free hashtags)', () => {
  const crew = {
    name: 'Nebula',
    bio: null,
    intent: ['friendship'],
    tags: [{ slug: 'quiz-team', label: 'Quiz team' }, { slug: 'sundayrunclub', label: 'SundayRunClub' }],
    openToSolo: false,
  } as never

  it('starts from the tags as drawn, and an untouched set is not sent', () => {
    const edit = editOf(crew)
    expect(edit.tags).toEqual(['Quizteam', 'SundayRunClub'])
    expect(crewPatch(crew, edit)).toBeNull()
  })

  it('a removed or added tag sends the whole set, as typed', () => {
    const edit = editOf(crew)
    expect(crewPatch(crew, { ...edit, tags: ['SundayRunClub'] })).toEqual({ tags: ['SundayRunClub'] })
    expect(crewPatch(crew, { ...edit, tags: [...edit.tags, 'chai🍵'] })).toEqual({ tags: ['Quizteam', 'SundayRunClub', 'chai🍵'] })
  })

  it('a reorder alone is not a change', () => {
    const edit = editOf(crew)
    expect(crewPatch(crew, { ...edit, tags: [...edit.tags].reverse() })).toBeNull()
  })
})

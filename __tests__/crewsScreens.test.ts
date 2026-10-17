/**
 * What the crew screens say (lib/crewsScreens.ts): the invite lines, the make-a-crew
 * validation and mapping, the refusal titles, the leave sheets and the Blend header.
 */
import type { Blend, BlendSide, CrewInvite } from '../lib/crews'
import {
  blendPeople,
  blendSub,
  closesAtLine,
  closingSoon,
  CREW_NAME_ERROR,
  crewRowSub,
  goneInvites,
  intentChoice,
  intentLine,
  intentOf,
  inviteLapsed,
  inviteRows,
  inviteSub,
  inviteTitle,
  invitedAgo,
  isGate,
  leaveSheet,
  leavingClosesCrew,
  madeLine,
  makeSummary,
  nameError,
  refusalTitle,
  removeSheet,
  revealedFor,
  stepLine,
  textFieldOf,
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

  it('put open invites before expired ones, and expire one the session saw go', () => {
    const gone = new Set(['c-gone'])
    const rows = inviteRows(
      [invite({ crewId: 'c-gone' }), invite({ crewId: 'c-old', invitedAt: ago(20) }), invite({ crewId: 'c-open' })],
      gone,
      NOW
    )
    expect(rows.map((r) => [r.invite.crewId, r.lapsed])).toEqual([
      ['c-open', false],
      ['c-gone', true],
      ['c-old', true],
    ])
  })

  it('reads the module set of gone invites by default', () => {
    goneInvites.add('c1')
    expect(inviteRows([invite()], undefined, NOW)[0].lapsed).toBe(true)
    goneInvites.clear()
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

  it('writes the intent as a line, or nothing', () => {
    expect(intentLine(['friendship', 'dating'])).toBe('Friendship · Dating')
    expect(intentLine([])).toBeUndefined()
  })

  it('writes the step and the summary the way the frames do', () => {
    expect(stepLine(1)).toBe('1 of 3 · Name and vibe')
    expect(stepLine(3)).toBe('3 of 3 · Consent')
    expect(makeSummary({ invited: 3, intent: ['friendship'], tags: ['Dance floor', 'Techno heads'] })).toBe(
      '3 invited · Friendship · Dance floor, Techno heads'
    )
    expect(makeSummary({ invited: 1, intent: [], tags: [] })).toBe('1 invited')
    expect(madeLine(3)).toBe('Your crew. 3 invited; it starts when someone joins.')
    expect(madeLine(0)).toBe('Your crew.')
  })

  it('files a server sentence under the field it is about', () => {
    expect(textFieldOf('This can’t be a crew’s name.')).toBe('name')
    expect(textFieldOf('This can\'t be a crew\'s bio.')).toBe('bio')
    expect(textFieldOf('A phone number. A crew card is shown to people you haven’t met, so contact details can’t go on it.')).toBe('bio')
    expect(textFieldOf('You can own up to 3 crews at a time.')).toBeNull()
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

  it('removing a member names them, and says they are not told who did it', () => {
    expect(removeSheet({ name: 'Nebula' }, 'Rohan')).toEqual({
      title: 'Remove Rohan from Nebula?',
      message: 'Rohan loses the crew and its chat. They aren’t told who removed them. They can be invited again later.',
    })
  })
})

describe('a Blend', () => {
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

  it('writes the header line from the people and the clock', () => {
    const closes = new Date(NOW + 9 * 60 * 60 * 1000).toISOString()
    expect(blendSub(blend(closes), NOW)).toBe('7 people · Closes in 9h')
  })

  it('is quiet until the last hour, then says when it closes', () => {
    expect(closingSoon(new Date(NOW + 61 * 60 * 1000).toISOString(), NOW)).toBe(false)
    expect(closingSoon(new Date(NOW + 60 * 60 * 1000).toISOString(), NOW)).toBe(true)
    expect(closingSoon(new Date(NOW - 1000).toISOString(), NOW)).toBe(false)
    expect(closingSoon('nope', NOW)).toBe(false)
  })

  it('reads the closing time on the phone’s own clock', () => {
    const at = (h: number, m = 0) => new Date(2026, 9, 18, h, m).toISOString()
    expect(closesAtLine(at(4))).toBe('This Blend closes at 4 am')
    expect(closesAtLine(at(0))).toBe('This Blend closes at 12 am')
    expect(closesAtLine(at(12, 30))).toBe('This Blend closes at 12:30 pm')
    expect(closesAtLine(at(23, 5))).toBe('This Blend closes at 11:05 pm')
    expect(closesAtLine('nope')).toBeNull()
  })

  it('knows its crew revealed from the server’s flag or from the tap on this screen, and not otherwise', () => {
    expect(revealedFor(side({ crewRevealed: true }), false)).toBe(true)
    expect(revealedFor(side({ crewRevealed: null }), true)).toBe(true)
    expect(revealedFor(side({}), false)).toBe(false)
    expect(revealedFor(null, false)).toBe(false)
  })
})

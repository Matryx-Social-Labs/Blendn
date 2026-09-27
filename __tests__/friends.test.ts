import {
  friendsCountLabel,
  friendsSinceLabel,
  inviteCta,
  inviteLine,
  inviteMessage,
  type FriendState,
} from '../lib/friends'

/**
 * What the friend screens say, for every state the server can answer with.
 *
 * `incoming` is the one worth a second look: it ASKS back rather than looking
 * the request up, because the server treats two people asking each other as
 * both saying yes. If that ever changes on the server, this is the test that
 * should be rewritten, not deleted.
 */
const STATES: FriendState[] = ['none', 'incoming', 'requested', 'friends', 'self']

describe('the invite screen', () => {
  it('offers the right action for each state', () => {
    expect(STATES.map((s) => [s, inviteCta(s)])).toEqual([
      ['none', { label: 'Send friend request', action: 'ask' }],
      ['incoming', { label: 'Accept friend request', action: 'ask' }],
      // Nothing to press: asking again would not nag, but it would not do anything either.
      ['requested', { label: 'Requested', action: null }],
      ['friends', { label: 'View profile', action: 'open' }],
      ['self', { label: 'Share your link', action: 'share' }],
    ])
  })

  it('never tells the asker a request was declined', () => {
    // "Not now" is not a state the app can see: the sender stays "requested".
    for (const s of STATES) expect(inviteLine(s)).not.toMatch(/declin|reject|not now/i)
    expect(inviteLine('requested')).toMatch(/waiting/)
  })
})

describe('sharing', () => {
  it('sends the link itself, in a line short enough for somebody else\'s chat', () => {
    const url = 'https://www.blendn.app/f/abcdefghijklmnopqrstuv'
    expect(inviteMessage(url)).toBe(`Add me on Blend'n: ${url}`)
  })
})

describe('labels', () => {
  it('says month and year for a friendship, never the day', () => {
    expect(friendsSinceLabel('2026-09-27T21:54:00.000Z')).toBe('Friends since Sep 2026')
    expect(friendsSinceLabel('not a date')).toBe('Friends')
  })

  it('counts friends in words', () => {
    expect(friendsCountLabel(1)).toBe('1 friend')
    expect(friendsCountLabel(3)).toBe('3 friends')
  })
})

/**
 * "Add friend" after a match (SCRUM-750), the pure half: the server's `friend` read at the boundary, what each state
 * draws, which ids may be sent, and what each answer to `POST /friends/requests` means.
 */
import { afterAsk, friendAction, friendAskOutcome, FRIEND_COPY, isHandle, parseFriendOffer, type FriendOffer } from '../lib/friendOffer'

describe('parseFriendOffer', () => {
  it('reads exactly { state, canAdd }', () => {
    expect(parseFriendOffer({ state: 'incoming', canAdd: true })).toEqual({ state: 'incoming', canAdd: true })
  })

  it.each([undefined, null, 'none', 3, [], {}, { state: 'none' }, { canAdd: true }, { state: 'self', canAdd: false }, { state: 'none', canAdd: 'yes' }])(
    'reads %p as no offer',
    (raw) => expect(parseFriendOffer(raw)).toBeNull()
  )
})

describe('friendAction: one reading of each state', () => {
  const draw = (state: FriendOffer['state'], canAdd: boolean) => friendAction({ state, canAdd })

  it('none + canAdd is the lit Add friend', () => {
    expect(draw('none', true)).toMatchObject({ kind: 'add', label: 'Add friend', lit: true, disabled: false })
  })

  it('incoming + canAdd is the lit Accept (asking back accepts)', () => {
    expect(draw('incoming', true)).toMatchObject({ kind: 'accept', label: 'Accept', lit: true, disabled: false })
  })

  it('requested is a quiet, disabled Requested', () => {
    expect(draw('requested', false)).toMatchObject({ kind: 'requested', label: 'Requested', lit: false, disabled: true })
  })

  it('friends is a quiet, disabled Friends', () => {
    expect(draw('friends', false)).toMatchObject({ kind: 'friends', label: 'Friends', lit: false, disabled: true })
  })

  it('draws nothing for a person the server does not offer, and for no offer at all', () => {
    expect(draw('none', false)).toBeNull()
    expect(draw('incoming', false)).toBeNull()
    expect(friendAction(null)).toBeNull()
  })

  it('never offers Add friend on `canAdd: false`, whatever the state (the UI keys on canAdd)', () => {
    for (const state of ['none', 'incoming'] as const) expect(draw(state, false)?.lit ?? false).toBe(false)
  })

  it('every lit action has a glyph', () => {
    expect(draw('none', true)?.icon).toBe('user-plus')
    expect(draw('incoming', true)?.icon).toBe('user-check')
  })
})

it('after an ask nothing is addable, whatever the answer was', () => {
  expect(afterAsk('requested')).toEqual({ state: 'requested', canAdd: false })
  expect(afterAsk('friends')).toEqual({ state: 'friends', canAdd: false })
})

describe('isHandle', () => {
  it('knows a room or conversation handle from an account id', () => {
    expect(isHandle('rh_AbCd-123')).toBe(true)
    expect(isHandle('cmgq8x0a10000abcd')).toBe(false)
    expect(isHandle('')).toBe(false)
  })
})

describe('friendAskOutcome', () => {
  it.each(['requested', 'friends'] as const)('%s is a success', (state) => {
    expect(friendAskOutcome({ success: true, data: { state } })).toEqual({ ok: true, state })
  })

  it('a success with a state it does not know is a failure, not a guess', () => {
    expect(friendAskOutcome({ success: true, data: { state: 'none' } })).toEqual({ ok: false, reason: 'failed' })
    expect(friendAskOutcome({ success: true })).toEqual({ ok: false, reason: 'failed' })
  })

  it('NOT_A_REVEALED_MATCH on the 404 means "reveal first"', () => {
    expect(friendAskOutcome({ success: false, errorCode: 'NOT_FOUND', reasonCode: 'NOT_A_REVEALED_MATCH' })).toEqual({ ok: false, reason: 'reveal-first' })
  })

  it.each([
    { errorCode: 'NOT_FOUND' },
    { errorCode: 'NOT_FOUND', reasonCode: 'SOMETHING_ELSE' },
    { errorCode: 'RATE_LIMITED' },
    { errorCode: undefined },
  ])('any other refusal (%p) is the standard failure', (refusal) => {
    expect(friendAskOutcome({ success: false, ...refusal })).toEqual({ ok: false, reason: 'failed' })
  })
})

it('says who a request went to, and never names a place', () => {
  expect(FRIEND_COPY.requested('Mika')).toBe('Friend request sent to Mika')
  expect(FRIEND_COPY.friends('Mika')).toBe('You and Mika are friends')
  expect(FRIEND_COPY.revealFirst).toBe('Reveal yourself first')
})

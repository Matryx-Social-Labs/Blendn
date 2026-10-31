import { lockFor, lockForReason, lockFromDoor } from '../lib/useComposerLock'

describe('lockForReason: the server\'s word, not its sentence (SV-5, ROOM-05)', () => {
  it('maps write.reason to the composer state', () => {
    expect(lockForReason('muted')?.state).toBe('muted')
    // SCRUM-893: no organizer lock; a server that still says `locked` reads as a closed room, read-only either way.
    expect(lockForReason('locked')?.state).toBe('closed')
    expect(lockForReason('window_closed')?.state).toBe('closed')
    expect(lockForReason('archived')?.state).toBe('closed')
    expect(lockForReason('not_open_yet')?.state).toBe('notopen')
    expect(lockForReason('hidden')?.state).toBe('hidden')
  })
  it('banned, left, not_live and unknown are not composer locks', () => {
    for (const r of ['banned', 'left', 'not_live', 'whatever', null, undefined]) expect(lockForReason(r)).toBeNull()
  })
  it('lockFor prefers reasonCode over the sentence, and falls back to the regex without it', () => {
    expect(lockFor('CHAT_CLOSED', 'This chat opens 24 hours before the event starts.', 'window_closed')?.state).toBe('closed')
    expect(lockFor('CHAT_CLOSED', 'This chat opens 24 hours before the event starts.')?.state).toBe('notopen')
    expect(lockFor('USER_MUTED', 'x', 'unknown_code')?.state).toBe('muted')
  })
})

describe('lockFromDoor', () => {
  it('a locked status (nothing writes it, SCRUM-893) reads as closed, and still wins over a mute', () => {
    expect(lockFromDoor({ status: 'locked', write: { allowed: false, reason: 'muted' } })?.state).toBe('closed')
  })
  it('CHAT_LOCKED from a send reads as closed', () => {
    expect(lockFor('CHAT_LOCKED', 'x')).toEqual({ state: 'closed', reason: 'x' })
  })
  it('a mute, with the server\'s sentence', () => {
    expect(lockFromDoor({ status: 'active', write: { allowed: false, reason: 'muted', message: 'm' } })).toEqual({ state: 'muted', reason: 'm' })
  })
  it('allowed, not yet open, malformed or absent: no lock', () => {
    expect(lockFromDoor({ write: { allowed: true, reason: null } })).toBeNull()
    expect(lockFromDoor({ write: { allowed: false, reason: 'not_open_yet' } })).toBeNull()
    expect(lockFromDoor({})).toBeNull()
    expect(lockFromDoor(null)).toBeNull()
  })
})

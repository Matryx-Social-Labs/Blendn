import { typingLabel } from '../components/chat/TypingIndicator'
import {
  directHeaderAvatar,
  emptyThreadLine,
  isLocalMessage,
  optimisticDirectMessage,
  settleDirectMessage,
  type PrivateMessage,
} from '../lib/directThread'
import { profileIdentity, withheldUnlessVisible } from '../lib/profileIdentity'
import { markSeed, pseudonymAvatar } from '../lib/pseudonymAvatar'
import { userMessage } from '../lib/userMessage'

/*
 * The logic behind the social-screens polish pass: the one avatar seed rule,
 * the DM's names and optimistic bubble, the fail-closed profile, and the one
 * error voice.
 */

describe('one seed rule for a person’s mark', () => {
  it('draws the animal the pseudonym names', () => {
    // "Cosmic Panda" and "Quiet Otter" both drew a bee.
    expect(pseudonymAvatar('Cosmic Panda').character).toBe('🐼')
    expect(pseudonymAvatar('Quiet Otter').character).toBe('🦦')
    expect(pseudonymAvatar('Amber Fox').character).toBe('🦊')
    expect(pseudonymAvatar('Velvet Heron').character).toBe('🐦')
    // A collision suffix does not hide the noun.
    expect(pseudonymAvatar('Cosmic Panda 2').character).toBe('🐼')
  })

  it('keeps the hashed cast for a noun that is not a creature', () => {
    const a = pseudonymAvatar('Neon Comet')
    expect(a.character).toBeTruthy()
    expect(pseudonymAvatar('Neon Comet')).toEqual(a)
  })

  it('seeds on the pseudonym, so every surface that has the name agrees', () => {
    // The Room grid's `Face` seeds `pseudonymAvatar(name)`; the chat now seeds
    // `markSeed(senderName, room:sender)`, which is the same string.
    expect(markSeed('Cosmic Panda', 'g1:rh_x')).toBe('Cosmic Panda')
    expect(pseudonymAvatar(markSeed('Cosmic Panda', 'g1:rh_x'))).toEqual(pseudonymAvatar('Cosmic Panda'))
  })

  it('falls back per person and per room for a placeholder name, never to a bare id', () => {
    expect(markSeed('Attendee', 'g1:rh_a')).toBe('g1:rh_a')
    expect(markSeed('', 'g1:rh_b')).toBe('g1:rh_b')
    expect(markSeed(null, 'g1:rh_c')).toBe('g1:rh_c')
    expect(markSeed('  Someone ', 'g1:rh_d')).toBe('g1:rh_d')
    // Two unresolved people in one room do not share a seed.
    expect(markSeed('Attendee', 'g1:rh_a')).not.toBe(markSeed('Attendee', 'g1:rh_b'))
  })
})

describe('the DM says their name once, in one grammar', () => {
  it('writes "{name} is typing…" from the server’s name', () => {
    expect(typingLabel(['Mika'])).toBe('Mika is typing…')
    expect(typingLabel(['Cosmic Panda'])).toBe('Cosmic Panda is typing…')
  })

  it('never uppercases a name and never leaves it blank', () => {
    expect(typingLabel(['mika'])).toBe('mika is typing…')
    expect(typingLabel([''])).toBe('Someone is typing…')
    expect(typingLabel([])).toBe('Someone is typing…')
  })

  it('counts several people in the room', () => {
    expect(typingLabel(['A', 'B', 'C'])).toBe('3 people are typing…')
  })

  it('says hi by the server’s name, the param only as a first paint, and nothing without either', () => {
    expect(emptyThreadLine('Mika', 'Old name')).toBe('Say hi to Mika.')
    expect(emptyThreadLine(null, 'Mika')).toBe('Say hi to Mika.')
    // It read "Say hi to ." when opened from a push.
    expect(emptyThreadLine(null, null)).toBeNull()
    expect(emptyThreadLine(undefined, '  ')).toBeNull()
  })

  it('draws the pseudonym mark in the header until they reveal', () => {
    const reveal = { displayName: 'Cosmic Panda', pseudonymous: true, theyRevealed: false }
    expect(directHeaderAvatar(reveal, null, 'https://cdn/route.jpg')).toEqual({ kind: 'mark', seed: 'Cosmic Panda' })
    expect(directHeaderAvatar({ ...reveal, theyRevealed: true }, 'https://cdn/them.jpg', null)).toEqual({
      kind: 'photo',
      url: 'https://cdn/them.jpg',
    })
  })

  it('uses the route avatar only before the conversation record lands', () => {
    expect(directHeaderAvatar(null, null, 'https://cdn/route.jpg')).toEqual({ kind: 'photo', url: 'https://cdn/route.jpg' })
    const named = { displayName: 'Mika', pseudonymous: false, theyRevealed: true }
    expect(directHeaderAvatar(named, null, 'https://cdn/route.jpg')).toEqual({ kind: 'initials' })
  })
})

describe('the optimistic DM bubble', () => {
  const sent = (id: string): PrivateMessage => ({
    id,
    conversationId: 'c1',
    senderId: 'me',
    sender: { id: 'me', name: 'Me', image: null },
    text: 'hi',
    isRead: false,
    createdAt: '2026-09-29T10:00:00.000Z',
  })

  it('is drawn at once under a local id, yours and unread', () => {
    const local = optimisticDirectMessage('hi', 'c1', 'me')
    expect(local.id).toMatch(/^local-/)
    expect(isLocalMessage(local)).toBe(true)
    expect(local).toMatchObject({ text: 'hi', senderId: 'me', conversationId: 'c1', isRead: false })
    expect(local.failed).toBeUndefined()
    expect(optimisticDirectMessage('hi', 'c1', 'me').id).not.toBe(local.id)
  })

  it('takes the server’s copy in its place on success', () => {
    const local = optimisticDirectMessage('hi', 'c1', 'me')
    const before = [sent('m1'), local]
    const after = settleDirectMessage(before, local.id, sent('m2'))
    expect(after.map((m) => m.id)).toEqual(['m1', 'm2'])
  })

  it('drops the local copy when the socket echo landed first — no second row', () => {
    const local = optimisticDirectMessage('hi', 'c1', 'me')
    const before = [local, sent('m2')]
    expect(settleDirectMessage(before, local.id, sent('m2')).map((m) => m.id)).toEqual(['m2'])
  })

  it('treats a failed send as still local, so a refresh keeps it', () => {
    const failed = { ...optimisticDirectMessage('hi', 'c1', 'me'), failed: true }
    expect(isLocalMessage(failed)).toBe(true)
    expect(isLocalMessage(sent('m1'))).toBe(false)
  })
})

describe('the attendee profile fails closed', () => {
  const leaked = { name: 'Ben', age: 29, photos: ['https://cdn/ben.jpg'], bio: 'Hi', occupation: 'Chef', education: 'MIT' }

  it('drops every identity field unless identityVisible is true', () => {
    const shown = withheldUnlessVisible({ ...leaked, identityVisible: false })
    expect(shown.photos).toEqual([])
    expect(shown.bio).toBeUndefined()
    expect(shown.occupation).toBeUndefined()
    expect(shown.education).toBeUndefined()
    expect(withheldUnlessVisible({ ...leaked, identityVisible: true })).toMatchObject(leaked)
  })

  it('titles them by the room’s pseudonym, never the leaked name or "Attendee"', () => {
    const who = profileIdentity({ ...leaked, identityVisible: false }, { pseudonym: 'Cosmic Panda', roomSeed: 'g1:rh_b' })
    expect(who).toEqual({ revealed: false, title: 'Cosmic Panda', seed: 'Cosmic Panda' })
    const nobody = profileIdentity({ name: 'Attendee', identityVisible: false })
    expect(nobody.title).toBe('Someone')
    expect(nobody.seed).not.toContain('Attendee')
  })

  it('seeds the hero from the room seed, not "Attendee", when the pseudonym is a placeholder', () => {
    expect(profileIdentity({ identityVisible: false }, { pseudonym: 'Attendee', roomSeed: 'g1:rh_b' }).seed).toBe('g1:rh_b')
  })

  it('names them once the server says so', () => {
    expect(profileIdentity({ ...leaked, identityVisible: true }).title).toBe('Ben, 29')
  })
})

describe('userMessage: the server’s words only when they were written for a person', () => {
  it('passes a known code’s sentence through', () => {
    expect(userMessage({ error: "You're muted in this room.", errorCode: 'USER_MUTED' }, "Couldn't send. Try again.")).toBe(
      "You're muted in this room."
    )
    expect(userMessage({ error: 'Add a photo to your profile first', errorCode: 'reveal_incomplete' }, 'x')).toBe(
      'Add a photo to your profile first'
    )
  })

  it('uses the screen’s sentence for anything else', () => {
    const fallback = "Couldn't send. Try again."
    expect(userMessage({ error: 'Failed to update profile' }, fallback)).toBe(fallback)
    expect(userMessage({ error: 'Invalid input: expected string', errorCode: 'VALIDATION_FAILED' }, fallback)).toBe(fallback)
    expect(userMessage({ error: '', errorCode: 'USER_MUTED' }, fallback)).toBe(fallback)
    expect(userMessage(undefined, fallback)).toBe(fallback)
  })
})

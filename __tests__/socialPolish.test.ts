import {
  directHeaderAvatar,
  emptyThreadLine,
  isLocalMessage,
  optimisticDirectMessage,
  settleDirectMessage,
  type PrivateMessage,
} from '../lib/directThread'
import { profileIdentity, roomNameFrom, withheldUnlessVisible } from '../lib/profileIdentity'
import { creatureFor } from '../components/ds/Creature'
import { markSeed } from '../lib/creatureSeed'
import { userMessage } from '../lib/userMessage'

/*
 * The logic behind the social-screens polish pass: the one avatar seed rule,
 * the DM's names and optimistic bubble, the fail-closed profile, and the one
 * error voice.
 */

describe('one seed rule for a person’s mark', () => {
  it('draws the animal the pseudonym names', () => {
    // "Cosmic Panda" and "Quiet Otter" both drew a bee.
    expect(creatureFor('Cosmic Panda').species).toBe('panda')
    expect(creatureFor('Quiet Otter').species).toBe('otter')
    expect(creatureFor('Amber Fox').species).toBe('fox')
    // A collision suffix does not hide the noun.
    expect(creatureFor('Cosmic Panda 2').species).toBe('panda')
  })

  it('keeps the seeded cast for a noun that is not a creature', () => {
    const a = creatureFor('Neon Comet')
    expect(a.species).toBeTruthy()
    expect(creatureFor('Neon Comet')).toEqual(a)
  })

  it('seeds on the pseudonym, so every surface that has the name agrees', () => {
    // The Room grid seeds the creature on the name; the chat seeds
    // `markSeed(senderName, room:sender)`, which is the same string.
    expect(markSeed('Cosmic Panda', 'g1:rh_x')).toBe('Cosmic Panda')
    expect(creatureFor(markSeed('Cosmic Panda', 'g1:rh_x'))).toEqual(creatureFor('Cosmic Panda'))
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
  // "{name} is typing" is the DS TypingIndicator's now (dsTypingIndicator.test.tsx); the room names a blank one "Someone".

  it('says hi by the server’s name, the param only as a first paint, and nothing without either', () => {
    expect(emptyThreadLine('Mika', 'Old name')).toBe('Say hi to Mika.')
    expect(emptyThreadLine(null, 'Mika')).toBe('Say hi to Mika.')
    // It read "Say hi to ." when opened from a push.
    expect(emptyThreadLine(null, null)).toBeNull()
    expect(emptyThreadLine(undefined, '  ')).toBeNull()
  })

  it('draws their creature in the header until they reveal, then their photo', () => {
    const reveal = { displayName: 'Cosmic Panda', pseudonymous: true, theyRevealed: false }
    expect(directHeaderAvatar(reveal, null, 'Cosmic Panda')).toEqual({ kind: 'creature', pseudonym: 'Cosmic Panda' })
    // A photo the server sent before a reveal is still not drawn.
    expect(directHeaderAvatar(reveal, 'https://cdn/them.jpg', 'Cosmic Panda')).toEqual({ kind: 'creature', pseudonym: 'Cosmic Panda' })
    expect(directHeaderAvatar({ ...reveal, displayName: 'Mika Rao', theyRevealed: true }, 'https://cdn/them.jpg', 'x')).toEqual({ kind: 'photo', uri: 'https://cdn/them.jpg', name: 'Mika Rao' })
  })

  it('a named person with no photo is their initial, never a creature (F1 B)', () => {
    const named = { displayName: 'Mika', pseudonymous: false, theyRevealed: true }
    expect(directHeaderAvatar(named, null, 'route name')).toEqual({ kind: 'initial', name: 'Mika' })
    expect(directHeaderAvatar({ displayName: 'Mika Rao', pseudonymous: true, theyRevealed: true }, null, 'x')).toEqual({ kind: 'initial', name: 'Mika Rao' })
  })

  it('draws a photo only from the server’s answer: the creature until it lands', () => {
    // A route URL is anybody's link (blendn://private-chat/x?otherUserAvatar=…); the helper takes none. Until the server
    // says who this is, the face fails closed: a creature on the route's name, never an initial that would claim "named".
    expect(directHeaderAvatar(null, null, 'Amber Fox')).toEqual({ kind: 'creature', pseudonym: 'Amber Fox' })
    expect(directHeaderAvatar(null, 'https://cdn/them.jpg', 'Amber Fox')).toEqual({ kind: 'creature', pseudonym: 'Amber Fox' })
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

  it('drops interests and shared interests too (YOU-03): work field stays, by ruling OD-3', () => {
    const withChips = { ...leaked, interests: ['Vinyl'], sharedInterests: ['Vinyl'] }
    const shown = withheldUnlessVisible({ ...withChips, identityVisible: false })
    expect(shown.interests).toEqual([])
    expect(shown.sharedInterests).toEqual([])
    expect(withheldUnlessVisible({ ...withChips, identityVisible: true }).interests).toEqual(['Vinyl'])
  })

  it('titles them by the room’s pseudonym, never the leaked name or "Attendee"', () => {
    const who = profileIdentity({ ...leaked, identityVisible: false }, { pseudonym: 'Cosmic Panda', roomSeed: 'g1:rh_b' })
    expect(who).toEqual({ revealed: false, title: 'Cosmic Panda', name: 'Cosmic Panda', age: 29, seed: 'Cosmic Panda' })
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

  /*
   * SCRUM-1046: opened with no pseudonym in the link (a cold link, Room info), the page said "Someone" although the
   * server, asked by a room handle, answers with that room's pseudonym. That answer is trusted only when it came from
   * `GET /users/:handle` itself, in its `name` field: never from the `/profiles/:id` fallback, `display_name`, a
   * failed read or a real id. With no trusted source the page fails closed to "Someone".
   */
  describe('the room pseudonym the server sends (SCRUM-1046)', () => {
    const roomAnswer = { name: 'Cosmic Panda', age: 29, identityVisible: false }

    it('is read from a successful handle read’s `name`', () => {
      expect(roomNameFrom('rh_abc', roomAnswer)).toBe('Cosmic Panda')
    })

    it('is never read from `display_name`', () => {
      expect(roomNameFrom('rh_abc', { display_name: 'Ben Okafor', identityVisible: false })).toBeNull()
      expect(roomNameFrom('rh_abc', { name: '', display_name: 'Ben Okafor', identityVisible: false })).toBeNull()
    })

    it('is nothing when the handle read failed', () => {
      expect(roomNameFrom('rh_abc', null)).toBeNull()
      expect(roomNameFrom('rh_abc', undefined)).toBeNull()
    })

    it('is nothing for a real id, a placeholder, or somebody already shown to you', () => {
      expect(roomNameFrom('cmb0realid', { name: 'Ben', identityVisible: false })).toBeNull()
      expect(roomNameFrom('rh_dm', { name: 'Attendee', identityVisible: false })).toBeNull()
      expect(roomNameFrom('rh_abc', { name: 'Ben', identityVisible: true })).toBeNull()
    })

    it('titles the page, over the profile’s own name', () => {
      const who = profileIdentity({ ...roomAnswer, name: 'Ben' }, { roomName: 'Cosmic Panda', roomSeed: 'g1:rh_abc' })
      expect(who).toEqual({ revealed: false, title: 'Cosmic Panda', name: 'Cosmic Panda', age: 29, seed: 'Cosmic Panda' })
    })

    it('comes after the link’s pseudonym: it is what the card that opened the page drew', () => {
      expect(profileIdentity(roomAnswer, { pseudonym: 'Amber Fox', roomName: 'Cosmic Panda' }).title).toBe('Amber Fox')
    })

    it('fails closed without it: a fallback profile carrying a real name is still "Someone"', () => {
      // What the `/profiles/:id` fallback builds for a handle: a name, no room source.
      const fallback = profileIdentity({ ...leaked, identityVisible: false }, { roomSeed: 'g1:rh_abc' })
      expect(fallback.title).toBe('Someone')
      expect(fallback.seed).toBe('g1:rh_abc')
    })
  })
})

describe('userMessage: the server’s words only when they were written for a person', () => {
  it('passes a known code’s sentence through', () => {
    expect(userMessage({ error: "You’re muted in this room.", errorCode: 'USER_MUTED' }, "Couldn’t send. Try again.")).toBe(
      "You’re muted in this room."
    )
    expect(userMessage({ error: 'Add a photo to your profile first', errorCode: 'reveal_incomplete' }, 'x')).toBe(
      'Add a photo to your profile first'
    )
  })

  it('uses the screen’s sentence for anything else', () => {
    const fallback = "Couldn’t send. Try again."
    expect(userMessage({ error: 'Failed to update profile' }, fallback)).toBe(fallback)
    expect(userMessage({ error: 'Invalid input: expected string', errorCode: 'VALIDATION_FAILED' }, fallback)).toBe(fallback)
    expect(userMessage({ error: '', errorCode: 'USER_MUTED' }, fallback)).toBe(fallback)
    expect(userMessage(undefined, fallback)).toBe(fallback)
  })
})

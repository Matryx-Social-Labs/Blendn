import {
  WAVE_SETTLE_MS,
  shouldSendWave,
  waveAccessibilityLabel,
  waveRefusal,
  waveStateAfter,
  waveStatusFor,
  wavedAgo,
} from '../lib/waves'

/**
 * Wave is the one person-to-person gesture (owner ruling 2026-11-12, SCRUM-1042): Wave → Wave back → ✓ Waved → Say hi,
 * and no "Wave again". The server records it; this is the client's half, pure, so the rules are tested without a room.
 */

describe('waveStatusFor: the card’s state, from the deck and this session', () => {
  it('reads the deck when this session has done nothing', () => {
    expect(waveStatusFor({}, undefined)).toBe('none')
    expect(waveStatusFor({ youWaved: true }, undefined)).toBe('waved')
    expect(waveStatusFor({ wavedAtYou: true }, undefined)).toBe('wavedAtYou')
    expect(waveStatusFor({ youWaved: true, wavedAtYou: true }, undefined)).toBe('mutual')
  })

  it('a wave heard live over the socket reads as one waiting for you', () => {
    expect(waveStatusFor({ heard: true }, undefined)).toBe('wavedAtYou')
    // Control: heard, but you have since waved back in this session.
    expect(waveStatusFor({ heard: true }, 'mutual')).toBe('mutual')
  })

  it('keeps mutual when a refetch says only that you waved', () => {
    // The deck refetches constantly; a snapshot older than the mutual must not take Say hi away.
    expect(waveStatusFor({ youWaved: true }, 'mutual')).toBe('mutual')
    expect(waveStatusFor({}, 'mutual')).toBe('mutual')
    expect(waveStatusFor({ conversationId: 'c1' }, undefined)).toBe('mutual')
  })

  it('keeps ✓ Waved and in-flight over an older snapshot', () => {
    expect(waveStatusFor({}, 'waved')).toBe('waved')
    expect(waveStatusFor({ wavedAtYou: true }, 'sending')).toBe('sending')
    expect(waveStatusFor({}, 'sending')).toBe('sending')
  })
})

describe('shouldSendWave: one wave per person per room, no Wave again', () => {
  it('sends from Wave and Wave back only', () => {
    expect(shouldSendWave('none')).toBe(true)
    expect(shouldSendWave('wavedAtYou')).toBe(true)
    expect(shouldSendWave('sending')).toBe(false)
    expect(shouldSendWave('waved')).toBe(false)
    expect(shouldSendWave('mutual')).toBe(false)
  })
})

describe('waveStateAfter: the server’s answer', () => {
  it('waved, mutual, or no opinion on failure (the write may have landed)', () => {
    expect(waveStateAfter({ ok: true, mutual: false })).toBe('waved')
    expect(waveStateAfter({ ok: true, mutual: true })).toBe('mutual')
    expect(waveStateAfter({ ok: false })).toBeUndefined()
  })
})

describe('waveRefusal: the server’s sentence when it is about you, never about them', () => {
  it('shows the wave caps’ own sender-only copy (W3–W6)', () => {
    for (const msg of ['You’ve waved a lot in this room. Try again in a bit.', 'You’ve waved a lot today. Try again later.']) {
      expect(waveRefusal('RATE_LIMITED', msg)).toEqual({ message: msg, variant: 'info' })
    }
  })

  it('does not pass an API limiter’s sentence through', () => {
    expect(waveRefusal('RATE_LIMITED', 'Too many requests')).toEqual({ message: 'Slow down a moment, then try again.', variant: 'info' })
    expect(waveRefusal('RATE_LIMITED', undefined).message).toBe('Slow down a moment, then try again.')
  })

  it('never names the other person or confirms they are here', () => {
    const refused = waveRefusal('RECIPIENT_NOT_HERE', 'They’re not in the room right now')
    expect(refused.message).toBe('That didn’t go through.')
    expect(waveRefusal('NOT_FOUND', 'User not found').message).toBe('That didn’t go through.')
  })

  it('a lapsed check-in offers Check in', () => {
    expect(waveRefusal('NOT_CHECKED_IN', 'Check in to wave at people here')).toEqual({
      message: 'Check in to wave at people here',
      variant: 'info',
      checkIn: true,
    })
  })

  it('the ten-minute window across rooms is info, in the sender’s terms', () => {
    expect(waveRefusal('WAVE_TOO_SOON', 'You waved at them a moment ago')).toEqual({ message: 'You waved at them a moment ago.', variant: 'info' })
  })

  it('anything else is the generic line, never raw', () => {
    expect(waveRefusal(undefined, undefined)).toEqual({ message: 'That didn’t go through.', variant: 'error' })
    expect(waveRefusal('INTERNAL_ERROR', 'Failed to wave')).toEqual({ message: 'That didn’t go through.', variant: 'error' })
  })
})

describe('waveAccessibilityLabel', () => {
  it('says each state in the approved names', () => {
    expect(waveAccessibilityLabel('Velvet Owl', 'none')).toBe('Wave at Velvet Owl')
    expect(waveAccessibilityLabel('Velvet Owl', 'wavedAtYou')).toBe('Wave back at Velvet Owl')
    expect(waveAccessibilityLabel('Velvet Owl', 'sending')).toBe('Waving at Velvet Owl')
    expect(waveAccessibilityLabel('Velvet Owl', 'waved')).toBe('Waved at Velvet Owl')
    expect(waveAccessibilityLabel('Velvet Owl', 'mutual')).toBe('You both waved. Say hi to Velvet Owl')
  })
})

describe('wavedAgo', () => {
  it('"4 min", at least 1, and hours past the hour', () => {
    const now = Date.parse('2026-11-12T21:00:00Z')
    expect(wavedAgo('2026-11-12T20:56:00Z', now)).toBe('4 min')
    expect(wavedAgo('2026-11-12T20:59:50Z', now)).toBe('1 min')
    expect(wavedAgo('2026-11-12T18:30:00Z', now)).toBe('2 h')
    expect(wavedAgo(undefined, now)).toBeNull()
    expect(wavedAgo('garbage', now)).toBeNull()
  })
})

it('the wave settles to ✓ Waved at 800 ms (07-motion)', () => {
  expect(WAVE_SETTLE_MS).toBe(800)
})

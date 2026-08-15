import {
  likeAccessibilityLabel,
  likeStateAfter,
  likeStatusFor,
  shouldSendLike,
  type LikeStatus,
} from '../lib/likes'

/**
 * The mechanic the product is built on, and until now the only one with no
 * button.
 *
 * `likeAtEvent` shipped in `apiClient` with a queue and three retries and was
 * never called from anywhere. The room read `youLiked` back from the server and
 * rendered it, so the app could show you that you had liked someone while
 * giving you no way to do it. What it offered instead was
 * `createMessageRequest` — send a request, wait, be accepted or ignored — which
 * is the rejection risk the mutual gate exists to remove.
 */

describe('likeStatusFor — local wins, and matched survives', () => {
  it('reads the server when this session has done nothing', () => {
    expect(likeStatusFor(false, undefined)).toBe('none')
    expect(likeStatusFor(true, undefined)).toBe('liked')
    expect(likeStatusFor(undefined, undefined)).toBe('none')
  })

  it('keeps matched when a refetch says only that you liked them', () => {
    /*
     * The bug this prevents, and it is not hypothetical on this screen.
     *
     * The roster refetches on socket events, on pull-to-refresh and on
     * pagination. Every response carries `youLiked` as a plain boolean with no
     * idea whether the like it reports is the one that matched — so a refetch
     * landing a second after a mutual like would downgrade the card and the
     * person would watch their new conversation vanish from it.
     */
    expect(likeStatusFor(true, 'matched')).toBe('matched')
    expect(likeStatusFor(false, 'matched')).toBe('matched')
  })

  it('keeps an in-flight like in flight', () => {
    // A refetch mid-request must not re-offer a button that is already working.
    expect(likeStatusFor(false, 'sending')).toBe('sending')
  })

  it('lets the server report a like sent from another device', () => {
    // The one case the server knows something this session does not.
    expect(likeStatusFor(true, undefined)).toBe('liked')
  })
})

describe('shouldSendLike', () => {
  it('sends only from none', () => {
    expect(shouldSendLike('none')).toBe(true)
  })

  it('refuses the three states that already mean something', () => {
    /*
     * Each for a different reason: `sending` would double-post, `liked` is
     * already true, and `matched` has a conversation — that tap belongs to
     * opening it.
     *
     * The in-flight guard matters more here than on an ordinary button.
     * `likeAtEvent` is a queued request with three retries, so a double tap on
     * a bad connection can put two on the wire and the second lands after the
     * first has already opened a conversation.
     */
    expect(shouldSendLike('sending')).toBe(false)
    expect(shouldSendLike('liked')).toBe(false)
    expect(shouldSendLike('matched')).toBe(false)
  })
})

describe('likeStateAfter', () => {
  it('matches on a mutual like', () => {
    expect(likeStateAfter({ ok: true, mutual: true })).toBe('matched')
  })

  it('records a one-sided like without claiming anything about them', () => {
    expect(likeStateAfter({ ok: true, mutual: false })).toBe('liked')
    expect(likeStateAfter({ ok: true })).toBe('liked')
  })

  it('clears this session opinion on failure rather than asserting not-liked', () => {
    /*
     * `undefined`, not `'none'`. A request can fail *after* the like was
     * recorded — a timeout on the response, not on the write — so asserting
     * not-liked would offer a like the server already holds. Falling back to
     * the server's answer is the only claim we can support.
     */
    expect(likeStateAfter({ ok: false })).toBeUndefined()
    expect(likeStatusFor(true, likeStateAfter({ ok: false }))).toBe('liked')
  })
})

describe('the label never speaks for the other person', () => {
  const states: LikeStatus[] = ['none', 'sending', 'liked', 'matched']

  it('never implies they are waiting, deciding, or have seen anything', () => {
    /*
     * There is no data for it. The roster carries `youLiked` and no field for
     * the reverse, deliberately — a "they liked you, your move" state would be
     * the mutual gate leaking, and a "waiting for them" state would invent an
     * expectation the mechanic exists to not create.
     *
     * A like costs nothing and is never seen unless it is returned. The words
     * have to mean that.
     */
    for (const s of states) {
      const label = likeAccessibilityLabel('Cosmic Panda', s).toLowerCase()
      expect(label).not.toMatch(/waiting|pending|they liked|likes you|accept|declin|request/)
    }
  })

  it('says what a like actually costs, on the button that sends one', () => {
    expect(likeAccessibilityLabel('Cosmic Panda', 'none')).toBe(
      'Like Cosmic Panda. They are not told unless you both like each other'
    )
  })

  it('points a matched card at the conversation', () => {
    expect(likeAccessibilityLabel('Cosmic Panda', 'matched')).toMatch(/open the conversation/i)
  })

  it('uses the name it is given, which in a room is the pseudonym', () => {
    // Liking happens under the pseudonym. `getDisplayName` upstream is what
    // decides whether that is a real name, and it stays that way here.
    expect(likeAccessibilityLabel('Cosmic Panda', 'liked')).toContain('Cosmic Panda')
  })
})

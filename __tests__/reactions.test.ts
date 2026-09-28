import { toggleReaction, withMine } from '../lib/reactions'

/**
 * The room's reaction picker draws a tap before the server answers, so the
 * guess has to toggle the way the server does, and a socket tally — the same
 * for everyone — must not wipe out which one is yours.
 */
describe('toggleReaction', () => {
  it('adds a new emoji as yours', () => {
    expect(toggleReaction(undefined, '🔥')).toEqual([{ emoji: '🔥', count: 1, mine: true }])
  })

  it('joins an emoji someone else left', () => {
    expect(toggleReaction([{ emoji: '👍', count: 2, mine: false }], '👍')).toEqual([
      { emoji: '👍', count: 3, mine: true },
    ])
  })

  it('takes yours back, and drops the chip when it was the only one', () => {
    expect(toggleReaction([{ emoji: '👍', count: 1, mine: true }], '👍')).toEqual([])
    expect(toggleReaction([{ emoji: '👍', count: 4, mine: true }], '👍')).toEqual([
      { emoji: '👍', count: 3, mine: false },
    ])
  })
})

describe('withMine', () => {
  it('keeps yours across a tally from the socket', () => {
    const known = [{ emoji: '❤️', count: 1, mine: true }]
    expect(withMine([{ emoji: '❤️', count: 2 }, { emoji: '😂', count: 1 }], known)).toEqual([
      { emoji: '❤️', count: 2, mine: true },
      { emoji: '😂', count: 1, mine: false },
    ])
  })
})

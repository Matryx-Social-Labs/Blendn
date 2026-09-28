import { readFileSync } from 'fs'
import { join } from 'path'

import { askAboutNight, ratePeople, UNKNOWN_MATCH } from '../lib/ratePeople'

describe('askAboutNight', () => {
  it('asks when your own rating says you have not rated', () => {
    expect(askAboutNight({ success: true, data: { rating: null } }, 4)).toBe(true)
  })

  it('skips to the people when you already rated — whatever the event guessed', () => {
    expect(askAboutNight({ success: true, data: { rating: 3 } }, undefined)).toBe(false)
  })

  it("falls back to the event's userStatus when your rating could not be read", () => {
    expect(askAboutNight({ success: false }, 5)).toBe(false)
    expect(askAboutNight({ success: false }, undefined)).toBe(true)
    expect(askAboutNight(null, null)).toBe(true)
  })
})

describe('ratePeople', () => {
  const conversations = [
    { id: 'c1', otherUser: { id: 'u1', name: 'Velvet Otter', image: null } },
    { id: 'c2', otherUser: { id: 'u2', name: 'Priya', image: 'https://img/p.jpg' } },
    { id: 'c3', otherUser: { id: 'u9', name: 'Someone else', image: null } },
  ]

  it('keeps the server order and resolves each person as they appear to you', () => {
    expect(ratePeople(['u2', 'u1'], conversations)).toEqual([
      { id: 'u2', name: 'Priya', photo: 'https://img/p.jpg' },
      { id: 'u1', name: 'Velvet Otter', photo: null },
    ])
  })

  it('never invents a name for somebody the list has not caught up with', () => {
    expect(ratePeople(['u3'], conversations)).toEqual([{ id: 'u3', name: UNKNOWN_MATCH, photo: null }])
  })

  it('tolerates a malformed row', () => {
    expect(ratePeople(['u1'], [{ id: 'x' }, { otherUser: 'nope' }, ...conversations])[0].name).toBe('Velvet Otter')
  })
})

describe('the rating screen', () => {
  const SRC = readFileSync(join(__dirname, '..', 'app', 'rate', '[eventId].tsx'), 'utf8')

  it('resolves faces from the conversation list, never the public profile', () => {
    // The profile answers a real name and face for an id: it would unmask
    // somebody who met you anonymously.
    expect(SRC).toContain('getConversations')
    expect(SRC).not.toContain('getPublicProfile')
  })

  it('says a failed load failed, rather than "Nothing to rate"', () => {
    expect(SRC).toContain('Try again')
  })

  it('asks about the night itself, through rateEvent', () => {
    expect(SRC).toContain('apiClient.rateEvent(')
  })

  it('decides whether to ask from your own rating', () => {
    expect(SRC).toContain('apiClient.getMyEventRating(')
    expect(SRC).toContain('askAboutNight(own, event?.data?.userStatus?.userRating)')
  })
})

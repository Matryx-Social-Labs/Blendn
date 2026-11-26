/**
 * Dating is not an intent in 1.0 (register D-002, client/09, SCRUM-1192): nobody can pick it, and nobody sees it.
 *
 * Stored values still parse: a profile, an event preference or a crew that carries `dating` (or the old "Both") reads as
 * if dating were not there (advisor pick: dropped on read, never turned into friendship), and no line says "dating".
 */
import { INTENTS } from '../components/profile/MatchingFields'
import { INTENT_CHOICES, intentChoice, intentLine } from '../lib/crewsScreens'
import { normaliseIntents } from '../lib/intents'
import { overlapOf } from '../lib/overlapLine'
import { leadFor } from '../lib/roomLens'
import { reasonLine, reasonLines } from '../lib/roomMoments'

const NOW = Date.parse('2026-11-27T20:00:00Z')

describe('no dating to pick', () => {
  it('the profile intents are Networking, Friendship and Just here', () => {
    expect(INTENTS.map((i) => i.value)).toEqual(['networking', 'friendship', 'just_here'])
  })

  it('a crew is here for Friendship or Networking', () => {
    expect(INTENT_CHOICES.map((c) => c.value)).toEqual(['friendship', 'networking'])
  })
})

describe('a stored dating is read as not there', () => {
  it('on a profile', () => {
    expect(normaliseIntents(['dating'])).toEqual([])
    expect(normaliseIntents(['friendship', 'dating'])).toEqual(['friendship'])
    expect(normaliseIntents(['dating', 'just_here'])).toEqual(['just_here'])
  })

  it('on a crew: dating alone picks nothing and says nothing; the old Both is Friendship', () => {
    expect(intentChoice(['dating'])).toBeNull()
    expect(intentLine(['dating'])).toBeUndefined()
    expect(intentChoice(['friendship', 'dating'])).toBe('friendship')
    expect(intentLine(['friendship', 'dating'])).toBe('Friendship')
  })
})

describe('no line says dating', () => {
  const music = { key: 'music', question: null }
  const person = { workField: null, sharedIntents: ['dating'], interests: [], overlaps: [], badges: [] }

  it('a card whose only shared intent was dating has no overlap line or label', () => {
    expect(overlapOf({ sharedIntents: ['dating'] })).toEqual({ line: null, labels: [] })
  })

  it('the room reasons never say "Both open to dating"', () => {
    expect(reasonLine({ sharedIntents: ['dating'] }, NOW)).not.toMatch(/dating/i)
    expect(reasonLines({ sharedIntents: ['dating', 'networking'] })).toEqual(['Both here to network'])
  })

  it('the lens pill never says dating', () => {
    expect(leadFor(person, music)).toEqual([])
  })
})

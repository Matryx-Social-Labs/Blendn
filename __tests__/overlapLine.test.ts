import { overlapOf } from '../lib/overlapLine'

describe('overlapOf', () => {
  it('the line is the server’s strongest overlap, the labels are what is shared', () => {
    const o = overlapOf({
      overlaps: [{ kind: 'ipl', text: 'Both CSK, in RCB country' }, { kind: 'language', text: 'You both speak Kannada' }],
      sharedIntents: ['friends'],
      interests: ['Filter coffee', 'CSK'],
      sign: 'Leo',
    })
    expect(o.line).toBe('Both CSK, in RCB country')
    expect(o.labels.map((l) => l.text)).toEqual(['Friendship', 'Filter coffee', 'CSK', 'Leo'])
    expect(o.labels.every((l) => l.shared !== undefined)).toBe(true)
  })

  it('says the intent when the server sent no sentence, never empty when something is shared', () => {
    expect(overlapOf({ sharedIntents: ['friends'] }).line).toBe('Both here to make friends')
    expect(overlapOf({ sharedIntents: ['networking', 'dating'] }).line).toBe('Both open to dating')
  })

  it('draws nothing when nothing is shared', () => {
    expect(overlapOf({})).toEqual({ line: null, labels: [] })
    expect(overlapOf({ overlaps: [], interests: [], sign: null })).toEqual({ line: null, labels: [] })
  })

  it('their sign is outlined only when the server said you share it', () => {
    expect(overlapOf({ sign: 'Leo' }).labels).toEqual([{ text: 'Leo', shared: false }])
    expect(overlapOf({ sign: 'Leo', overlaps: [{ kind: 'sign', text: 'Both Leo' }] }).labels[0].shared).toBe(true)
  })

  it('names a label once', () => {
    expect(overlapOf({ interests: ['Jazz', 'Jazz', ' '] }).labels).toHaveLength(1)
  })
})

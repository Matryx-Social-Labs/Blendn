import { identityMeta, joinedLabel, profileGaps } from '../lib/meProfile'

describe('the Me tab header line', () => {
  const since = new Date(2025, 2, 14).toISOString()

  it('formats the join date', () => {
    expect(joinedLabel(since)).toBe('Joined Mar 2025')
  })

  it('drops whichever part is missing', () => {
    expect(identityMeta('Bengaluru', since)).toBe('Bengaluru · Joined Mar 2025')
    expect(identityMeta(null, since)).toBe('Joined Mar 2025')
    expect(identityMeta('Bengaluru', undefined)).toBe('Bengaluru')
    expect(identityMeta('  ', 'not a date')).toBeNull()
    expect(joinedLabel(undefined)).toBeNull()
  })
})

describe('what the Me tab asks you to finish', () => {
  const labels = (p: Parameters<typeof profileGaps>[0]) => profileGaps(p).map((g) => g.label)

  it('asks for a photo first, then more photos, a bio and interests', () => {
    expect(labels({ photos: [], bio: '', interests: [] })).toEqual([
      'Add a photo',
      'Write a bio',
      'Pick interests',
    ])
    expect(labels({ photos: ['a'], bio: '', interests: [] })).toEqual([
      'Add photos · 1 of 6',
      'Write a bio',
      'Pick interests',
    ])
  })

  it('ignores blank photo URLs and whitespace bios', () => {
    expect(labels({ photos: [' '], bio: '  ', interests: ['Music'] })).toEqual(['Add a photo', 'Write a bio'])
  })

  it('asks for nothing once three photos, a bio and an interest are there', () => {
    expect(profileGaps({ photos: ['a', 'b', 'c'], bio: 'Hi', interests: ['Music'] })).toEqual([])
  })
})

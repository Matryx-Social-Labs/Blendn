import { agoLabel, identityMeta, joinedLabel, NIGHTS_WEEKS, nightsGrid, profileGaps } from '../lib/meProfile'

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

describe('Nights out', () => {
  // Wednesday 17 Sep 2025, mid-evening.
  const now = new Date(2025, 8, 17, 21, 0)
  const at = (y: number, m: number, d: number, h = 20) => new Date(y, m, d, h).toISOString()

  it('lays out twelve Monday-first weeks ending with the current one', () => {
    const { weeks } = nightsGrid([], now)
    expect(weeks).toHaveLength(NIGHTS_WEEKS)
    expect(weeks.every((w) => w.length === 7)).toBe(true)
    expect(weeks[0][0].date.getDay()).toBe(1)
    const last = weeks[NIGHTS_WEEKS - 1]
    expect(last[0].date).toEqual(new Date(2025, 8, 15))
    // Thursday onwards hasn't happened yet.
    expect(last.map((c) => c.future)).toEqual([false, false, false, true, true, true, true])
  })

  it('counts nights, not events, and ignores what falls outside the window', () => {
    const grid = nightsGrid(
      [
        { id: 'a', start_time: at(2025, 8, 13) },
        { id: 'b', start_time: at(2025, 8, 13, 23) },
        { id: 'c', start_time: at(2025, 8, 5) },
        { id: 'old', start_time: at(2025, 0, 10) },
        { id: 'bad', start_time: 'not a date' },
      ],
      now
    )
    expect(grid.nights).toBe(2)
    const saturday = grid.weeks[NIGHTS_WEEKS - 2][5]
    expect(saturday.eventIds).toEqual(['a', 'b'])
  })

  it('labels the first column and each column where a month starts', () => {
    const { monthLabels } = nightsGrid([], now)
    // The first week runs Mon 30 Jun → Sun 6 Jul: a month starting inside it wins.
    expect(monthLabels[0]).toBe('JUL')
    expect(monthLabels.filter(Boolean)).toEqual(['JUL', 'AUG', 'SEP'])
  })
})

describe('how long ago a Recent tile was', () => {
  const now = new Date(2025, 8, 17, 12)

  it('speaks in weeks, then months, then years', () => {
    expect(agoLabel(new Date(2025, 8, 15, 20).toISOString(), now)).toBe('THIS WEEK')
    expect(agoLabel(new Date(2025, 8, 13, 20).toISOString(), now)).toBe('LAST WEEK')
    expect(agoLabel(new Date(2025, 7, 23, 20).toISOString(), now)).toBe('4 WEEKS AGO')
    expect(agoLabel(new Date(2025, 5, 1, 20).toISOString(), now)).toBe('3 MONTHS AGO')
    expect(agoLabel(new Date(2024, 6, 1, 20).toISOString(), now)).toBe('LAST YEAR')
    expect(agoLabel(new Date(2022, 6, 1, 20).toISOString(), now)).toBe('3 YEARS AGO')
    expect(agoLabel('nope', now)).toBe('')
  })
})

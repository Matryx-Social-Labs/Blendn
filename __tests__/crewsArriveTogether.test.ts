/*
 * Arrive together (crews 4-A, owner-approved 2026-11-12; server admin #971/#973): the pure rules behind the strip's names,
 * the event page's "Going together" and the hold's "With {crew}" chip.
 */
jest.mock('../lib/apiClient', () => ({ apiClient: {}, TokenStorage: {} }))

/* eslint-disable import/first */
import { goingLine, inYouLast, namesLine, stripCrewsFrom, withCrewChoice, type CrewPlan, type CrewmateIn } from '../lib/crews'
/* eslint-enable import/first */

const p = (name: string, you = false): CrewmateIn => ({ userId: `h-${name}`, name, photo: null, you })
const NOW = Date.parse('2026-11-14T18:00:00Z')
const HOUR = 3_600_000
const plan = (o: Partial<CrewPlan> = {}): CrewPlan => ({
  crewId: 'c1',
  name: 'Nebula',
  emblemSeed: 'aaaaaaaaaaaaaaaa',
  occurrenceId: 'o1',
  startsAt: new Date(NOW + 2 * HOUR).toISOString(),
  going: [],
  ...o,
})
const mine = [
  { crewId: 'c1', name: 'Nebula', emblemSeed: 'aaaaaaaaaaaaaaaa' },
  { crewId: 'c2', name: 'Orbit', emblemSeed: 'bbbbbbbbbbbbbbbb' },
]

describe('who is in, by name', () => {
  it('others first in arrival order, you last, as "You"', () => {
    const here = [p('Sagar', true), p('Priya'), p('Arjun')]
    expect(inYouLast(here).map((x) => x.name)).toEqual(['Priya', 'Arjun', 'Sagar'])
    expect(namesLine(here)).toBe('Priya, Arjun, You')
  })

  it('a strip crew is drawn from `here` (who told the crew), not from the presence count', () => {
    const rows = stripCrewsFrom(
      [{ crewId: 'c1', name: 'Nebula', presentCount: 4, here: [p('Priya'), p('Sagar', true)] }],
      [{ crewId: 'c1', emblemSeed: 'e', size: 5 }],
      'Vinyl Night'
    )
    expect(rows).toEqual([expect.objectContaining({ id: 'c1', in: 2, size: 5, context: 'Vinyl Night', emblemSeed: 'e' })])
    expect(rows[0].people.map((x) => x.name)).toEqual(['Priya', 'Sagar'])
  })

  it('a crew here that nobody told (everyone came in on their own) draws no row: nobody is listed', () => {
    expect(stripCrewsFrom([{ crewId: 'c1', name: 'Nebula', presentCount: 2, here: [] }], [], 'x')).toEqual([])
  })

  it('an older server with no `here`: the presence count, no names (installed builds keep working)', () => {
    const rows = stripCrewsFrom([{ crewId: 'c1', name: 'Nebula', presentCount: 2 }], [], 'x')
    expect(rows[0]).toMatchObject({ in: 2, people: [] })
  })
})

describe('"Going together" — who is going', () => {
  it('names the others, never you, and folds past three', () => {
    expect(goingLine([p('Priya'), p('Sagar', true)])).toBe('Priya is going')
    expect(goingLine([p('Priya'), p('Arjun')])).toBe('Priya and Arjun are going')
    expect(goingLine([p('Priya'), p('Arjun'), p('Meera')])).toBe('Priya, Arjun and Meera are going')
    expect(goingLine([p('Priya'), p('Arjun'), p('Meera'), p('Kabir')])).toBe('Priya, Arjun and 2 others are going')
  })

  it('nobody else going: no line', () => {
    expect(goingLine([p('Sagar', true)])).toBeNull()
    expect(goingLine([])).toBeNull()
  })
})

describe('"With {crew}" at the hold (owner 1b: on by default only when the crew planned that night)', () => {
  it('a crew that planned tonight: that crew, on', () => {
    expect(withCrewChoice(mine, [plan({ crewId: 'c2', name: 'Orbit', emblemSeed: 'bbbbbbbbbbbbbbbb' })], NOW)).toEqual({
      crewId: 'c2',
      name: 'Orbit',
      emblemSeed: 'bbbbbbbbbbbbbbbb',
      on: true,
    })
  })

  it('a night already started still counts as tonight', () => {
    expect(withCrewChoice(mine, [plan({ startsAt: new Date(NOW - 3 * HOUR).toISOString() })], NOW)?.on).toBe(true)
  })

  it('a plan for a later night is not tonight: your first crew, off', () => {
    expect(withCrewChoice(mine, [plan({ startsAt: new Date(NOW + 48 * HOUR).toISOString() })], NOW)).toEqual({
      crewId: 'c1',
      name: 'Nebula',
      emblemSeed: 'aaaaaaaaaaaaaaaa',
      on: false,
    })
  })

  it('no plan: your first crew, off', () => {
    expect(withCrewChoice(mine, [], NOW)).toMatchObject({ crewId: 'c1', on: false })
  })

  it('no crew at all: no chip', () => {
    expect(withCrewChoice([], [], NOW)).toBeNull()
  })

  it('a plan whose crew the crews list has not loaded yet still turns the chip on', () => {
    expect(withCrewChoice([], [plan()], NOW)).toMatchObject({ crewId: 'c1', on: true })
  })
})

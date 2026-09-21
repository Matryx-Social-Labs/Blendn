import { readFileSync } from 'fs'
import { join } from 'path'
import { isUnder18 } from '../lib/onboarding'

/*
 * A minor is not asked their orientation (SCRUM-200).
 *
 * Driven on iOS: a 17-year-old was shown the Orientation step, and the
 * server stored the answer. The server refuses it now; this is the half that
 * never asks.
 */
describe('isUnder18', () => {
  const today = new Date('2026-09-22T12:00:00Z')
  it('turns on the birthday, not the year', () => {
    expect(isUnder18('2008-09-22', today)).toBe(false) // 18 today
    expect(isUnder18('2008-09-23', today)).toBe(true) // 18 tomorrow
    expect(isUnder18('2009-06-15', today)).toBe(true)
    expect(isUnder18('1995-07-02', today)).toBe(false)
  })
  it('withholds the question when the date is missing or broken', () => {
    expect(isUnder18(undefined, today)).toBe(true)
    expect(isUnder18('not a date', today)).toBe(true)
  })
})

describe('the preferences step', () => {
  const src = readFileSync(join(__dirname, '..', 'app', 'onboarding', 'preferences.tsx'), 'utf8')
  it('neither renders the Orientation section nor writes the fields under 18', () => {
    expect(src).toContain('const under18 = loaded && isUnder18(draft.dateOfBirth)')
    expect(src).toMatch(/\{under18 \? null : \(\s*<EmberSection\s*title="Orientation"/)
    expect(src).toMatch(/\.\.\.\(under18\s*\? \{\}\s*: \{\s*orientations,/)
  })
})

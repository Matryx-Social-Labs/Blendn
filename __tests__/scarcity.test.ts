import { scarcityLabel } from '../lib/scarcity'

/**
 * The scarcity pill's rule.
 *
 * The behaviour under test is mostly *silence* — the pill's value comes from
 * being rare, so the cases that must return `null` matter more than the ones
 * that produce a string.
 */
describe('scarcityLabel', () => {
  it('says nothing for an uncapped event', () => {
    // The common case, and the one the frame gets wrong by drawing
    // "LIMITED ACCESS" on it.
    expect(scarcityLabel({ maxCapacity: 0, currentCapacity: 40 })).toBeNull()
    expect(scarcityLabel({ maxCapacity: null, currentCapacity: 40 })).toBeNull()
    expect(scarcityLabel({})).toBeNull()
  })

  it('says nothing for an event with plenty of room', () => {
    expect(scarcityLabel({ maxCapacity: 400, currentCapacity: 100 })).toBeNull()
    expect(scarcityLabel({ maxCapacity: 100, currentCapacity: 0 })).toBeNull()
  })

  it('fires below a fifth remaining, whatever the size', () => {
    // 30-seat dinner with 5 left is 17% — proportionally urgent.
    expect(scarcityLabel({ maxCapacity: 30, currentCapacity: 25 })).toBe('5 SPOTS LEFT')
    // 400-capacity night with 60 left is 15%.
    expect(scarcityLabel({ maxCapacity: 400, currentCapacity: 340 })).toBe('60 SPOTS LEFT')
  })

  it('fires on a small absolute remainder even when proportionally roomy', () => {
    // 10 of 1000 is 1%, caught by the proportion rule too — the case that needs
    // the absolute rule is a large-ish remainder share with few actual seats.
    expect(scarcityLabel({ maxCapacity: 40, currentCapacity: 31 })).toBe('9 SPOTS LEFT')
  })

  it('uses the singular for the last place', () => {
    expect(scarcityLabel({ maxCapacity: 50, currentCapacity: 49 })).toBe('1 SPOT LEFT')
  })

  it('says FULL rather than a negative count when over capacity', () => {
    // Check-in deliberately does not refuse (docs/CHECKIN.md), so occupancy can
    // exceed capacity and "-3 SPOTS LEFT" is a reachable state, not a theory.
    expect(scarcityLabel({ maxCapacity: 50, currentCapacity: 50 })).toBe('FULL')
    expect(scarcityLabel({ maxCapacity: 50, currentCapacity: 53 })).toBe('FULL')
  })

  it('treats missing or nonsense occupancy as zero rather than throwing', () => {
    expect(scarcityLabel({ maxCapacity: 100, currentCapacity: null })).toBeNull()
    expect(scarcityLabel({ maxCapacity: 100, currentCapacity: -5 })).toBeNull()
  })
})

import { heroPillLabel, scarcityLabel } from '../lib/scarcity'

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

describe('heroPillLabel', () => {
  it('prefers the organiser door policy over the spot count', () => {
    // "3 left" beside a guest-list door sends someone hurrying towards a night
    // they cannot get into.
    expect(
      heroPillLabel({ doorPolicy: 'guest_list', maxCapacity: 50, currentCapacity: 47 }),
    ).toBe('GUEST LIST ONLY')
  })

  it('falls back to spots left when the door is open', () => {
    expect(
      heroPillLabel({ doorPolicy: 'open', maxCapacity: 50, currentCapacity: 47 }),
    ).toBe('3 SPOTS LEFT')
  })

  it('says nothing when the door is open and there is room', () => {
    expect(heroPillLabel({ doorPolicy: 'open', maxCapacity: 500, currentCapacity: 10 })).toBeNull()
    expect(heroPillLabel({ maxCapacity: 0, currentCapacity: 0 })).toBeNull()
  })

  it('maps every non-open policy to words rather than an enum', () => {
    expect(heroPillLabel({ doorPolicy: 'members_only' })).toBe('MEMBERS ONLY')
    expect(heroPillLabel({ doorPolicy: 'invite_only' })).toBe('INVITE ONLY')
  })

  it('falls through to capacity for a policy it does not know', () => {
    // An API that grows a case must not print a raw enum value at anybody.
    expect(
      heroPillLabel({
        doorPolicy: 'ticketed' as never,
        maxCapacity: 50,
        currentCapacity: 47,
      }),
    ).toBe('3 SPOTS LEFT')
  })
})

import { readFileSync } from 'fs'
import { join } from 'path'
import {
  ACCOUNT_MIN_AGE,
  ADULTS_ONLY,
  accountAgeError,
  isAccountAge,
  isCompleteDateOfBirth,
  isUnderAccountAge,
  profileFormErrors,
} from '../lib/onboarding'

/**
 * Blend'n is 18+ (SCRUM-330). The store listings said so; the forms took 13.
 *
 * The owner's ruling, 2026-09-27: sign-up needs an age of 18 or over, a
 * Google or Apple account is held at "The basics" until a birth date of 18+,
 * and no new age under 18 is accepted anywhere. Accounts made before the
 * ruling are left alone — a 17-year-old keeps the age already on their
 * profile and can still save everything else (the SCRUM-293 trap, not
 * reopened).
 */
describe('the account floor is 18', () => {
  it('is one number and one sentence', () => {
    expect(ACCOUNT_MIN_AGE).toBe(18)
    expect(ADULTS_ONLY).toBe("Blend'n is for people 18 and over.")
  })

  it('sign-up requires an age, and refuses under 18 with the reason', () => {
    expect(accountAgeError('', { required: true })).toBe("Enter your age. Blend'n is for people 18 and over.")
    expect(accountAgeError('  ', { required: true })).toBe("Enter your age. Blend'n is for people 18 and over.")
    expect(accountAgeError('17', { required: true })).toBe(ADULTS_ONLY)
    expect(accountAgeError('13', { required: true })).toBe(ADULTS_ONLY)
    expect(accountAgeError('18', { required: true })).toBeNull()
    expect(accountAgeError('121', { required: true })).toBe('Enter a valid age between 18 and 120')
  })

  it('leaves an age that is optional alone when it is blank', () => {
    expect(accountAgeError('')).toBeNull()
  })

  it('accepts the age already on the profile, whatever it is', () => {
    expect(accountAgeError('17', { stored: 17 })).toBeNull()
    expect(accountAgeError('16', { stored: 17 })).toBe(ADULTS_ONLY)
  })
})

describe('Edit profile', () => {
  it('lets someone who joined at 17 keep that age and save, and sends nothing new', () => {
    expect(profileFormErrors({ name: 'Asha', age: '17', storedAge: 17 })).toEqual({ name: null, age: null, years: 17 })
  })

  it('refuses a new age under 18 with the reason', () => {
    expect(profileFormErrors({ name: 'Asha', age: '17', storedAge: 25 }).age).toBe(ADULTS_ONLY)
    expect(profileFormErrors({ name: 'Asha', age: '17', storedAge: null }).age).toBe(ADULTS_ONLY)
  })

  it('refuses 121 and anything that is not a whole number, naming the real range', () => {
    for (const age of ['121', 'abc', '17.5']) {
      expect(profileFormErrors({ name: 'Asha', age, storedAge: null }).age).toBe('Enter a valid age between 18 and 120')
    }
  })

  it('leaves an empty age alone and still requires a name', () => {
    expect(profileFormErrors({ name: '  ', age: '', storedAge: null })).toEqual({
      name: 'Name is required',
      age: null,
      years: undefined,
    })
  })

  it('hands back no age when it refused one, so nothing unchecked can be saved', () => {
    expect(profileFormErrors({ name: 'Asha', age: '12', storedAge: null }).years).toBeUndefined()
  })
})

describe('the birth date uses the same floor', () => {
  // A birthday today: exactly `years` old.
  const dobForAge = (years: number, dayOffset = 0) => {
    const now = new Date()
    return new Date(Date.UTC(now.getUTCFullYear() - years, now.getUTCMonth(), now.getUTCDate() + dayOffset))
      .toISOString()
      .slice(0, 10)
  }

  it('admits 18 today and 120, refuses 18 tomorrow and 121', () => {
    expect(isCompleteDateOfBirth(dobForAge(18))).toBe(true)
    expect(isCompleteDateOfBirth(dobForAge(120))).toBe(true)
    expect(isCompleteDateOfBirth(dobForAge(18, 1))).toBe(false)
    expect(isCompleteDateOfBirth(dobForAge(121))).toBe(false)
  })

  it('says a real birth date is under 18, and nothing about a date that is not one', () => {
    expect(isUnderAccountAge(dobForAge(17))).toBe(true)
    expect(isUnderAccountAge(dobForAge(18, 1))).toBe(true)
    expect(isUnderAccountAge(dobForAge(18))).toBe(false)
    expect(isUnderAccountAge(dobForAge(-1))).toBe(false) // the future is "not a date", not "too young"
    expect(isUnderAccountAge('2009-02-31')).toBe(false)
    expect(isUnderAccountAge(undefined)).toBe(false)
  })
})

describe('one age rule for every form that takes an age', () => {
  const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8')

  it('is the one isAccountAge, not numbers written into each screen', () => {
    expect(isAccountAge(18)).toBe(true)
    expect(isAccountAge(120)).toBe(true)
    expect(isAccountAge(17)).toBe(false)
    expect(isAccountAge(17.5)).toBe(false)
    expect(isAccountAge(null)).toBe(false)
    for (const screen of ['app/edit-profile.tsx', 'app/sign-in.tsx']) {
      const src = read(screen)
      expect(src).not.toMatch(/years? *< *1[38]\b|parsedAge as number\) *< *18/)
      expect(src).toMatch(/accountAgeError|profileFormErrors/)
    }
  })

  it('makes sign-up ask for an age and no longer calls it optional', () => {
    const src = read('app/sign-in.tsx')
    expect(src).toContain('accountAgeError(age, { required: true })')
    expect(src).not.toContain('Age (optional)')
    expect(src).not.toContain('Used for age-restricted events')
  })

  it('tells "The basics" why Continue is off: under 18, or not a usable date', () => {
    const src = read('app/onboarding/basics.tsx')
    // Announced as it appears (a live region), so the attributes may grow.
    expect(src).toMatch(/isUnderAccountAge\(dateOfBirth\) \? \(\s*<Text style=\{styles\.error\}[^>]*>\{ADULTS_ONLY\}<\/Text>/)
    // `!dateOfBirth` is never true once the boxes are full, so 30 February showed nothing.
    expect(src).toMatch(
      /dateOfBirth && !isCompleteDateOfBirth\(dateOfBirth\) \? \(\s*<Text style=\{styles\.error\}[^>]*>That is not a date we recognise\.<\/Text>/
    )
    expect(src).not.toMatch(/&& !dateOfBirth \? \(/)
    // The two cases are disjoint: an impossible date is never "under 18".
    expect(isUnderAccountAge('2010-02-30')).toBe(false)
    expect(isCompleteDateOfBirth('2010-02-30')).toBe(false)
  })

  it('saves the age the form checked, against the age already on file', () => {
    const src = read('app/edit-profile.tsx')
    expect(src).toContain('const errors = profileFormErrors({ name, age, storedAge: profile?.age ?? null })')
    expect(src).toContain('const parsedAge = errors.years')
    expect(src).not.toMatch(/parseInt\(trimmedAge/)
  })

  it('shows Edit profile the reason when Save is refused, wherever the person is on the page', () => {
    const src = read('app/edit-profile.tsx')
    const refused = src.slice(src.indexOf('if (errors.name || errors.age)')).slice(0, 900)
    // To the Basic Information card's own offset, not 0 (the photo grid)...
    expect(refused).toMatch(/scrollRef\.current\?\.scrollTo\(\{ *y: *basicInfoY\.current/)
    expect(src).toMatch(/onLayout=\{\(e\) => \{ basicInfoY\.current = e\.nativeEvent\.layout\.y \}\}>\s*<Text style=\{styles\.cardTitle\}>BASIC INFORMATION/)
    // ...and focus on the field to fix, not left on Save.
    expect(refused).toContain('(errors.name ? nameInputRef : ageInputRef).current?.focus()')
    expect(src).toMatch(/ref=\{nameInputRef\}\s*accessibilityLabel="Name"/)
    expect(src).toMatch(/ref=\{ageInputRef\}\s*accessibilityLabel="Age"/)
  })
})

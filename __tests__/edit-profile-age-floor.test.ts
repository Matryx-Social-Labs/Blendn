import { readFileSync } from 'fs'
import { join } from 'path'
import { ACCOUNT_MIN_AGE, isAccountAge, isCompleteDateOfBirth, profileFormErrors } from '../lib/onboarding'

/**
 * A 13–17-year-old can save their profile (SCRUM-293).
 *
 * Driven on Android: a 17-year-old ticked a chip in Edit profile and pressed
 * Save; nothing was sent. The editor refused every age under 18 — "Enter a
 * valid age between 18 and 120" under their own pre-filled age — while sign-up
 * and the API admit 13 and up. The error sat at the top of the form, so from
 * anywhere below it Save looked dead.
 */
describe('Edit profile accepts every age the product admits', () => {
  it('lets a 17-year-old save, and hands back the age it checked', () => {
    expect(profileFormErrors({ name: 'Asha', age: '17' })).toEqual({ name: null, age: null, years: 17 })
  })

  it('lets 13 save, the youngest age sign-up and the API accept', () => {
    expect(ACCOUNT_MIN_AGE).toBe(13)
    expect(profileFormErrors({ name: 'Asha', age: '13' }).age).toBeNull()
  })

  it('still refuses 12, 121, and anything that is not a whole number, naming the real range', () => {
    for (const age of ['12', '121', 'abc', '17.5']) {
      expect(profileFormErrors({ name: 'Asha', age }).age).toBe('Enter a valid age between 13 and 120')
    }
  })

  it('leaves an empty age alone and still requires a name', () => {
    expect(profileFormErrors({ name: '  ', age: '' })).toEqual({ name: 'Name is required', age: null, years: undefined })
  })

  it('hands back no age when it refused one, so nothing unchecked can be saved', () => {
    expect(profileFormErrors({ name: 'Asha', age: '12' }).years).toBeUndefined()
  })
})

describe('the birth date uses the same floor and ceiling', () => {
  // A birthday today: exactly `years` old.
  const dobForAge = (years: number) => {
    const now = new Date()
    return new Date(Date.UTC(now.getUTCFullYear() - years, now.getUTCMonth(), now.getUTCDate()))
      .toISOString()
      .slice(0, 10)
  }

  it('admits 13 and 120 and refuses 12 and 121', () => {
    expect(isCompleteDateOfBirth(dobForAge(13))).toBe(true)
    expect(isCompleteDateOfBirth(dobForAge(120))).toBe(true)
    expect(isCompleteDateOfBirth(dobForAge(12))).toBe(false)
    expect(isCompleteDateOfBirth(dobForAge(121))).toBe(false)
  })
})

describe('one age rule for every form that takes an age', () => {
  const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8')

  it('is the one isAccountAge, not numbers written into each screen', () => {
    expect(isAccountAge(13)).toBe(true)
    expect(isAccountAge(120)).toBe(true)
    expect(isAccountAge(12)).toBe(false)
    expect(isAccountAge(17.5)).toBe(false)
    expect(isAccountAge(null)).toBe(false)
    for (const screen of ['app/edit-profile.tsx', 'app/sign-in.tsx', 'app/about-you.tsx']) {
      const src = read(screen)
      expect(src).not.toMatch(/years? *< *1[38]\b|parsedAge as number\) *< *18/)
      expect(src).toMatch(/isAccountAge|profileFormErrors/)
    }
    // A dropped `!` would refuse every real age and still contain the name.
    expect(read('app/sign-in.tsx')).toContain("if (!isAccountAge(years)) return 'Enter a valid age.'")
    expect(read('app/about-you.tsx')).toMatch(/needsAge && age\.trim\(\) && !isAccountAge\(years\)/)
  })

  it('saves the age the form checked, not a second parse of the same text', () => {
    const src = read('app/edit-profile.tsx')
    expect(src).toContain('const errors = profileFormErrors({ name, age })')
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

import { counterLimit, limitErrors, overCapMessage, PROFILE_LIMITS, serverLength } from '../lib/profileLimits'
import { readFileSync } from 'fs'
import { join } from 'path'

const blank = { name: '', location: '', occupation: '', education: '', phone: '', bio: '' }

describe('profile limits are the server’s', () => {
  it('match lib/validations/profile.ts (admin): name 100, location 200, occupation 100, education 100, phone 20, bio 500', () => {
    expect(PROFILE_LIMITS).toEqual({ name: 100, location: 200, occupation: 100, education: 100, phone: 20, bio: 500 })
  })

  it('count UTF-16 units of the trimmed text, as what is saved: an emoji is two, padding is nothing', () => {
    expect(serverLength('a😀')).toBe(3)
    expect(serverLength('  ab  ')).toBe(2)
  })

  it('the over-cap sentence is stable: no live number in it', () => {
    expect(overCapMessage(100)).toBe('100 characters at most.')
  })

  it('no field is over its cap at the cap, and each is over one past it', () => {
    for (const field of Object.keys(PROFILE_LIMITS) as (keyof typeof PROFILE_LIMITS)[]) {
      const at = { ...blank, [field]: 'x'.repeat(PROFILE_LIMITS[field]) }
      const over = { ...blank, [field]: 'x'.repeat(PROFILE_LIMITS[field] + 1) }
      expect(limitErrors(at)).toEqual({})
      expect(limitErrors(over)).toEqual({ [field]: overCapMessage(PROFILE_LIMITS[field]) })
    }
  })

  it('the counter appears from 80% of the cap and not before', () => {
    expect(counterLimit('x'.repeat(79), 100)).toBeUndefined()
    expect(counterLimit('x'.repeat(80), 100)).toBe(100)
  })
})

// Source-shape guards only: the behaviour is in editProfileScreen, onboardingBasicsScreen and onboardingDetailsJourneyScreens.
describe('source shape: Edit profile and onboarding keep no cap of their own and slice nothing', () => {
  const read = (file: string) => readFileSync(join(__dirname, '..', file), 'utf8')

  it('Edit profile has no slice on a text field and no cap of its own', () => {
    const src = read('app/edit-profile.tsx')
    expect(src).not.toMatch(/value\.slice\(0, (NAME|FIELD|BIO|PHONE)_LIMIT\)/)
    expect(src).not.toMatch(/const (NAME|FIELD|BIO|PHONE)_LIMIT = /)
  })

  it('the onboarding steps slice nothing and take their caps from the same constant', () => {
    for (const file of ['app/onboarding/basics.tsx']) {
      const src = read(file)
      expect(src).not.toMatch(/value\.slice\(0, /)
      expect(src).toMatch(/PROFILE_LIMITS\./)
    }
  })
})

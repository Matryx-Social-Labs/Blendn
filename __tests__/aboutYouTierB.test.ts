import { splitTierB, tierBNames } from '../lib/aboutYou'

describe('the Tier B split (the server refuses a whole request over the day’s limit)', () => {
  it('languages, home state and sign (with its calendar) go one way, the badge switches the other', () => {
    expect(
      splitTierB({ languages: ['tulu'], home_state: 'goa', sun_sign: 'leo', sign_system: 'rashi', show_badges: false, shows_up_badge: true })
    ).toEqual({
      tierB: { languages: ['tulu'], home_state: 'goa', sun_sign: 'leo', sign_system: 'rashi' },
      other: { show_badges: false, shows_up_badge: true },
    })
    expect(splitTierB({})).toEqual({ tierB: {}, other: {} })
  })

  it('names what a body carries, in the person’s words', () => {
    expect(tierBNames({ languages: [] })).toBe('languages')
    expect(tierBNames({ home_state: null })).toBe('home state')
    expect(tierBNames({ sun_sign: null, sign_system: null })).toBe('sign')
    expect(tierBNames({ languages: [], home_state: 'goa', sun_sign: 'leo', sign_system: 'western' })).toBe('languages, home state and sign')
    expect(tierBNames({ languages: [], sun_sign: 'leo', sign_system: 'western' })).toBe('languages and sign')
  })
})

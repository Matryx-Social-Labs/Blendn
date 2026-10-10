import { allReasons } from '../components/blendn/PersonCard'
import {
  aboutLine,
  aboutYouFrom,
  aboutYouUpdate,
  answersUpdate,
  NO_ABOUT_YOU,
  toggleLanguage,
  type AboutYou,
} from '../lib/aboutYou'
import { withheldUnlessVisible } from '../lib/profileIdentity'
import type { RoomPerson } from '../lib/useRoom'

jest.mock('../components/blendn/Face', () => ({ Face: () => null }))
jest.mock('../components/blendn/HeartPop', () => ({ HeartPop: () => null }))

/**
 * Matching v2 on the app (step 10, MV-CU01..CU04): the about-you editor sends
 * only what changed and a sign with its calendar; the cards print the server's
 * lines and nothing it did not send; a profile withholds the about line until
 * the server says you may see who this is.
 */

describe('the about-you editor (MV-CU01)', () => {
  const kerala: AboutYou = { languages: ['malayalam'], homeState: 'kerala', sign: { slug: 'leo', system: 'western' }, showsUpBadge: false }

  it('reads the profile defensively, an older server as nothing chosen', () => {
    expect(aboutYouFrom(undefined)).toEqual(NO_ABOUT_YOU)
    expect(aboutYouFrom({ sun_sign: 'leo' })).toEqual(NO_ABOUT_YOU) // a sign without its calendar is no sign
    expect(aboutYouFrom({ languages: ['malayalam'], home_state: 'kerala', sun_sign: 'leo', sign_system: 'western' })).toEqual(kerala)
  })

  it('sends nothing when nothing changed', () => {
    expect(aboutYouUpdate(kerala, { ...kerala, languages: [...kerala.languages] })).toEqual({})
  })

  it('sends a sign with its calendar, and both null to take it off', () => {
    expect(aboutYouUpdate(kerala, { ...kerala, sign: { slug: 'leo', system: 'rashi' } })).toEqual({ sun_sign: 'leo', sign_system: 'rashi' })
    expect(aboutYouUpdate(kerala, { ...kerala, sign: null })).toEqual({ sun_sign: null, sign_system: null })
    expect(aboutYouUpdate(kerala, { ...kerala, homeState: null, showsUpBadge: true })).toEqual({ home_state: null, shows_up_badge: true })
  })

  it('never picks past the cap, and a second tap takes one back', () => {
    expect(toggleLanguage(['a', 'b'], 'c', 2)).toEqual(['a', 'b'])
    expect(toggleLanguage(['a', 'b'], 'a', 2)).toEqual(['b'])
    expect(toggleLanguage([], 'a', 5)).toEqual(['a'])
  })

  it('this-or-that: only the answers that moved, null to take one back', () => {
    expect(answersUpdate({ coffee_or_chai: 'a', metro_or_auto: 'b' }, { coffee_or_chai: 'b' })).toEqual({
      coffee_or_chai: 'b',
      metro_or_auto: null,
    })
    expect(answersUpdate({ coffee_or_chai: 'a' }, { coffee_or_chai: 'a' })).toEqual({})
  })
})

describe('a person card prints the server\'s lines (MV-CU02)', () => {
  const person = (over: Partial<RoomPerson>): RoomPerson =>
    ({
      sharedIntents: [],
      sharedPlans: 0,
      sharedEvents: 0,
      sharedWorkField: false,
      workField: null,
      overlaps: [],
      sign: null,
      badges: [],
      ...over,
    }) as unknown as RoomPerson

  it('every overlap, as sent, after the reasons that were there before', () => {
    const reasons = allReasons(
      person({
        sharedIntents: ['friends'],
        overlaps: [
          { kind: 'ipl', text: 'Both CSK — in RCB country 💛' },
          { kind: 'home_state', text: 'Both from Kerala' },
        ],
      })
    ).map((r) => r.text)
    expect(reasons).toEqual(['Both here to make friends', 'Both CSK — in RCB country 💛', 'Both from Kerala'])
  })

  it('invents nothing when the server sent nothing', () => {
    expect(allReasons(person({}))).toEqual([])
  })
})

describe('a profile says where someone is from only once you may know who they are (MV-CU03)', () => {
  it('composes the line and withholds it unrevealed', () => {
    const about = aboutLine({ languages: ['Malayalam', 'Kannada'], homeState: 'Kerala', sign: 'Leo ♌' })
    expect(about).toBe('Speaks Malayalam, Kannada · From Kerala · Leo ♌')
    expect(aboutLine({ homeState: 'Grew up abroad' })).toBe('Grew up abroad')
    expect(aboutLine({})).toBeNull()
    expect(withheldUnlessVisible({ about, identityVisible: false }).about).toBeUndefined()
    expect(withheldUnlessVisible({ about, identityVisible: true }).about).toBe(about)
  })
})

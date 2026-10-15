import { readFileSync } from 'fs'
import { join } from 'path'

const read = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8')

/*
 * What onboarding tells people about their name in rooms (SCRUM-493).
 *
 * Basics asked for a first and last name and promised "Only your first name
 * shows in an event room". Nothing shortens it: a person who shows their name
 * in a room shows all of it (the roster, the match deck, arrivals, waves and
 * the profile card all send `User.name`). And the anonymity switch said "Off,
 * everyone there sees your name and photo", when off only means the app offers
 * to show it at check-in — every check-in starts unrevealed.
 */
describe('onboarding tells the truth about names in rooms', () => {
  it('does not promise that only a first name shows', () => {
    const helper = read('app/onboarding/basics.tsx').match(/label="Your name"[\s\S]*?helper="([^"]+)"/)?.[1]
    expect(helper).toBeDefined()
    expect(helper).not.toMatch(/first name/i)
    expect(helper).toMatch(/made-up name/)
    expect(helper).toMatch(/full name/)
  })

  it('says the switch offers a reveal at check-in, not that it reveals', () => {
    const helper = read('app/onboarding/preferences.tsx').match(/label="Stay anonymous at events"\s*helper="([^"]+)"/)?.[1]
    expect(helper).toBeDefined()
    expect(helper).not.toMatch(/everyone there sees/i)
    expect(helper).toMatch(/offer to show your name and photo when you check in/)
  })
})

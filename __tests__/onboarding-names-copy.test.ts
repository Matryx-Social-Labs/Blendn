import { readFileSync } from 'fs'
import { join } from 'path'

const read = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8')

/*
 * What onboarding tells people about their name in rooms (SCRUM-493).
 *
 * Basics asked for a first and last name and promised "Only your first name
 * shows in an event room". Nothing shortened it, so the copy was changed to say so; the server now
 * does shorten it (Blendn-Admin #854: every room surface names a recognised person by first name). And the anonymity switch said "Off,
 * everyone there sees your name and photo", when off only means the app offers
 * to show it at check-in — every check-in starts unrevealed.
 */
describe('onboarding tells the truth about names in rooms', () => {
  it('does not promise that only a first name shows', () => {
    const helper = read('app/onboarding/basics.tsx').match(/const NAME_HINT = '([^']+)'/)?.[1]
    expect(helper).toBeDefined()
    expect(helper).toMatch(/made-up name/)
  })

  it('says a person shown in a room shows their first name, and the full name is for people they match or talk with (server, SCRUM-493)', () => {
    const helper = read('app/onboarding/basics.tsx').match(/const NAME_HINT = '([^']+)'/)?.[1]
    expect(helper).toMatch(/see your first name/)
    expect(helper).toMatch(/full name is for people you match or talk with/)
    expect(helper).not.toMatch(/see your full name/)
    const prefs = read('app/event-preferences/[eventId].tsx')
    expect(prefs).toMatch(/shows your first name and photo to people in this room/)
    expect(prefs).not.toMatch(/shows your real name and photo/)
  })

  it('says the switch offers a reveal at check-in, not that it reveals', () => {
    const helper = read('app/onboarding/preferences.tsx').match(/const ANONYMITY_HELP = '([^']+)'/)?.[1]
    expect(helper).toBeDefined()
    expect(helper).not.toMatch(/everyone there sees/i)
    expect(helper).toMatch(/offer to show your name and photo when you check in/)
  })
})

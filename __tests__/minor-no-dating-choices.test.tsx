import { render, screen } from '@testing-library/react-native'
import { readFileSync } from 'fs'
import { join } from 'path'

import { LookingForCards } from '../components/onboarding/LookingForCards'
import { MatchingFields, type MatchingFieldsProps } from '../components/profile/MatchingFields'
import { DATING_MIN_AGE, mayDate } from '../lib/dating'

/*
 * A minor is not offered Dating anywhere (SCRUM-294).
 *
 * Driven on staging with two 17-year-olds: onboarding's "Looking for" showed
 * the Dating card (and the API stored it), and Edit profile's "What are you
 * open to?" offered Dating, which then showed "You are" and "You identify as"
 * — the orientation questions SCRUM-200 took out of onboarding. The server
 * refuses all of it; the app should not ask.
 */

const noop = () => {}
const fields = (over: Partial<MatchingFieldsProps>) => (
  <MatchingFields
    intents={[]}
    onToggleIntent={noop}
    workField={null}
    onChangeWorkField={noop}
    workFields={[]}
    gender={null}
    onChangeGender={noop}
    orientations={[]}
    onChangeOrientations={noop}
    interestedIn={[]}
    onChangeInterestedIn={noop}
    offerDating
    {...over}
  />
)

describe('mayDate: the client twin of the server rule', () => {
  it('is 18 and over, and an unknown age is not old enough', () => {
    expect(DATING_MIN_AGE).toBe(18)
    expect(mayDate(18)).toBe(true)
    expect(mayDate(17)).toBe(false)
    expect(mayDate(null)).toBe(false)
    expect(mayDate(undefined)).toBe(false)
  })
})

describe('Looking for', () => {
  it('offers Dating to an adult', async () => {
    await render(<LookingForCards selected={[]} onToggle={noop} />)
    expect(screen.getByLabelText('Dating')).toBeTruthy()
  })

  it('does not offer Dating to a minor, and keeps the other four', async () => {
    await render(<LookingForCards selected={[]} onToggle={noop} withoutDating />)
    expect(screen.queryByLabelText('Dating')).toBeNull()
    for (const option of ['Friendship', 'Networking', 'Travel', 'Open']) {
      expect(screen.getByLabelText(option)).toBeTruthy()
    }
  })
})

describe('What are you open to?', () => {
  it('offers Dating and its questions to someone who may date', async () => {
    await render(fields({ intents: ['dating'] }))
    expect(screen.getByText(/^Dating/)).toBeTruthy()
    expect(screen.getByText('You identify as')).toBeTruthy()
  })

  it('offers a minor neither the chip nor the questions — even with a stale dating intent', async () => {
    await render(fields({ offerDating: false, intents: ['dating'] }))
    expect(screen.queryByText(/^Dating/)).toBeNull()
    expect(screen.queryByText('You are')).toBeNull()
    expect(screen.queryByText('You identify as')).toBeNull()
    expect(screen.getByText(/^Friendship/)).toBeTruthy()
  })
})

describe('every screen asks', () => {
  const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8')

  it('Edit profile decides from the age the server holds', () => {
    expect(read('app/edit-profile.tsx')).toMatch(/offerDating=\{mayDate\(profile\?\.age\)\}/)
  })

  it('onboarding hides the card and does not send a stale "Dating" for a minor', () => {
    const src = read('app/onboarding/preferences.tsx')
    expect(src).toMatch(/<LookingForCards[^>]*withoutDating=\{under18\}/)
    expect(src).toMatch(/looking_for: under18 \? withoutDatingChoice\(lookingFor\) : lookingFor/)
  })

  it('About you offers it unless the age typed there is under 18', () => {
    expect(read('app/about-you.tsx')).toMatch(/offerDating=\{/)
  })
})

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
  // Direction A asks friends, networking or both (the flow walk); dating is Edit profile's, so no one, minor or adult, sees it here.
  it('offers the three answers and no Dating tile', async () => {
    await render(<LookingForCards selected={null} onSelect={noop} />)
    expect(screen.queryByLabelText('Dating')).toBeNull()
    for (const option of ['Making friends', 'Networking', 'Both, depends on the night']) {
      expect(screen.getByLabelText(option)).toBeTruthy()
    }
  })
})

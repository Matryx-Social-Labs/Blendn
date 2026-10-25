/**
 * Settings › Help › Tips (R4-2): every coach-mark sentence, grouped by screen, reading only. The sentences live with their
 * marks; this fails when one drifts from the list.
 */
import { fireEvent, render, screen } from '@testing-library/react-native'
import { readFileSync } from 'fs'
import { join } from 'path'

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'))
jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn() }, useIsFocused: () => true }))
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 59, bottom: 34, left: 0, right: 0 }) }))
jest.mock('../lib/useAuth', () => ({ useAuth: () => ({ user: { id: 'u_me' } }), currentUserId: () => 'u_me' }))

import { router } from 'expo-router'
import TipsScreen from '../app/tips'
import { COACH_TIPS } from '../lib/coachMarks'

const source = (path: string) => readFileSync(join(__dirname, '..', path), 'utf8')

describe('the Tips screen', () => {
  it('says what it is, and lists every tip under the screen it shows on, with when', async () => {
    await render(<TipsScreen />)
    expect(screen.getByText(/Each tip shows once/)).toBeTruthy()
    for (const tip of COACH_TIPS) {
      expect(screen.getByText(tip.screen)).toBeTruthy()
      expect(screen.getByText(tip.text)).toBeTruthy()
      expect(screen.getByText(tip.when)).toBeTruthy()
    }
  })

  it('replays nothing: a tip is not a button', async () => {
    await render(<TipsScreen />)
    expect(screen.queryAllByRole('button', { name: /Hold an event/ })).toHaveLength(0)
    await fireEvent.press(screen.getByText('Hold an event to save, share or preview it.'))
    expect(router.push).not.toHaveBeenCalled()
  })

  it('goes back', async () => {
    await render(<TipsScreen />)
    await fireEvent.press(screen.getByLabelText('Back'))
    expect(router.back).toHaveBeenCalled()
  })
})

describe('the list and the marks say the same words', () => {
  const where: Record<string, string> = {
    events_preview_hint: 'app/(tabs)/events.tsx',
    room_reveal: 'components/blendn/BlendnScreen.tsx',
    door_pass: 'app/offer/[id].tsx',
  }
  for (const [id, file] of Object.entries(where)) {
    it(`${id}: the sentence is the one in ${file}`, () => {
      const tip = COACH_TIPS.find((t) => t.id === id)!
      expect(source(file)).toContain(tip.text)
    })
  }

  it('the centre button names its place where the list says "the venue", and says the rest the same', () => {
    const tip = COACH_TIPS.find((t) => t.id === 'centre_button_checkin')!
    expect(source('app/(tabs)/_layout.tsx')).toContain(tip.text.replace('the venue', '${checkInVenue}'))
  })

  it('the Blend card’s welcome ends with the list’s sentence', () => {
    const tip = COACH_TIPS.find((t) => t.id === 'blend_first_open')!
    expect(source('lib/crewsScreens.ts')).toContain(tip.text)
  })

  it('every mark in the app is listed, and nothing is listed that is not built', () => {
    const ids = Array.from(source('lib/coachMarks.ts').matchAll(/^\s+\| '([a-z_]+)'/gm), (m) => m[1])
    expect(COACH_TIPS.map((t) => t.id).sort()).toEqual(ids.sort())
  })
})

// D-L13: when a tip shows, said as a person would, never as a developer's condition. Negative control: the old lines fail it.
it('says when each tip shows in plain outcomes', () => {
  for (const tip of COACH_TIPS) expect(tip.when).not.toMatch(/on screen|it changes because|one is live|The first time/)
})

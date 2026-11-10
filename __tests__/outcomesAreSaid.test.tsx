/**
 * Motion audit M24 (SCRUM-1001): a state that changes in place is said once. On iOS that is an announcement; on Android the
 * element that shows it is a polite live region (`announceOutcome` / `useAnnounced`, components/ds/shared). These sites
 * carried only the live region, so iOS said nothing, or carried neither.
 */
import { readdirSync, readFileSync, statSync } from 'fs'
import { join } from 'path'
import { AccessibilityInfo, Platform, View } from 'react-native'
import { render, screen } from '@testing-library/react-native'

jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default)
jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() } }))
jest.mock('../lib/apiClient', () => ({ apiClient: {} }))

import { RequestCard } from '../components/banter/BanterParts'
import { RegularOff, RegularOn } from '../components/offer/OfferSections'

let announce: jest.SpyInstance
beforeEach(() => {
  Platform.OS = 'ios'
  announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibilityWithOptions').mockImplementation(() => {})
})
afterEach(() => announce.mockRestore())
const said = () => announce.mock.calls.map((c) => c[0])

it('the offer card’s "Done" after Turn off is said on iOS', async () => {
  await render(<RegularOff venueName="Toit" />)
  expect(said()).toEqual([expect.stringMatching(/^Done — Toit no longer sees you as a regular/)])
})

it('Turn off shows it is working while it saves', async () => {
  await render(<RegularOn venueName="Toit" saving onOff={jest.fn()} />)
  expect(screen.getByRole('button', { name: /Turn off/ }).props.accessibilityState).toMatchObject({ busy: true })
})

it('a Board request’s foot (an answer that did not go) is said, and is a live region on Android', async () => {
  const card = (foot?: string) => (
    <RequestCard face={<View />} name="Night Owl" note="Coffee after?" foot={foot} time="2m" onAccept={jest.fn()} onDecline={jest.fn()} />
  )
  const r = await render(card())
  expect(said()).toEqual([])
  await r.rerender(card('Couldn’t accept. Try again.'))
  expect(said()).toEqual(['Couldn’t accept. Try again.'])
  expect(screen.getByText('Couldn’t accept. Try again.').props.accessibilityLiveRegion).toBe('polite')
})

// Screens with no render harness here: each says its outcome through the shared helpers.
it.each([
  ['components/venue/VenueRegulars.tsx', 'the Done line after Turn off'],
  ['components/places/PlacesFilterSheet.tsx', '"Nothing matches"'],
  ['components/crews/BlendRoom.tsx', 'the closing line and a reveal'],
  ['components/crews/MadeBeat.tsx', 'the crew being made'],
  ['components/venue/UpcomingSheet.tsx', '"Couldn’t load more"'],
  ['components/profile/MatchingFields.tsx', 'the work fields that did not load'],
])('%s says %s', (file) => {
  expect(readFileSync(join(__dirname, '..', file), 'utf8')).toMatch(/\b(useAnnounced|announceOutcome)\(/)
})

/**
 * Motion audit M30: a skeleton's "Loading …" label sat on a View that is not `accessible`, so VoiceOver never reads it: the
 * label is an element's name, and a plain View is not an element. Every loading View is one element.
 */
it('every "Loading …" View is an accessibility element (M30)', () => {
  const root = join(__dirname, '..')
  const files: string[] = []
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name)
      if (statSync(full).isDirectory()) walk(full)
      else if (/\.tsx$/.test(name)) files.push(full)
    }
  }
  walk(join(root, 'app'))
  walk(join(root, 'components'))
  const unread = files
    .filter((f) => !f.includes(`${join(root, 'app', 'preview')}`))
    .flatMap((f) =>
      [...readFileSync(f, 'utf8').matchAll(/<(?:Animated\.|Reanimated\.)?View\b([^<>]*?(?:=>[^<>]*?)*)\/?>/g)]
        .map((m) => m[1])
        .filter((props) => /accessibilityLabel=(?:"|\{`)Loading/.test(props) && !/\baccessible\b/.test(props))
        .map(() => f.slice(root.length + 1))
    )
  expect(unread).toEqual([])
})

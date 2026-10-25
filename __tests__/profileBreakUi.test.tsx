/**
 * Worst-case data on the profile surfaces (break-ui): a name that will not break, no photos, nine photos, counts past the column,
 * thirty interests, a bio at its limit. Each renders, keeps its labels, and truncates where the frame truncates.
 */
import { act, render, screen } from '@testing-library/react-native'
import { Dimensions, StyleSheet, Text } from 'react-native'

jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 59, bottom: 34, left: 0, right: 0 }) }))
jest.mock('../components/OptimizedImage', () => ({ OptimizedImage: () => null }))
jest.mock('../components/ds/Orbs', () => ({ Orbs: () => null }))

/* eslint-disable import/first */
import { PersonRow } from '../components/friends/PersonRow'
import { MeIdentity, StatsCard } from '../components/profile/MeSections'
import { ProfileHeroStage } from '../components/profile/ProfileHeroStage'
import { ProfileBio, ProfileDetail, ProfileInterests } from '../components/profile/ProfileSections'
import { PhotoViewer } from '../components/profile/PhotoViewer'
/* eslint-enable import/first */

const LONG = 'Venkataramanan-Subramanian-Iyer-Krishnamurthy-Bhattacharya'

it('a name that will not break takes two lines, then an ellipsis, on Me', async () => {
  await render(<MeIdentity name={LONG} age={27} location="Thiruvananthapuram" memberSince="2025-03-04T00:00:00Z" occupation="Principal product designer, accessibility and inclusive research" photos={[]} onEdit={jest.fn()} onPhotos={jest.fn()} />)
  const heading = screen.getByRole('header')
  expect(heading.props.numberOfLines).toBe(2)
  expect(heading.props.accessibilityLabel).toBe(`${LONG}, 27`)
  // No photos: the cat on its plate, which is the way to add one.
  expect(screen.getByLabelText('Add a photo')).toBeTruthy()
})

it('the hero keeps its heading to two lines at the fixed-box cap', async () => {
  await render(<ProfileHeroStage width={390} photos={[]} name={LONG} age={27} subtitle="Design · Koramangala · a very long line that goes on" seed="Quiet Heron" />)
  const heading = screen.getByRole('header')
  expect(heading.props.numberOfLines).toBe(2)
  expect(heading.props.maxFontSizeMultiplier).toBe(1.3)
})

it('nine photos: a pip each, in one centred row', async () => {
  await render(<ProfileHeroStage width={390} photos={Array.from({ length: 9 }, (_, i) => `p${i}`)} name="Priya" age={26} seed="x" />)
  expect(screen.getByTestId('hero-pips', { includeHiddenElements: true }).children).toHaveLength(9)
})

it('the viewer counts nine photos', async () => {
  await render(<PhotoViewer photos={Array.from({ length: 9 }, (_, i) => `p${i}`)} initialIndex={8} visible onClose={jest.fn()} testID="v" />)
  expect(screen.getByLabelText('Photo 9 of 9')).toBeTruthy()
})

it('huge counts stay four digits in the stats card, and say the true number', async () => {
  await render(<StatsCard attended={1234567} saved={0} friends={100000} hosted={0} onGoing={jest.fn()} onFriends={jest.fn()} />)
  expect(screen.getByLabelText('1234567 Nights')).toBeTruthy()
  expect(screen.getByLabelText('100000 Friends')).toBeTruthy()
  expect(screen.getByLabelText('0 Saved')).toBeTruthy()
})

// D-L2: "1002" ran to the card's edge; grouped it reads at a glance. Negative control: without `grouping` there is no comma.
it('a four-digit count is grouped in the stats card: 1,002', async () => {
  await render(<StatsCard attended={1002} saved={0} friends={null} hosted={0} onGoing={jest.fn()} onFriends={jest.fn()} />)
  expect(screen.getAllByText(',', { includeHiddenElements: true })).toHaveLength(1)
})

it('thirty interests, a 500-character bio and a long education all render', async () => {
  const interests = Array.from({ length: 30 }, (_, i) => `Interest number ${i}`)
  await render(
    <>
      <ProfileInterests interests={interests} sharedInterests={['interest number 3']} />
      <ProfileBio text={'x'.repeat(500)} />
      <ProfileDetail label="EDUCATION" value={LONG} variant="ruled" />
    </>
  )
  expect(screen.getByText('Interest number 29')).toBeTruthy()
  expect(screen.getByLabelText(`education, ${LONG}`)).toBeTruthy()
})

it('a friend with a long name and no photo keeps its name to one line below the AX sizes (at them it takes two: DS-05)', async () => {
  const window = Dimensions.get('window')
  await act(async () => Dimensions.set({ window: { ...window, fontScale: 1 }, screen: { ...window, fontScale: 1 } }))
  await render(<PersonRow person={{ userId: 'u', name: LONG, photo: null }} detail="Friends since " detailMono="Mar 2026" onPress={jest.fn()} chevron />)
  expect(screen.getByText(LONG).props.numberOfLines).toBe(1)
  // No photo: the name's creature, a disc of its own (the initial on `surface` vanished into a card of the same colour).
  expect(screen.getByTestId('person-creature', { includeHiddenElements: true })).toBeTruthy()
  Dimensions.set({ window, screen: window })
})

it('a small button in a row is centred on it, not pinned to its top', async () => {
  await render(<PersonRow person={{ userId: 'u', name: 'Ana', photo: null }} detail="Requested" trailing={<Text testID="trail">Withdraw</Text>} />)
  const holder = screen.getByTestId('trail').parent
  expect(StyleSheet.flatten(holder?.props.style).alignSelf).toBe('center')
})

it('M6, as DS-05 amends it: a person row is one row tall at least, never a fixed box; lists window it by index only at the default size (usePersonRowsFixed)', async () => {
  const { PERSON_ROW_HEIGHT } = require('../components/friends/PersonRow') as typeof import('../components/friends/PersonRow')
  await render(<PersonRow person={{ userId: 'u', name: 'Venkataramanan-Subramanian-Iyer-Krishnamurthy-Bhattacharya', photo: null }} detail="Friends since " detailMono="Mar 2026" onPress={jest.fn()} />)
  const row = StyleSheet.flatten(screen.getByRole('button').props.style)
  expect(row.minHeight).toBe(PERSON_ROW_HEIGHT)
  expect(row.height).toBeUndefined()
})

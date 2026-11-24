/**
 * Worst-case data on the profile surfaces (break-ui): a name that will not break, no photos, nine photos, counts past the column,
 * thirty interests, a bio at its limit. Each renders, keeps its labels, and truncates where the frame truncates.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import { Dimensions, StyleSheet, Text } from 'react-native'

jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 59, bottom: 34, left: 0, right: 0 }) }))
jest.mock('../components/OptimizedImage', () => ({ OptimizedImage: () => null }))
jest.mock('../components/ds/Orbs', () => ({ Orbs: () => null }))

/* eslint-disable import/first */
import { PersonRow } from '../components/friends/PersonRow'
import { MeIdentity } from '../components/profile/MeSections'
import { hostedLine, savedLine } from '../components/profile/NightsOut'
import { ProfileHeroStage } from '../components/profile/ProfileHeroStage'
import { ProfileBio, ProfileDetail, ProfileInterests } from '../components/profile/ProfileSections'
import { PhotoViewer } from '../components/profile/PhotoViewer'
/* eslint-enable import/first */

const LONG = 'Venkataramanan-Subramanian-Iyer-Krishnamurthy-Bhattacharya'

it('the name on Me is never cut and never split inside a word (Me + settings A 01)', async () => {
  const window = Dimensions.get('window')
  await act(async () => Dimensions.set({ window: { ...window, fontScale: 2 }, screen: { ...window, fontScale: 2 } }))
  await render(<MeIdentity name={LONG} age={27} location="Saint-Jean-sur-Richelieu, QC" memberSince="2025-03-04T00:00:00Z" onEdit={jest.fn()} onPhoto={jest.fn()} onPreview={jest.fn()} />)
  const name = screen.getByTestId('me-name')
  // Never clamped: a 3-line name shows all three lines (today it was "Marc-André Lefebvre-D…" and the age was lost).
  expect(name.props.numberOfLines).toBeUndefined()
  expect(name.props.accessibilityLabel).toBe(`${LONG}, 27`)
  // A line that ends inside a word ("Marc-Andr / é", Android at font 2.0): the DS word fit measures the word to shrink it.
  // Negative control: the name drawn in a plain Text never measures, and this fails.
  await act(async () => fireEvent(name, 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 240, height: 120 } } }))
  await act(async () => fireEvent(name, 'textLayout', { nativeEvent: { lines: [{ text: 'Venkataramanan-Subrama', width: 240 }, { text: 'nian-Iyer-Krishnamurthy-Bhattacharya, 27', width: 240 }] } }))
  expect(screen.getByTestId('title-measure', { includeHiddenElements: true })).toBeTruthy()
  // No photo: your initial, which is the way to add one.
  expect(screen.getByLabelText('Add a photo')).toBeTruthy()
  Dimensions.set({ window, screen: window })
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

it('no "0 SAVED": Saved and Hosted are lines under Nights out, and only above zero (Me + settings A 01)', () => {
  // Negative control: a savedLine that formats 0 returns "0 saved · in Going" here.
  expect(savedLine(0)).toBeNull()
  expect(hostedLine(0)).toBeNull()
  expect(savedLine(1234)).toBe('1,234 saved · in Going')
  expect(hostedLine(2)).toBe('2 hosted')
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
  // No photo: a friend is named, so their initial on their hue disc, never a creature (personFace, F1 B).
  expect(screen.getByTestId('person-face', { includeHiddenElements: true })).toBeTruthy()
  Dimensions.set({ window, screen: window })
})

// Below the AX sizes (the jest window's own fontScale is 2, an AX size, where the action goes under the text: personRowLargeText).
it('a small button in a row is centred on it, not pinned to its top', async () => {
  const window = Dimensions.get('window')
  await act(async () => Dimensions.set({ window: { ...window, fontScale: 1 }, screen: { ...window, fontScale: 1 } }))
  await render(<PersonRow person={{ userId: 'u', name: 'Ana', photo: null }} detail="Requested" trailing={<Text testID="trail">Withdraw</Text>} />)
  const holder = screen.getByTestId('trail').parent
  expect(StyleSheet.flatten(holder?.props.style).alignSelf).toBe('center')
  Dimensions.set({ window, screen: window })
})

it('M6, as DS-05 amends it: a person row is one row tall at least, never a fixed box; lists window it by index only at the default size (usePersonRowsFixed)', async () => {
  const { PERSON_ROW_HEIGHT } = require('../components/friends/PersonRow') as typeof import('../components/friends/PersonRow')
  await render(<PersonRow person={{ userId: 'u', name: 'Venkataramanan-Subramanian-Iyer-Krishnamurthy-Bhattacharya', photo: null }} detail="Friends since " detailMono="Mar 2026" onPress={jest.fn()} />)
  const row = StyleSheet.flatten(screen.getByRole('button').props.style)
  expect(row.minHeight).toBe(PERSON_ROW_HEIGHT)
  expect(row.height).toBeUndefined()
})

/**
 * Motion audit M12, M25 (SCRUM-1001): a text action's target is its line plus the slop on each side. The slop was written
 * `(minTarget() - SPACE.xl) / 2`, which assumes a 24 pt line; the meta line those actions use is 20, so on iOS they came
 * to 40 pt, under the 44 minimum. The slop is taken from the line the text actually sets (`TYPE.<role>.lineHeight`).
 */
import { readdirSync, readFileSync, statSync } from 'fs'
import { join, relative } from 'path'
import { StyleSheet } from 'react-native'
import { render, screen } from '@testing-library/react-native'

jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default)
jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() } }))
jest.mock('../lib/apiClient', () => ({ apiClient: {} }))

import { NewAbovePill } from '../components/banter/BanterParts'
import { minTarget } from '../components/ds/shared'

const ROOT = join(__dirname, '..')
const walk = (dir: string, out: string[] = []): string[] => {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.tsx?$/.test(name)) out.push(full)
  }
  return out
}
const uncommented = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

// The Sheet's grip is a bar, not a line of text: its slop is measured from the spacing it sits in.
const NOT_TEXT = new Set(['components/ds/Sheet.tsx'])

it('no target slop is measured from a spacing step instead of the line it pads (M12, M25)', () => {
  const found = [...walk(join(ROOT, 'app')), ...walk(join(ROOT, 'components'))]
    .map((f) => relative(ROOT, f))
    .filter((f) => !NOT_TEXT.has(f))
    .filter((f) => /minTarget\(\)\s*-\s*SPACE\./.test(uncommented(readFileSync(join(ROOT, f), 'utf8'))))
  expect(found).toEqual([])
})

it('the Banter "New" pill reaches a full target (M12)', async () => {
  await render(<NewAbovePill top={0} onPress={jest.fn()} />)
  const pill = screen.getByRole('button', { name: 'New messages above' })
  const height = StyleSheet.flatten(screen.getByTestId('banter-new-above-pill').props.style).height as number
  expect(height + 2 * (pill.props.hitSlop as number)).toBeGreaterThanOrEqual(minTarget())
})

// Motion audit M26: these Pressables gave no press feedback on iOS (Android has its ripple), or none at all. A row takes
// the iOS wash, a line of text, a tile or a close mark dims; ScalePress answers on its own.
const M26 = [
  'components/venue/UpcomingSheet.tsx',
  'components/venue/VenueSections.tsx',
  'components/venue/VenueRegulars.tsx',
  'components/places/PlaceParts.tsx',
  'components/profile/PhotoGridTile.tsx',
  'components/profile/PhotoStack.tsx',
  'components/profile/MatchingFields.tsx',
  'components/plus/PlusSections.tsx',
  'components/share/ArrivalBanner.tsx',
]

it.each(M26)('every Pressable in %s answers a press (M26)', (file) => {
  const source = uncommented(readFileSync(join(ROOT, file), 'utf8'))
  // An opening tag's props run up to the next tag: its first child, or its close.
  const silent = [...source.matchAll(/<Pressable\b([^<]*)/g)]
    .map((m) => m[1])
    .filter((props) => !/style=\{\(\{ pressed \}\)/.test(props))
  expect(silent).toEqual([])
})

/**
 * A moment plays once it is on screen (motion audit M1). iOS draws one Modal at a time, so a match from the open person card
 * waited behind the card with its faces meeting and H.match firing out of sight. The clock starts from the Modal's onShow.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import { readFileSync } from 'fs'
import { join } from 'path'
import { AccessibilityInfo, Platform } from 'react-native'

import { MomentBlend } from '../components/ds/MomentBlend'
import { MomentMatch } from '../components/ds/MomentMatch'
import { MomentReady } from '../components/ds/MomentReady'
import { H } from '../lib/haptics'
import { releaseTurn, requestTurn, resetModalTurns, SHOW_WATCHDOG_MS } from '../lib/modalTurn'

// The test Modal without jest.setup's onShow: this file decides when it is on screen.
jest.mock('react-native/Libraries/Modal/Modal', () => ({ __esModule: true, default: jest.requireActual('@react-native/jest-preset/jest/mocks/Modal').default }))
jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default)
jest.mock('expo-linear-gradient', () => {
  const { View } = jest.requireActual('react-native')
  return { LinearGradient: (props: object) => <View {...props} /> }
})

const HIDDEN = { includeHiddenElements: true }
const advance = (ms: number) => act(async () => jest.advanceTimersByTime(ms))
const LONG_AFTER_ANY_BEAT = 10_000

const match = () => <MomentMatch you={{ kind: 'creature', pseudonym: 'You' }} them={{ kind: 'creature', pseudonym: 'Velvet Heron' }} name="Velvet Heron" onClose={jest.fn()} onSayHi={jest.fn()} testID="m" />

let haptic: jest.SpyInstance
let announce: jest.SpyInstance
beforeEach(() => {
  jest.useFakeTimers()
  jest.replaceProperty(Platform, 'OS', 'ios')
  resetModalTurns()
  haptic = jest.spyOn(H, 'match').mockImplementation(() => {})
  announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibilityWithOptions').mockImplementation(() => {})
})
afterEach(() => {
  jest.restoreAllMocks()
  jest.useRealTimers()
})

it('behind a sheet holding the screen: no haptic and no words; once the sheet goes and the Modal is up, the haptic, once', async () => {
  const sheet = {}
  requestTurn(sheet)
  await render(match())
  await advance(LONG_AFTER_ANY_BEAT)
  expect(haptic).not.toHaveBeenCalled()
  expect(announce).not.toHaveBeenCalled()

  await act(async () => releaseTurn(sheet))
  await act(async () => fireEvent(screen.getByTestId('m-modal', HIDDEN), 'show'))
  expect(announce).toHaveBeenCalledTimes(1)
  expect(haptic).not.toHaveBeenCalled()
  await advance(LONG_AFTER_ANY_BEAT)
  expect(haptic).toHaveBeenCalledTimes(1)
})

it('the Blend waits the same', async () => {
  const sheet = {}
  requestTurn(sheet)
  await render(<MomentBlend ours={{ kind: 'crew', name: 'Nebula', emblemSeed: 'nebula', count: 3 }} theirs={{ kind: 'crew', name: 'Orbit', emblemSeed: 'orbit', count: 4 }} facets={[]} yourLike onOpen={jest.fn()} onLater={jest.fn()} testID="b" />)
  await advance(LONG_AFTER_ANY_BEAT)
  expect(haptic).not.toHaveBeenCalled()
})

it('Ready hands off only after it was seen', async () => {
  const onDone = jest.fn()
  await render(<MomentReady onDone={onDone} testID="r" />)
  await advance(LONG_AFTER_ANY_BEAT)
  expect(onDone).not.toHaveBeenCalled()
  await act(async () => fireEvent(screen.getByTestId('r-modal', HIDDEN), 'show'))
  await advance(LONG_AFTER_ANY_BEAT)
  expect(onDone).toHaveBeenCalledTimes(1)
})

it('Android, with no watchdog, starts by the backstop if onShow never comes, so a moment cannot wait forever', async () => {
  jest.replaceProperty(Platform, 'OS', 'android')
  await render(match())
  await advance(SHOW_WATCHDOG_MS - 1)
  expect(announce).not.toHaveBeenCalled()
  await advance(1)
  expect(announce).toHaveBeenCalledTimes(1)
  await advance(LONG_AFTER_ANY_BEAT)
  expect(haptic).toHaveBeenCalledTimes(1)
})

it('the Room closes the person card when a match or a Blend lands', () => {
  const src = readFileSync(join(__dirname, '../components/blendn/BlendnScreen.tsx'), 'utf8')
  expect(src).toMatch(/const momentLanded = !!room\.match \|\| !!blend\s+useEffect\(\(\) => \{\s+if \(momentLanded\) setOpen\(null\)/)
})

/*
 * The tab layout is imported for its geometry only. Everything it pulls in
 * that needs a native module or a server is stubbed; none of it is under test.
 */
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
)
jest.mock('../lib/apiClient', () => ({ apiClient: {} }))
jest.mock('../lib/socketClient', () => ({}))
jest.mock('../components/blendn/BlendnScreen', () => ({ BlendnScreen: () => null }))
jest.mock('expo-router/js-tabs', () => ({ Tabs: () => null }))

import { tabBarBottomGap, tabBarTop } from '../app/(tabs)/_layout'
import { centreButtonOrigin } from '../components/blendn/RoomStage'
import { SIZE } from '../lib/design/tokens'

/**
 * The Blend'n screen opens *out of* the centre button, so the disc must start
 * exactly where the button is.
 *
 * `RoomStage` duplicates the bar's arithmetic rather than importing the tab
 * layout (importing it from the screen would drag the whole bar module in),
 * and its comment says `__tests__` pins the two together. This is that pin: a
 * bar that changes its padding or its line height and not the stage would
 * grow the room out of empty space a few points off the button.
 */
const DEVICES = [
  { name: 'home-indicator phone', width: 390, height: 844, inset: 34 },
  { name: 'large home-indicator phone', width: 430, height: 932, inset: 34 },
  { name: 'no inset (older iPhone, most Androids)', width: 375, height: 667, inset: 0 },
  { name: 'Android gesture bar', width: 412, height: 915, inset: 24 },
  { name: 'tablet', width: 820, height: 1180, inset: 20 },
]

describe('centreButtonOrigin sits on the centre button', () => {
  it.each(DEVICES)('$name', ({ width, height, inset }) => {
    const origin = centreButtonOrigin(width, height, inset)
    // Horizontally, the middle of the bar.
    expect(origin.x).toBe(width / 2)
    // Vertically, the middle of the 64 pt capsule the disc is centred in.
    expect(origin.y).toBe(tabBarTop(height, inset) + SIZE.tabBar / 2)
    // Said the other way up: half the capsule above its bottom gap.
    expect(origin.y).toBe(height - tabBarBottomGap(inset) - SIZE.tabBar / 2)
  })

  it('starts the circle at the disc’s own size', () => {
    // `RoomStage` scales from `SIZE.disc`, centred in the capsule.
    expect(SIZE.disc).toBeLessThanOrEqual(SIZE.tabBar)
  })
})

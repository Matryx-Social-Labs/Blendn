/* The media saver reads Low Power from expo-battery and the network type from expo-network: cellular is expensive. */
let mockLow = false
let mockType = 'WIFI'
jest.mock('expo-battery', () => ({ useLowPowerMode: () => mockLow }))
jest.mock('expo-network', () => ({ NetworkStateType: { CELLULAR: 'CELLULAR', WIFI: 'WIFI' }, useNetworkState: () => ({ type: mockType }) }))

/* eslint-disable import/first */
import { renderHook } from '@testing-library/react-native'

import { useMediaSaver } from '../lib/mediaSaver'
/* eslint-enable import/first */

it.each([
  [false, 'WIFI', { lowPower: false, expensiveNetwork: false }],
  [true, 'WIFI', { lowPower: true, expensiveNetwork: false }],
  [false, 'CELLULAR', { lowPower: false, expensiveNetwork: true }],
])('Low Power %s on %s', async (low, type, want) => {
  mockLow = low
  mockType = type
  const { result } = await renderHook(() => useMediaSaver())
  expect(result.current).toEqual(want)
})

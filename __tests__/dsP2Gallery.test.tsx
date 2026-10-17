/*
 * /preview/ds-p2 mounts, and every cell a device driver looks for is there.
 * The gallery is the only screen that draws the P2 components until their
 * flows adopt them, so a cell that throws would hide a component from review.
 */
import { render, screen } from '@testing-library/react-native'
import React from 'react'

import DsP2Preview from '../app/preview/ds-p2'

jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default)
jest.mock('expo-glass-effect', () => {
  const { View } = jest.requireActual('react-native')
  return {
    GlassView: (props: object) => <View {...props} />,
    isGlassEffectAPIAvailable: jest.fn(() => true),
    isLiquidGlassAvailable: jest.fn(() => true),
  }
})
jest.mock('expo-blur', () => {
  const { View } = jest.requireActual('react-native')
  return { BlurView: (props: object) => <View {...props} /> }
})
jest.mock('expo-linear-gradient', () => {
  const { View } = jest.requireActual('react-native')
  return { LinearGradient: (props: object) => <View {...props} /> }
})

const CELLS = [
  'ds-amenity-fold',
  'ds-eventcard-hero',
  'ds-eventcard-row-pressed',
  'ds-tonight-three',
  'ds-tonight-live',
  'ds-dayheading-list',
  'ds-section-slot',
  'ds-facepile-arrival',
  'ds-facemark-all',
  'ds-gridface-away',
  'ds-meetnext-row-360',
  'ds-hold-75',
  'ds-hold-live',
  'ds-venuepass-outside',
  'ds-doorcode-live',
  'ds-doorcode-offline',
  'ds-mapcard-address-you',
  'ds-mappin-family',
  'ds-mapcluster-all',
  'ds-person-here',
  'ds-person-gone',
  'ds-person-thin',
  'ds-person-waved',
  'ds-person-wavedatyou',
  'ds-person-live',
  'ds-rolling-q50',
  'ds-rolling-live',
  'ds-reveal-asked',
  'ds-timering-venue',
]

it('/preview/ds-p2 draws every component’s cells', async () => {
  await render(<DsP2Preview />)
  for (const id of CELLS) expect(screen.getByTestId(id, { includeHiddenElements: true })).toBeTruthy()
})

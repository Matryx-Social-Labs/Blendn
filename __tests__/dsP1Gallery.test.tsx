/*
 * /preview/ds-p1 mounts, and every cell a device driver looks for is there.
 * The gallery is the only screen that draws the P1 inputs until their flows
 * adopt them, so a cell that throws would hide a component from review.
 */
import { render, screen } from '@testing-library/react-native'
import React from 'react'

import DsP1Preview from '../app/preview/ds-p1'

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
  'ds-textfield-focused',
  'ds-textfield-secure-revealed',
  'ds-textarea-near-cap',
  'ds-datefield-under-18',
  'ds-searchfield-typing',
  'ds-chip-dimmed',
  'ds-chip-interest',
  'ds-toggle-pressed',
  'ds-toggle-row',
  'ds-segmented-pressed',
  'ds-radiocard-disabled',
  'ds-lookingfor-minor',
  'ds-stepper-ceiling',
  'ds-progress-live',
  'ds-tabbar-banter',
  'ds-topbar-condensed',
  'ds-mono-price',
]

it('/preview/ds-p1 draws every component’s cells', async () => {
  await render(<DsP1Preview />)
  for (const id of CELLS) expect(screen.getByTestId(id, { includeHiddenElements: true })).toBeTruthy()
})

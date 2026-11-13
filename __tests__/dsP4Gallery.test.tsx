/*
 * /preview/ds-p4 mounts, every cell a device driver looks for is there, and
 * the live cells run their timelines: Join → pending → done; We're here →
 * "Your crew knows"; a sheet opens from its button.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import React from 'react'

import DsP4Preview from '../app/preview/ds-p4'
import { H } from '../lib/haptics'

jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default)
jest.mock('expo-glass-effect', () => {
  const { View } = jest.requireActual('react-native')
  return { GlassView: (props: object) => <View {...props} />, isGlassEffectAPIAvailable: jest.fn(() => true), isLiquidGlassAvailable: jest.fn(() => true) }
})
jest.mock('expo-blur', () => {
  const { View } = jest.requireActual('react-native')
  return { BlurView: (props: object) => <View {...props} /> }
})
jest.mock('expo-linear-gradient', () => {
  const { View } = jest.requireActual('react-native')
  return { LinearGradient: (props: object) => <View {...props} /> }
})

beforeEach(() => {
  for (const k of Object.keys(H)) jest.spyOn(H, k as keyof typeof H).mockImplementation(() => {})
})

const CELLS = [
  'ds-notification-photo',
  'ds-notification-stack',
  'ds-notification-stale',
  'ds-notification-live',
  'ds-show-banner-wave',
  'ds-ticks-12-5',
  'ds-crewcard-as',
  'ds-crewcard-compact',
  'ds-crewrow',
  'ds-crewstrip-off',
  'ds-crewstrip-twoCrews',
  'ds-crewstrip-named',
  'ds-crewstrip-twelve',
  'ds-likingas-me',
  'ds-reveal-after',
  'ds-open-reveal-crew',
  'ds-open-golive-locked',
  'ds-open-golive-closed',
  'ds-open-session-ending',
  'ds-open-expiry-plus',
  'ds-expiry-notlive',
  'ds-badge-all',
  'ds-open-tonight-pending',
  'ds-plan-list',
  'ds-neverforsale',
  'ds-manage-night',
  'ds-offer-why',
  'ds-open-share-unlisted',
  'ds-og-e1-cancelled',
  'ds-og-v1-venue',
  'ds-story-recap-venue',
]

describe('the gallery, app/preview/ds-p4', () => {
  it('draws every component’s cells', async () => {
    await render(<DsP4Preview />)
    for (const id of CELLS) expect(screen.getByTestId(id, { includeHiddenElements: true })).toBeTruthy()
  })

  it('the live cells: Join settles to done; the crew strip has no button (crews 4-A3)', async () => {
    jest.useFakeTimers()
    await render(<DsP4Preview />)
    await fireEvent.press(screen.getByRole('button', { name: 'Join' }))
    await act(async () => jest.advanceTimersByTime(700))
    expect(screen.getByText('You’re in the car')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /We’re here/ })).toBeNull()
    jest.useRealTimers()
  })

  it('a sheet opens from its button', async () => {
    await render(<DsP4Preview />)
    await fireEvent.press(screen.getByTestId('ds-open-expiry-plus'))
    expect(screen.getByRole('button', { name: 'Extend 45 min — free' })).toBeTruthy()
  })
})

/*
 * Chrome floating on the home map is ink on the solid tier (owner, 2026-11-02): on Android the wordmark capsule and the
 * bell drew the control fill #242121 and read grey beside the ink drawer. On a page of its own (The Banter) the bell
 * keeps the control fill, or its circle would vanish into the ink ground.
 */
import { render, screen } from '@testing-library/react-native'
import React from 'react'
import { Platform, StyleSheet } from 'react-native'

import { NotificationBell } from '../components/pulse/NotificationBell'
import { PulseTopBar } from '../components/pulse/PulseTopBar'
import { SOLID } from '../components/ui/Material'
import { COLOR } from '../lib/design/tokens'

jest.mock('expo-router', () => ({ router: { push: jest.fn() }, useFocusEffect: () => {} }))
jest.mock('../lib/apiClient', () => ({ apiClient: { getNotifications: jest.fn(async () => ({ success: true, data: { unreadCount: 0 } })) } }))
jest.mock('../lib/socketClient', () => ({ subscribeToBell: () => () => {} }))
jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default)
jest.mock('expo-glass-effect', () => {
  const { View } = jest.requireActual('react-native')
  return { GlassView: View, isLiquidGlassAvailable: () => false, isGlassEffectAPIAvailable: () => false }
})

const fill = (testID: string) => StyleSheet.flatten(screen.getByTestId(testID, { includeHiddenElements: true }).props.style).backgroundColor
const os = Platform.OS
afterEach(() => {
  Platform.OS = os
})

describe('on Android (solid tier)', () => {
  beforeEach(() => {
    Platform.OS = 'android'
  })

  it('the wordmark capsule floating on the map is ink', async () => {
    await render(<PulseTopBar floating />)
    expect(fill('pulse-wordmark-capsule')).toBe(COLOR.ink)
  })

  it('the bell on the map is ink', async () => {
    await render(<NotificationBell onMap />)
    expect(fill('notification-bell-fill')).toBe(COLOR.ink)
  })

  it('the bell on a page of its own keeps the control fill', async () => {
    await render(<NotificationBell />)
    expect(fill('notification-bell-fill')).toBe(SOLID.control)
  })
})

it('on iOS the map chrome stays glass: no opaque fill laid over it', async () => {
  Platform.OS = 'ios'
  await render(<NotificationBell onMap />)
  expect(fill('notification-bell-fill')).not.toBe(COLOR.ink)
})

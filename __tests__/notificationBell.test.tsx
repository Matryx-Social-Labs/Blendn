/*
 * The bell is the same control as its neighbours wherever it sits (r7 M8): on Android Banter's bell was a 44 dp circle beside
 * 48 dp Search and Mark-all, and its glyph Ionicons' heavier "notifications-outline" beside Lucide. One glass circle, the
 * IconButton's size per platform, the DS bell glyph.
 */
import { render, screen } from '@testing-library/react-native'
import fs from 'fs'
import path from 'path'
import React from 'react'
import { Platform, StyleSheet } from 'react-native'

import { NotificationBell } from '../components/pulse/NotificationBell'
import { SIZE } from '../lib/design/tokens'

jest.mock('expo-router', () => ({ router: { push: jest.fn() }, useFocusEffect: () => {} }))
jest.mock('../lib/apiClient', () => ({ apiClient: { getNotifications: jest.fn(async () => ({ success: true, data: { unreadCount: 0 } })) } }))
jest.mock('../lib/socketClient', () => ({ subscribeToBell: () => () => {} }))
jest.mock('expo-glass-effect', () => {
  const { View } = jest.requireActual('react-native')
  return { GlassView: View, isLiquidGlassAvailable: () => false, isGlassEffectAPIAvailable: () => false }
})

const read = (...p: string[]) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8')
const os = Platform.OS
afterEach(() => {
  Platform.OS = os
})

it.each([
  ['ios', SIZE.circleButton],
  ['android', SIZE.circleButtonAndroid],
] as const)('on %s it is the IconButton’s circle, %i across', async (platform, size) => {
  Platform.OS = platform
  await render(<NotificationBell />)
  expect(StyleSheet.flatten(screen.getByTestId('notification-bell').props.style)).toMatchObject({ width: size, height: size })
})

it('draws the DS bell glyph, and Banter puts it beside its IconButtons unwrapped', async () => {
  await render(<NotificationBell />)
  const bell = read('components', 'pulse', 'NotificationBell.tsx')
  expect(bell).not.toMatch(/@expo\/vector-icons|Ionicons/)
  expect(bell).toMatch(/<Icon name="bell"/)
  expect(read('components', 'banter', 'BanterParts.tsx')).not.toMatch(/styles\.bell\b/)
})

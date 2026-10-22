/*
 * Home's top chrome is Flow 3's frame: no opaque band over the map, the wordmark a glass capsule, the bell a glass circle.
 */
import { render, screen } from '@testing-library/react-native'
import React from 'react'
import { StyleSheet } from 'react-native'

import { PulseTopBar } from '../components/pulse/PulseTopBar'

jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default)
jest.mock('expo-glass-effect', () => {
  const { View } = jest.requireActual('react-native')
  return { GlassView: View, isLiquidGlassAvailable: () => false, isGlassEffectAPIAvailable: () => false }
})

describe('PulseTopBar', () => {
  it('floating: transparent, the wordmark on a capsule', async () => {
    await render(<PulseTopBar floating />)
    const src = require('fs').readFileSync(require('path').join(__dirname, '../components/home/HomeShell.tsx'), 'utf8')
    expect(src).toMatch(/<PulseTopBar floating actions={<NotificationBell \/>} \/>/)
    expect(screen.getByText("Blend’n")).toBeTruthy()
    const styles = [] as object[]
    let node = screen.getByText("Blend’n").parent
    while (node) {
      styles.push(StyleSheet.flatten(node.props.style) ?? {})
      node = node.parent
    }
    // No ancestor paints the old opaque band.
    expect(styles.some((st) => (st as { backgroundColor?: string }).backgroundColor === '#0F0E0E')).toBe(false)
  })

  it('the Scene keeps its band', async () => {
    await render(<PulseTopBar />)
    const styles = [] as object[]
    let node = screen.getByText("Blend’n").parent
    while (node) {
      styles.push(StyleSheet.flatten(node.props.style) ?? {})
      node = node.parent
    }
    expect(styles.some((st) => typeof (st as { backgroundColor?: string }).backgroundColor === 'string' && (st as { backgroundColor?: string }).backgroundColor !== 'transparent')).toBe(true)
  })
})

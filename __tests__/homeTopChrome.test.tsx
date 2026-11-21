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
    expect(src).toMatch(/<PulseTopBar floating actions={<NotificationBell onMap \/>} \/>/)
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

  // #570 dropped `top/left/right: 0`: the absolute bar shrank to its content, so the bell sat beside the wordmark, not at the edge.
  it('spans the screen, so the bell sits at the right edge', async () => {
    await render(<PulseTopBar floating actions={<></>} />)
    const outermost = (() => {
      let node = screen.getByText("Blend’n").parent
      let last = node
      while (node) {
        if ((StyleSheet.flatten(node.props.style) as { position?: string } | undefined)?.position === 'absolute') last = node
        node = node.parent
      }
      return last
    })()
    const bar = StyleSheet.flatten(outermost?.props.style) as { position?: string; top?: number; left?: number; right?: number }
    expect(bar).toMatchObject({ position: 'absolute', top: 0, left: 0, right: 0 })
  })
})

// SCRUM-1090, sheet 17 pick A: at full the top bar sits on ink. The cover is drawn over the map and its banners and under
// the top bar, reaches under the drawer's rounded corners, and the covered map takes no touches.
describe('HomeShell at full', () => {
  const src = () => require('fs').readFileSync(require('path').join(__dirname, '../components/home/HomeShell.tsx'), 'utf8') as string

  it('draws the cover after the map and the banners, before the top bar', () => {
    const s = src()
    const at = (needle: string) => s.indexOf(needle)
    expect(at('<DrawerCover')).toBeGreaterThan(at('<HomeMap'))
    expect(at('<DrawerCover')).toBeGreaterThan(at('<MapBanners'))
    expect(at('<DrawerCover')).toBeLessThan(at('<PulseTopBar'))
    expect(s).toMatch(/<DrawerCover y={drawerTop} points={points} height={points\.full \+ RADIUS\.sheet} \/>/)
  })

  it('the covered map takes no touches at full', () => {
    expect(src()).toMatch(/pointerEvents={snap === 'full' \? 'none' : 'auto'}/)
  })
})

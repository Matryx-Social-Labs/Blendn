/*
 * The hosts that draw above every screen (the sheet host, toasts, coach marks) sit outside any screen's `HueProvider`, so they
 * are ember whatever world is open. They must therefore draw no hued part: the same pixels under every hue. Checked two ways:
 * by what they import, and by drawing them under each hue.
 */
import { render, screen } from '@testing-library/react-native'
import fs from 'fs'
import path from 'path'
import React from 'react'

import { CoachMark } from '../components/ds/CoachMark'
import { HueProvider, type Hue } from '../components/ds/shared'
import { Toast, type ToastKind } from '../components/ds/Toast'

jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default)
jest.mock('react-native-reanimated', () => ({ ...jest.requireActual('react-native-reanimated'), __esModule: true, useReducedMotion: jest.fn(() => false) }))
jest.mock('expo-glass-effect', () => {
  const { View } = jest.requireActual('react-native')
  return { GlassView: View, isLiquidGlassAvailable: () => false, isGlassEffectAPIAvailable: () => false }
})
jest.mock('expo-linear-gradient', () => {
  const { View } = jest.requireActual('react-native')
  return { LinearGradient: View }
})

const ROOT = path.join(__dirname, '..')
const read = (file: string) => fs.readFileSync(path.join(ROOT, file), 'utf8')

/** Everything that lights in a hue, by the name it is imported under. */
const HUED = /\b(useSelection|useHue|SELECTION|HueProvider|Chip|ChipSet|SegmentedControl|TitleTabs|RadioCard|LookingForCard|ProgressBar|CheckDisc)\b/

describe('the hosts import nothing that lights in a hue', () => {
  it.each(['components/SheetHost.tsx', 'components/ds/Sheet.tsx', 'components/ds/Toast.tsx', 'components/Toast.tsx', 'components/ds/CoachMarkHost.tsx', 'components/ds/CoachMark.tsx'])(
    '%s',
    (file) => {
      const imports = read(file)
        .split('\n')
        .filter((line) => /^(import|\} from)/.test(line) || /^import /.test(line))
        .join('\n')
      expect(imports).not.toMatch(HUED)
    }
  )
})

describe('drawn under each hue, they are the same', () => {
  const HUES: Hue[] = ['ember', 'rose', 'violet']
  const drawn = async (ui: (hue: Hue) => React.ReactElement, hue: Hue) => {
    await render(ui(hue))
    // The animated frame is a sample of a running animation, not a drawn part: left out.
    const json = JSON.stringify(screen.toJSON(), (key, v) => (typeof v === 'function' ? 'fn' : key === 'jestAnimatedStyle' ? undefined : v))
    await screen.unmount()
    return json
  }

  it.each(['success', 'error', 'info'] as ToastKind[])('a %s toast', async (kind) => {
    const ui = (hue: Hue) => (
      <HueProvider value={hue}>
        <Toast kind={kind} text="Saved" action={{ label: 'Undo', onPress: jest.fn() }} onDismiss={jest.fn()} testID="t" />
      </HueProvider>
    )
    const [ember, rose, violet] = [await drawn(ui, HUES[0]), await drawn(ui, HUES[1]), await drawn(ui, HUES[2])]
    expect(rose).toBe(ember)
    expect(violet).toBe(ember)
  })

  it('a coach mark', async () => {
    const ui = (hue: Hue) => (
      <HueProvider value={hue}>
        <CoachMark text="Swipe up" onDismiss={jest.fn()} testID="c" />
      </HueProvider>
    )
    const [ember, rose, violet] = [await drawn(ui, HUES[0]), await drawn(ui, HUES[1]), await drawn(ui, HUES[2])]
    expect(rose).toBe(ember)
    expect(violet).toBe(ember)
  })
})

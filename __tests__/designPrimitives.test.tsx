/*
 * <Icon> and <GradientFill>: the only ways to draw a glyph or a brand gradient
 * in the redesign, both reading the tokens.
 */
import { render, screen } from '@testing-library/react-native'
import fs from 'fs'
import path from 'path'
import React from 'react'

import { GradientFill } from '../components/ui/GradientFill'
import { Icon, type IconName } from '../components/ui/Icon'
import { GRADIENT, ICON } from '../lib/design/tokens'

jest.mock('expo-linear-gradient', () => {
  const { View } = jest.requireActual('react-native')
  return { LinearGradient: (props: object) => <View {...props} testID="gradient" /> }
})

const source = fs.readFileSync(path.join(__dirname, '../components/ui/Icon.tsx'), 'utf8')
const NAMES = [...source.matchAll(/^ {2}'?([a-z0-9-]+)'?: \w+,$/gm)].map((m) => m[1]) as IconName[]

describe('<Icon>', () => {
  it('maps every name in the inventory to a Lucide glyph that renders', async () => {
    expect(NAMES.length).toBeGreaterThan(100)
    for (const name of NAMES) {
      await render(<Icon name={name} />)
    }
  })

  const svg = () => (screen.toJSON() as { props: Record<string, unknown> }).props

  it('is outlined, never filled', async () => {
    await render(<Icon name="heart" />)
    expect(svg()).toMatchObject({ fill: 'none', width: ICON.nav, strokeWidth: ICON.stroke })
  })

  it('draws a 1.5 stroke at 24 that scales with the size, 2.25 when active', async () => {
    await render(<Icon name="heart" size={ICON.control} active />)
    // The stroke is in the 24-unit viewBox, so it scales with the size.
    expect(svg()).toMatchObject({ width: ICON.control, vbWidth: ICON.nav, strokeWidth: ICON.strokeActive })
    // Which is what the tokens' per-size strokes say: 1.5 at 24 is 1.25 at 20 and 1 at 16.
    expect((ICON.stroke * ICON.control) / ICON.nav).toBe(ICON.strokeAt20)
    expect((ICON.stroke * ICON.inline) / ICON.nav).toBe(ICON.strokeAt16)
  })

  it('imports each glyph on its own, never the package root (Metro does not tree-shake)', () => {
    expect(source).not.toMatch(/^import (?!type).* from 'lucide-react-native'$/m)
  })
})

describe('<GradientFill>', () => {
  it.each(['fill', 'brand'] as const)('draws the %s gradient from the tokens, 135°', async (gradient) => {
    await render(<GradientFill gradient={gradient} />)
    expect(screen.getByTestId('gradient').props).toMatchObject({
      colors: GRADIENT[gradient].colors,
      locations: GRADIENT[gradient].locations,
      start: { x: 0, y: 0 },
      end: { x: 1, y: 1 },
    })
  })

  it('is the white-text gradient by default', async () => {
    await render(<GradientFill />)
    expect(screen.getByTestId('gradient').props.colors).toEqual(GRADIENT.fill.colors)
  })
})

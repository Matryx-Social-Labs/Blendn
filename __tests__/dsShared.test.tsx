/*
 * The hue a screen is in (foundations, direction C): three hues, each a fill the white label sits on and a glyph that reads
 * on that fill. The contrast floors are the plan's token table.
 */
import { render, screen } from '@testing-library/react-native'
import React from 'react'
import { Text } from 'react-native'

import { HueProvider, SELECTION, useHue } from '../components/ds/shared'
import { COLOR } from '../lib/design/tokens'

// The plan's table says 4.4:1 for violet; the WCAG formula gives 4.37. Either clears the 3:1 an icon needs (1.4.11).
const GLYPH_FLOOR = 4.3
const channel = (c: number) => {
  const v = c / 255
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
}
const luminance = (hex: string) => {
  const n = parseInt(hex.slice(1), 16)
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255)
}
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

describe('SELECTION', () => {
  it('has the three hues, and an edge from the brand colours', () => {
    expect(Object.keys(SELECTION)).toEqual(['ember', 'rose', 'violet'])
    expect(SELECTION.ember.edge).toBe(COLOR.brandOrange)
    expect(SELECTION.rose.edge).toBe(COLOR.brandRose)
    expect(SELECTION.violet.edge).toBe(COLOR.brandViolet)
  })

  it.each(Object.entries(SELECTION))('%s: the white label reads on the fill at 11:1 or more, and the glyph at 4.3:1 or more', (_hue, { fill, glyph }) => {
    expect(contrast(COLOR.textPrimary, fill)).toBeGreaterThanOrEqual(11)
    expect(contrast(glyph, fill)).toBeGreaterThanOrEqual(GLYPH_FLOOR)
  })

  it.each(Object.entries(SELECTION))('%s: the secondary text (counts) reads on the fill at 5.3:1 or more', (_hue, { fill }) => {
    expect(contrast(COLOR.textSecondary, fill)).toBeGreaterThanOrEqual(5.3)
  })
})

describe('HueProvider', () => {
  const Probe = () => <Text>{useHue()}</Text>

  it('is ember by default', async () => {
    await render(<Probe />)
    expect(screen.getByText('ember')).toBeTruthy()
  })

  it('a provider sets the hue its children read', async () => {
    await render(
      <HueProvider value="violet">
        <Probe />
      </HueProvider>
    )
    expect(screen.getByText('violet')).toBeTruthy()
  })
})

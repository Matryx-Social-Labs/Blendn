/*
 * <CrewEmblem>, ported from the design export (2026-10-15):
 * guidelines/round2/emblem.js (`window.BNE`), DESIGN-BRIEF §21.3. A squircle,
 * 12 palettes × 12 night motifs, seeded from the server's `emblemSeed` only.
 */
import { render, screen } from '@testing-library/react-native'
import { createHash } from 'crypto'
import React from 'react'

import { CrewEmblem, EMBLEM_MOTIFS, EMBLEM_PALETTES, emblemFor, motifMarkup, oklchToHex } from '../components/ds/CrewEmblem'
import { fnv1a } from '../lib/pseudonymAvatar'

const HIDDEN = { includeHiddenElements: true }

describe('the motifs are the design’s, byte for byte', () => {
  it('in the design’s order', () => {
    expect(EMBLEM_MOTIFS).toEqual(['crescent', 'sunburst', 'tiles', 'rings', 'tide', 'stars', 'bolt', 'arch', 'chevrons', 'orbit', 'sparks', 'waves'])
  })

  it('every motif, glyph and field, drawn with the same two paints', () => {
    /*
     * sha256 of JSON.stringify({ '<motif>/<variant>': markup }) from
     * emblem.js's own `BNE.svg(motif * 12, 100, variant)`, run in Node with
     * palette 0's two colours replaced by 'M' (mid) and 'B' (base).
     */
    const markup = Object.fromEntries(
      EMBLEM_MOTIFS.flatMap((m) => (['glyph', 'field'] as const).map((v) => [`${m}/${v}`, motifMarkup(m, v, 'M', 'B')]))
    )
    expect(createHash('sha256').update(JSON.stringify(markup)).digest('hex')).toBe('3b258ee34a041bd056fe4f45f039f007a542ac96f0ee6af5dbdac1e0a6782857')
  })
})

describe('the palettes', () => {
  it('convert OKLCH as CSS does', () => {
    expect(oklchToHex(1, 0, 0)).toBe('#ffffff')
    expect(oklchToHex(0, 0, 0)).toBe('#000000')
    // CSS Color 4's sRGB red.
    expect(oklchToHex(0.627955, 0.257683, 29.2339)).toBe('#ff0000')
  })

  it('are emblem.js’s twelve, oklch(0.34 0.07 h) and oklch(0.66 0.11 h) for h = 20, 50 … 350', () => {
    /*
     * Expected values from CSS Color 4's own path (OKLab → LMS → XYZ D65 →
     * linear sRGB, clipped), computed independently of the converter above.
     */
    expect(EMBLEM_PALETTES.map((p) => [p.base, p.mid])).toEqual([
      ['#572729', '#cd7576'],
      ['#542c13', '#c87d52'],
      ['#4b3301', '#b58a3a'],
      ['#3a3b05', '#969841'],
      ['#23411c', '#6da361'],
      ['#004332', '#3ba888'],
      ['#004246', '#10a6ad'],
      ['#003e55', '#3a9ec8'],
      ['#22385c', '#6a93d5'],
      ['#383159', '#9186d1'],
      ['#482b4e', '#b07bbc'],
      ['#52273d', '#c4759c'],
    ])
  })
})

describe('emblemFor', () => {
  it('reads the server’s string seed through FNV-1a: palette = n mod 12, motif = ⌊n / 12⌋ mod 12', () => {
    const n = Math.abs(fnv1a('crew-7f3a'))
    expect(emblemFor('crew-7f3a')).toEqual({ palette: n % 12, motif: EMBLEM_MOTIFS[Math.floor(n / 12) % 12] })
  })

  it('is stable for a seed and spreads across seeds', () => {
    expect(emblemFor('nebula')).toEqual(emblemFor('nebula'))
    const seen = new Set(Array.from({ length: 300 }, (_, i) => JSON.stringify(emblemFor(`seed-${i}`))))
    expect(seen.size).toBeGreaterThan(100)
  })
})

describe('<CrewEmblem>', () => {
  it('draws the squircle in the palette’s base, clipped, at its size, and is decorative', async () => {
    await render(<CrewEmblem seed="nebula" size={56} testID="e" />)
    const root = screen.getByTestId('e', HIDDEN)
    expect(root.props.style).toEqual(expect.objectContaining({ width: 56, height: 56 }))
    expect(root.props.accessibilityElementsHidden).toBe(true)
    expect(root.props.importantForAccessibility).toBe('no-hide-descendants')
  })

  it('field by default; glyph on request (one centred shape)', async () => {
    await render(<CrewEmblem seed="nebula" size={40} testID="e" />)
    const field = screen.getByTestId('e-xml', HIDDEN).props.xml as string
    await render(<CrewEmblem seed="nebula" size={40} variant="glyph" testID="e" />)
    const glyph = screen.getByTestId('e-xml', HIDDEN).props.xml as string
    const { palette, motif } = emblemFor('nebula')
    const { base, mid } = EMBLEM_PALETTES[palette]
    expect(field).toContain(motifMarkup(motif, 'field', mid, base))
    expect(glyph).toContain(motifMarkup(motif, 'glyph', mid, base))
    expect(field).toContain(`fill="${base}"`)
  })

  it('never carries text, a creature or the brand gradient', async () => {
    await render(<CrewEmblem seed="orbit" size={160} testID="e" />)
    const xml = screen.getByTestId('e-xml', HIDDEN).props.xml as string
    expect(xml).not.toMatch(/<text|Gradient/i)
  })
})

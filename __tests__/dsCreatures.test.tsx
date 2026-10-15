/*
 * The creature marks and the venue plates, ported from the design export
 * (2026-10-15): guidelines/creatures/creatures.js (`window.BNC`), and
 * guidelines/components/{Creatures,VenuePlates}.html with sets.js.
 */
import { fireEvent, render, screen } from '@testing-library/react-native'
import { createHash } from 'crypto'
import React from 'react'
import { processColor, StyleSheet } from 'react-native'

import {
  Creature,
  CREATURE_CAST,
  CREATURE_GLYPHS,
  CREATURE_NOUNS,
  creatureFor,
  type CreatureGlyph,
} from '../components/ds/Creature'
import DsCreaturesPreview from '../app/preview/ds-creatures'
import { VENUE_PLATE_GLYPHS, VenuePlate } from '../components/ds/VenuePlate'
import { Icon } from '../components/ui/Icon'
import { CREATURE_PALETTES, PALETTE_GLYPH, VENUE_PLATES } from '../lib/design/tokens'
import { pseudonymAvatar } from '../lib/pseudonymAvatar'

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))

type Node = { type: string; props: Record<string, unknown>; children: Node[] | null }
const all = (n: Node | Node[] | null, type: string): Node[] =>
  !n ? [] : Array.isArray(n) ? n.flatMap((c) => all(c, type)) : [...(n.type === type ? [n] : []), ...all(n.children, type)]
const tree = () => screen.toJSON() as unknown as Node
// Both are decorative, so a query has to ask for what the screen reader skips.
const HIDDEN = { includeHiddenElements: true }
const paint = (colour: string) => ({ type: 0, payload: processColor(colour) })

describe('the creature set is the design’s, byte for byte', () => {
  // sha256 of JSON.stringify(window.BNC.G / .NOUN / .CAST) from creatures.js.
  const sha = (o: unknown) => createHash('sha256').update(JSON.stringify(o)).digest('hex')

  it('the glyph paths', () => {
    expect(sha(CREATURE_GLYPHS)).toBe('39b545c9c4c42368a6e6fdfc5998a5501cb98ac77804a7bf096ed228d3e50677')
  })
  it('the noun map', () => {
    expect(sha(CREATURE_NOUNS)).toBe('cd7533d52dfda405ee8ba7d9ffe564b8efd8dcc2b3051e4907de2cf97257d8a0')
  })
  it('the 16-glyph cast, in the client’s order', () => {
    expect(sha(CREATURE_CAST)).toBe('ac29dae4f11cada968d1fccb8c543c5b2f4bd02813b93ea42e27e3ac650d576c')
  })
})

/*
 * Animal names: expected values from the design's own code, run in Node over
 * creatures.js — `BNC.glyph(noun)`, where `noun` is the client's `nounOf`
 * (the design's prototype reads the last space-separated word, which would
 * draw "Cosmic Panda 2", a collision suffix, as a hashed creature).
 *
 * Everything else — a last word that is not an animal, or no noun at all —
 * deviates from creatures.js on purpose (owner's ruling on #384): not the
 * design's hash of the noun, which makes every "… Comet" one creature, but
 * today's pick from the whole trimmed pseudonym (`pseudonymAvatar`'s second
 * mix), so "Cosmic Comet" and "Velvet Comet" differ. Those rows are derived
 * from that rule, and the test below holds them to `pseudonymAvatar` itself.
 *
 * The palette is |FNV-1a(seed)| % 8 throughout ("the pseudonym picks the
 * palette"), today's hue index. `seed` is what `pseudonymAvatar` takes: the
 * pseudonym trimmed, 'anonymous' when empty.
 */
const ANIMALS: [seed: string, glyph: CreatureGlyph, palette: number][] = [
  ['Cosmic Panda', 'panda', 5],
  ['Velvet Heron', 'bird', 1],
  ['Neon Dragon', 'snake', 0],
  ['Quiet Fox', 'fox', 6],
  ['Midnight Coyote', 'coyote', 2],
  ['Lucky Jaguar', 'panther', 5],
  ['Wild Mustang', 'horse', 6],
  ['Hidden Kraken', 'octopus', 1],
  ['Swift Cheetah', 'cheetah', 6],
  ['Brave Toucan', 'toucan', 1],
  // A glyph's own name draws it, mapped or not.
  ['Golden Whale', 'whale', 1],
  ['Silver Hedgehog', 'hedgehog', 5],
  ['Cosmic Panda 2', 'panda', 1],
  ['COSMIC PANDA', 'panda', 5],
  ['  Cosmic Panda  ', 'panda', 5],
]
const NOT_ANIMALS: [seed: string, glyph: CreatureGlyph, palette: number][] = [
  ['Cosmic Comet', 'parrot', 1],
  ['Velvet Comet', 'dolphin', 3],
  ['Stellar Nebula', 'lion', 5],
  ['Blazing Phoenix', 'pufferfish', 7],
  ['Brave Titan', 'fox', 1],
  ['Misty Mantis', 'fox', 1],
  ['Noble Sphinx', 'owl', 3],
  ['Dusk Meadow', 'butterfly', 7],
  // `markSeed`'s fallbacks and placeholders: no noun.
  ['room-1:user-9', 'koala', 5],
  ['you', 'flamingo', 4],
  ['', 'wolf', 6],
  ['anonymous', 'wolf', 6],
  ['Café', 'unicorn', 4],
]

/** `pseudonymAvatar`'s cast, as emoji, in the order `CREATURE_CAST` draws it. */
const TODAY = ['🦊', '🐼', '🦉', '🐙', '🦁', '🐝', '🦋', '🐢', '🦜', '🐺', '🐬', '🦩', '🐨', '🦄', '🐡', '🦔']

describe('creatureFor: one seed, one creature on one palette', () => {
  it.each([...ANIMALS, ...NOT_ANIMALS])('%j draws %s on palette %i', (seed, glyph, palette) => {
    expect(creatureFor(seed)).toEqual({ glyph, palette })
    expect(creatureFor(seed)).toEqual(creatureFor(seed))
  })

  it.each(NOT_ANIMALS.map(([seed]) => seed))('%j: not an animal, so the creature it draws today', (seed) => {
    expect(TODAY[CREATURE_CAST.indexOf(creatureFor(seed).glyph)]).toBe(pseudonymAvatar(seed).character)
  })

  it('tells two people with the same non-animal noun apart', () => {
    expect(creatureFor('Cosmic Comet').glyph).not.toBe(creatureFor('Velvet Comet').glyph)
  })

  it('draws every mapped noun as its own creature', () => {
    for (const [noun, glyph] of Object.entries(CREATURE_NOUNS)) {
      expect(creatureFor(`Velvet ${noun[0].toUpperCase()}${noun.slice(1)}`).glyph).toBe(glyph)
    }
  })

  it('does not take a noun that names an Object.prototype key for an animal', () => {
    // The design's `G[k] ? k` takes "constructor" for a glyph; there is no such path.
    expect(CREATURE_CAST).toContain(creatureFor('Brave Constructor').glyph)
  })
})

describe('<Creature>', () => {
  it.each(Object.keys(CREATURE_GLYPHS) as CreatureGlyph[])('draws %s, white, 1.5 at 24, round', async (glyph) => {
    await render(<Creature glyph={glyph} palette={0} />)
    const [, path] = all(tree(), 'RNSVGPath')
    expect(path.props).toMatchObject({
      d: CREATURE_GLYPHS[glyph],
      stroke: paint(PALETTE_GLYPH.creature),
      strokeWidth: 1.5,
      fill: null,
    })
  })

  it.each(CREATURE_PALETTES.map((pair, i) => [i, pair] as const))('palette %i is the token pair %j', async (palette, [a, b]) => {
    await render(<Creature glyph="fox" palette={palette} />)
    expect(all(tree(), 'RNSVGCircle')[0].props.fill).toEqual(paint(a))
    expect(all(tree(), 'RNSVGPath')[0].props.fill).toEqual(paint(b))
  })

  it('puts the glyph at 50% of the disc, at any size', async () => {
    await render(<Creature glyph="owl" palette={2} size={112} />)
    const svg = all(tree(), 'RNSVGSvgView')[0]
    // The glyph's 24 box, centred in a 48 box: half the disc.
    expect(svg.props).toMatchObject({ width: 112, height: 112, vbWidth: 48, vbHeight: 48 })
    expect(all(tree(), 'RNSVGPath')[1].props.matrix).toEqual([1, 0, 0, 1, 12, 12])
  })

  it('splits the disc at 135°: the second colour is the lower-right half', async () => {
    await render(<Creature glyph="owl" palette={2} />)
    const [cos, sin] = all(tree(), 'RNSVGPath')[0].props.matrix as number[]
    expect(cos).toBeCloseTo(Math.SQRT1_2)
    expect(sin).toBeCloseTo(-Math.SQRT1_2)
  })

  it('draws the 2pt ring only when asked', async () => {
    await render(<Creature glyph="bird" palette={0} />)
    expect(screen.queryByTestId('creature-ring', HIDDEN)).toBeNull()
    await render(<Creature glyph="bird" palette={0} ring="#0D0C0C" />)
    expect(StyleSheet.flatten(screen.getByTestId('creature-ring', HIDDEN).props.style)).toMatchObject({ borderColor: '#0D0C0C', borderWidth: 2 })
  })

  it('is decorative: the pseudonym beside it is the label', async () => {
    await render(<Creature glyph="panda" palette={1} />)
    expect(tree().props).toMatchObject({ accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' })
  })
})

describe('<VenuePlate>', () => {
  it('draws each type with the design’s glyph', () => {
    // sets.js PLATES, the third field.
    expect(VENUE_PLATE_GLYPHS).toEqual({
      brewery: 'beer',
      gardenBar: 'tree-palm',
      bar: 'wine',
      club: 'disc-3',
      liveMusic: 'music-2',
      cafe: 'coffee',
    })
  })

  const glyphOf = async (type: string, size?: number) => {
    await render(<VenuePlate type={type} size={size} />)
    return JSON.stringify(all(tree(), 'RNSVGSvgView').at(-1))
  }
  const icon = async (name: Parameters<typeof Icon>[0]['name'], size: number) => {
    await render(<Icon name={name} size={size} color={PALETTE_GLYPH.plate} />)
    return JSON.stringify(tree())
  }

  it.each(Object.keys(VENUE_PLATES) as (keyof typeof VENUE_PLATES)[])('%s: the token pair, its glyph at 40%, 70% white', async (type) => {
    const [a, b] = VENUE_PLATES[type]
    await render(<VenuePlate type={type} size={120} />)
    expect(StyleSheet.flatten(tree().props.style as object)).toMatchObject({ width: 120, height: 120, borderRadius: 24, backgroundColor: a })
    expect(all(tree(), 'RNSVGRect')[0].props.fill).toEqual(paint(b))
    expect(await glyphOf(type, 120)).toBe(await icon(VENUE_PLATE_GLYPHS[type], 48))
  })

  it('takes a row thumb’s radius when given one', async () => {
    await render(<VenuePlate type="brewery" size={56} radius={8} />)
    expect(StyleSheet.flatten(tree().props.style as object)).toMatchObject({ width: 56, borderRadius: 8 })
    expect(await glyphOf('brewery', 56)).toBe(await icon('beer', 22))
  })

  it('draws a type it does not know as a bar', async () => {
    expect(await glyphOf('nightclub', 120)).toBe(await glyphOf('bar', 120))
    await render(<VenuePlate type="nightclub" size={120} />)
    expect(StyleSheet.flatten(tree().props.style as object)).toMatchObject({ backgroundColor: VENUE_PLATES.bar[0] })
  })

  it('fills its parent with no size, splitting at 135° through the centre of the box it gets', async () => {
    await render(<VenuePlate type="liveMusic" />)
    expect(StyleSheet.flatten(tree().props.style as object)).toMatchObject({ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 0 })
    await fireEvent(screen.getByTestId('venue-plate', HIDDEN), 'layout', { nativeEvent: { layout: { width: 402, height: 220 } } })
    const rect = all(tree(), 'RNSVGRect')[0]
    // A half-plane right of the centre, turned 45° about it: x + y > (w + h) / 2, as CSS draws 135deg.
    expect(rect.props).toMatchObject({ x: 201 })
    const [cos, sin, , , e, f] = rect.props.matrix as number[]
    expect(cos).toBeCloseTo(Math.SQRT1_2)
    expect(sin).toBeCloseTo(Math.SQRT1_2)
    expect(201 * cos - 110 * sin + e).toBeCloseTo(201)
    expect(201 * sin + 110 * cos + f).toBeCloseTo(110)
    expect(await glyphOf('liveMusic')).toBe(await icon('music-2', 48))
  })

  it('is decorative: the venue’s name and type are the label', async () => {
    await render(<VenuePlate type="cafe" size={56} />)
    expect(tree().props).toMatchObject({ accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' })
  })
})

describe('the gallery, app/preview/ds-creatures', () => {
  it('shows every creature on every palette, and every plate', async () => {
    await render(<DsCreaturesPreview />)
    for (const glyph of Object.keys(CREATURE_GLYPHS)) {
      screen.getByTestId(`creature-${glyph}`)
      CREATURE_PALETTES.forEach((_, palette) => screen.getByTestId(`creature-${glyph}-${palette}`))
    }
    for (const type of Object.keys(VENUE_PLATES)) screen.getByTestId(`venue-plate-${type}`)
  })
})

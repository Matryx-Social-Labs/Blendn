/*
 * <Avatar> (guidelines/components/Avatar.html): photo, creature and crew square
 * from 24 to 112, the cut-out ring, Increase Contrast's white ring, and the
 * name read rather than the picture.
 */
import { act, render, screen } from '@testing-library/react-native'
import React from 'react'
import { AccessibilityInfo, processColor, StyleSheet, Text } from 'react-native'

import { Avatar } from '../components/ds/Avatar'
import { COLOR, CREATURE_PALETTES, MATERIAL, RADIUS } from '../lib/design/tokens'

const flat = (id: string) => StyleSheet.flatten(screen.getByTestId(id, { includeHiddenElements: true }).props.style)
const creature = (size: number) => <Text>{`creature ${size}`}</Text>

describe('<Avatar>', () => {
  it.each([24, 32, 40, 56, 72, 112] as const)('a creature at %i pt: a circle, the glyph at half the disc', async (size) => {
    await render(<Avatar kind="creature" palette={1} glyph={creature} size={size} testID="a" />)
    expect(flat('a-body')).toMatchObject({ width: size, height: size, borderRadius: RADIUS.capsule })
    expect(screen.getByText(`creature ${Math.round(size / 2)}`, { includeHiddenElements: true })).toBeTruthy()
  })

  it('draws the creature on its two-colour plate, from the eight palettes', async () => {
    await render(<Avatar kind="creature" palette={9} glyph={creature} size={56} testID="a" />)
    // react-native-svg hands the native side `{ type, payload }` with the processed colour.
    const fills = screen.getAllByTestId('a-plate', { includeHiddenElements: true }).map((p) => p.props.fill.payload)
    expect(fills).toEqual(CREATURE_PALETTES[1].map((c) => processColor(c)))
  })

  it('a crew is a square with 30% corners', async () => {
    await render(<Avatar kind="crew" plate={CREATURE_PALETTES[0]} size={56} testID="a" />)
    expect(flat('a-body').borderRadius).toBe(Math.round(56 * 0.3))
  })

  it('is decorative beside a name; alone, it reads the name, a crew adds “crew”, never “image”', async () => {
    await render(<Avatar kind="creature" palette={0} glyph={creature} size={32} testID="a" />)
    expect(screen.queryByTestId('a')).toBeNull()

    await render(<Avatar kind="creature" palette={0} glyph={creature} size={32} label="Night Cat" testID="a" />)
    expect(screen.getByLabelText('Night Cat').props.accessibilityRole).toBeUndefined()

    await render(<Avatar kind="crew" plate={CREATURE_PALETTES[0]} size={32} label="Vinyl Club" testID="a" />)
    expect(screen.getByLabelText('Vinyl Club, crew')).toBeTruthy()
  })

  it('draws a 2 pt cut-out ring in the colour behind it', async () => {
    await render(<Avatar kind="photo" uri="https://x/y.jpg" size={32} ring={COLOR.ink} testID="a" />)
    expect(flat('a-ring')).toMatchObject({ backgroundColor: COLOR.ink, top: -2, borderRadius: RADIUS.capsule })
  })

  it('Increase Contrast rings it in 50% white so a dark plate leaves a dark card', async () => {
    jest.spyOn(AccessibilityInfo, 'isDarkerSystemColorsEnabled').mockResolvedValue(true)
    await render(<Avatar kind="creature" palette={0} glyph={creature} size={56} testID="a" />)
    await act(async () => {})
    expect(flat('a-ring').backgroundColor).toBe(MATERIAL.hairlineIncreaseContrast)
  })
})

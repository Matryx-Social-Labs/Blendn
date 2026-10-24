/*
 * <AmenityTile> and <AmenityGrid> (guidelines/components/AmenityTile.html):
 * the 76 pt surface tile with a Geist Mono label and one value (mono for
 * numbers and times), 2-up with 12 pt gutters, one alone full width, 7+ folded
 * behind a "+N more" tile. A fact, so no haptic.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import React from 'react'
import { AccessibilityInfo, Dimensions, StyleSheet } from 'react-native'

import { AmenityGrid, AmenityTile } from '../components/ds/AmenityTile'
import { COLOR, FONT_FAMILY, MATERIAL, RADIUS, SPACE, TYPE } from '../lib/design/tokens'
import { H } from '../lib/haptics'

// The jest preset starts at fontScale 2, an accessibility size (AX_FONT_SCALE): these tests are the default size's layout.
// The accessibility sizes are __tests__/axTextSize.test.tsx's.
const defaultWindow = Dimensions.get('window')
beforeEach(() => Dimensions.set({ window: { ...defaultWindow, fontScale: 1 }, screen: { ...defaultWindow, fontScale: 1 } }))
afterAll(() => Dimensions.set({ window: defaultWindow, screen: defaultWindow }))

const flat = (id: string) => StyleSheet.flatten(screen.getByTestId(id, { includeHiddenElements: true }).props.style)
const style = (t: string) => StyleSheet.flatten(screen.getByText(t, { includeHiddenElements: true }).props.style)

describe('<AmenityTile>', () => {
  it('is a 76 pt surface tile at radius 16; the label is Geist Mono 500 in textTertiary', async () => {
    await render(<AmenityTile label="DOORS" value="8:30 PM" mono testID="t" />)
    expect(flat('t')).toMatchObject({ minHeight: 76, borderRadius: RADIUS.rowInCard, backgroundColor: COLOR.surface })
    expect(style('DOORS')).toMatchObject({ fontFamily: FONT_FAMILY.mono[500], fontSize: TYPE.label.fontSize, color: COLOR.textTertiary })
  })

  it('numbers and times are Geist Mono, tabular; words are Satoshi 500 on one line', async () => {
    await render(<AmenityTile label="GOING" value="42" mono />)
    expect(style('42')).toMatchObject({ fontFamily: FONT_FAMILY.mono[500], fontSize: TYPE.bodyStrong.fontSize, fontVariant: ['tabular-nums'], color: COLOR.textPrimary })
    await render(<AmenityTile label="WHERE" value="The Very Long Festival Grounds, Whitefield" />)
    const words = screen.getByText('The Very Long Festival Grounds, Whitefield', { includeHiddenElements: true })
    expect(StyleSheet.flatten(words.props.style).fontFamily).toBe(TYPE.bodyStrong.fontFamily)
    expect(words.props.numberOfLines).toBe(1)
  })

  it('reads "{label}, {value}" as text; a tile that pushes is a button, silent', async () => {
    const haptics = Object.keys(H).map((k) => jest.spyOn(H, k as keyof typeof H).mockImplementation(() => {}))
    await render(<AmenityTile label="DOORS" value="8:30 PM" mono />)
    expect(screen.getByLabelText('DOORS, 8:30 PM')).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
    const onPress = jest.fn()
    await render(<AmenityTile label="WHERE" value="Toit, Indiranagar" onPress={onPress} />)
    await fireEvent.press(screen.getByRole('button', { name: 'WHERE, Toit, Indiranagar' }))
    expect(onPress).toHaveBeenCalledTimes(1)
    for (const spy of haptics) expect(spy).not.toHaveBeenCalled()
  })

  it('draws an icon beside the label', async () => {
    await render(<AmenityTile label="OUTDOOR SEATING" value="Yes" icon="tree-palm" testID="t" />)
    expect(screen.getByTestId('t-icon', { includeHiddenElements: true })).toBeTruthy()
  })

  it('Increase Contrast: the label goes white and the tile takes the 50% hairline', async () => {
    jest.spyOn(AccessibilityInfo, 'isDarkerSystemColorsEnabled').mockResolvedValue(true)
    await render(<AmenityTile label="DOORS" value="8:30 PM" mono testID="t" />)
    await act(async () => {})
    expect(flat('t')).toMatchObject({ borderWidth: 1, borderColor: MATERIAL.hairlineIncreaseContrast })
    expect(style('DOORS').color).toBe(COLOR.textPrimary)
  })
})

describe('<AmenityGrid>', () => {
  const tiles = (n: number) => Array.from({ length: n }, (_, i) => ({ label: 'HERE TONIGHT', value: `Amenity ${i + 1}` }))

  it('2-up with 12 pt gutters; a lone tile takes the full width', async () => {
    await render(<AmenityGrid tiles={tiles(3)} testID="g" />)
    expect(flat('g')).toMatchObject({ flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.md })
    expect(flat('g-0')).toMatchObject({ flexGrow: 1, flexBasis: '40%' })
  })

  it('six show; seven or more fold behind “+N more”, which expands', async () => {
    await render(<AmenityGrid tiles={tiles(6)} />)
    expect(screen.getByText('Amenity 6')).toBeTruthy()
    expect(screen.queryByText(/more$/)).toBeNull()

    await render(<AmenityGrid tiles={tiles(8)} />)
    expect(screen.getByText('Amenity 5')).toBeTruthy()
    expect(screen.queryByText('Amenity 6')).toBeNull()
    await fireEvent.press(screen.getByRole('button', { name: 'MORE, +3' }))
    expect(screen.getByText('Amenity 8')).toBeTruthy()
  })

  it('the fold says "more" once: the label MORE over the count "+3" in Geist Mono (B-S13)', async () => {
    await render(<AmenityGrid tiles={tiles(8)} testID="g" />)
    expect(screen.getByText('MORE')).toBeTruthy()
    const count = screen.getByText('+3')
    expect(StyleSheet.flatten(count.props.style).fontFamily).toBe(FONT_FAMILY.mono[500])
    expect(screen.queryByText(/more/)).toBeNull()
  })
})

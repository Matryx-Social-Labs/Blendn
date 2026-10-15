/*
 * <NeverForSalePanel> (guidelines/components/NeverForSalePanel.html, Flow 12 ·
 * 12.2): what no plan buys, as plainly as the plans themselves. A surface
 * card, a heading, em-dash lines at body size; a heading and a list.
 */
import { act, render, screen } from '@testing-library/react-native'
import React from 'react'
import { AccessibilityInfo, StyleSheet } from 'react-native'

import { NEVER_FOR_SALE, NeverForSalePanel } from '../components/ds/NeverForSalePanel'
import { COLOR, MATERIAL, RADIUS, TYPE } from '../lib/design/tokens'

const flat = (id: string) => StyleSheet.flatten(screen.getByTestId(id, { includeHiddenElements: true }).props.style)

describe('<NeverForSalePanel>', () => {
  it('is a surface card, radius 24, under a heading', async () => {
    await render(<NeverForSalePanel testID="n" />)
    expect(flat('n')).toMatchObject({ borderRadius: RADIUS.sheet, backgroundColor: COLOR.surface })
    expect(screen.getByRole('header', { name: 'Never for sale, on any plan' })).toBeTruthy()
  })

  it('lists every line at body size; the dash is decoration', async () => {
    await render(<NeverForSalePanel testID="n" />)
    expect(NEVER_FOR_SALE).toContain('Seeing who liked you')
    for (const line of NEVER_FOR_SALE) expect(StyleSheet.flatten(screen.getByText(line).props.style).fontSize).toBe(TYPE.body.fontSize)
    expect(screen.queryByText('—')).toBeNull()
    expect(screen.getByTestId('n-list').props.accessibilityRole).toBe('list')
  })

  it('Increase Contrast: the 50% hairline', async () => {
    jest.spyOn(AccessibilityInfo, 'isDarkerSystemColorsEnabled').mockResolvedValue(true)
    await render(<NeverForSalePanel testID="n" />)
    await act(async () => {})
    expect(flat('n')).toMatchObject({ borderColor: MATERIAL.hairlineIncreaseContrast })
  })
})

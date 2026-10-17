/*
 * <UnreadDivider> and <DayPill> (guidelines/components/UnreadDivider.html):
 * a hairline with NEW in Geist Mono, read as a heading; the 24 pt day pill;
 * Increase Contrast's 50% hairline and white word.
 */
import { act, render, screen } from '@testing-library/react-native'
import React from 'react'
import { AccessibilityInfo, StyleSheet } from 'react-native'

import { DayPill, UnreadDivider } from '../components/ds/UnreadDivider'
import { COLOR, FONT_FAMILY, MATERIAL, SPACE } from '../lib/design/tokens'

const flat = (id: string) => StyleSheet.flatten(screen.getByTestId(id, { includeHiddenElements: true }).props.style)

describe('<UnreadDivider>', () => {
  it('draws NEW in Geist Mono between two hairlines, read as “New messages”', async () => {
    await render(<UnreadDivider testID="u" />)
    const word = StyleSheet.flatten(screen.getByText('NEW').props.style)
    expect(word.fontFamily).toBe(FONT_FAMILY.mono[500])
    expect(word.color).toBe(COLOR.textSecondary)
    expect(flat('u-line').backgroundColor).toBe(COLOR.hairlineStrong)
    expect(screen.getByRole('header', { name: 'New messages' })).toBeTruthy()
  })

  it('a count: “3 NEW”, read as “3 new messages”', async () => {
    await render(<UnreadDivider count={3} />)
    expect(screen.getByText('3 NEW')).toBeTruthy()
    expect(screen.getByRole('header', { name: '3 new messages' })).toBeTruthy()
  })

  it('Increase Contrast: the hairline at 50%, the word white', async () => {
    jest.spyOn(AccessibilityInfo, 'isDarkerSystemColorsEnabled').mockResolvedValue(true)
    await render(<UnreadDivider testID="u" />)
    await act(async () => {})
    expect(flat('u-line').backgroundColor).toBe(MATERIAL.hairlineIncreaseContrast)
    expect(StyleSheet.flatten(screen.getByText('NEW').props.style).color).toBe(COLOR.textPrimary)
  })
})

describe('<DayPill>', () => {
  it('a 24 pt surface capsule, a heading, its text capped at 1.3×', async () => {
    await render(<DayPill text="Today" testID="d" />)
    expect(flat('d')).toMatchObject({ height: SPACE.xl, backgroundColor: COLOR.surface })
    expect(screen.getByRole('header', { name: 'Today' })).toBeTruthy()
    expect(screen.getByText('Today').props.maxFontSizeMultiplier).toBe(1.3)
  })
})

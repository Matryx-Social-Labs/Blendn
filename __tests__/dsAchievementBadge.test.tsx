/*
 * <AchievementBadge> (guidelines/components/AchievementBadge.html, Flow 14 ·
 * 14.5, ROUND3 G4): a 28 pt 8%-white pill with a glyph, earned from check-ins.
 * A tier, never a count: the crew badge reads "Out together often" whatever
 * number the server's label carries.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import React from 'react'
import { AccessibilityInfo, StyleSheet } from 'react-native'

import { AchievementBadge } from '../components/ds/AchievementBadge'
import { COLOR, MATERIAL, RADIUS } from '../lib/design/tokens'
import { H } from '../lib/haptics'

const flat = (id: string) => StyleSheet.flatten(screen.getByTestId(id, { includeHiddenElements: true }).props.style)

describe('<AchievementBadge>', () => {
  it.each([
    ['shows_up', 'Shows up'],
    ['nights_out', '5+ nights this month'],
    ['regular_here', 'Regular here'],
    ['nights_together', 'Out together often'],
  ] as const)('%s reads “%s”', async (kind, label) => {
    await render(<AchievementBadge kind={kind} testID="b" />)
    expect(screen.getByLabelText(`Badge: ${label}`)).toBeTruthy()
    expect(screen.getByText(label, { includeHiddenElements: true })).toBeTruthy()
  })

  it('is a 28 pt capsule of 8% white with the 0.5 pt hairline, its words capped at 1.3×', async () => {
    await render(<AchievementBadge kind="shows_up" testID="b" />)
    expect(flat('b')).toMatchObject({
      height: 28,
      borderRadius: RADIUS.capsule,
      backgroundColor: MATERIAL.fillOnGlass,
      borderWidth: 0.5,
      borderColor: COLOR.hairlineStrong,
    })
    expect(screen.getByText('Shows up', { includeHiddenElements: true }).props.maxFontSizeMultiplier).toBe(1.3)
  })

  it('the crew badge is a tier: never the server’s count', async () => {
    await render(<AchievementBadge kind="nights_together" testID="b" />)
    expect(screen.queryByText(/\d/, { includeHiddenElements: true })).toBeNull()
  })

  it('on Me a tap shows what it means: a button, silent', async () => {
    const onPress = jest.fn()
    await render(<AchievementBadge kind="shows_up" onPress={onPress} />)
    await fireEvent.press(screen.getByRole('button', { name: 'Badge: Shows up' }))
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('plays nothing', async () => {
    const spies = Object.keys(H).map((k) => jest.spyOn(H, k as keyof typeof H).mockImplementation(() => {}))
    await render(<AchievementBadge kind="regular_here" />)
    for (const s of spies) expect(s).not.toHaveBeenCalled()
  })

  it('Increase Contrast: the hairline goes to 1 pt at 50%', async () => {
    jest.spyOn(AccessibilityInfo, 'isDarkerSystemColorsEnabled').mockResolvedValue(true)
    await render(<AchievementBadge kind="shows_up" testID="b" />)
    await act(async () => {})
    expect(flat('b')).toMatchObject({ borderWidth: 1, borderColor: MATERIAL.hairlineIncreaseContrast })
  })
})

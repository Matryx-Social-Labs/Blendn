/*
 * <SystemNotice> and <SystemLine> (guidelines/components/SystemNotice.html):
 * the thin centred line in textTertiary; the solid card with a glyph, one
 * sentence and at most one text action; warn on the warning tint; no haptic.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import React from 'react'
import { AccessibilityInfo, StyleSheet } from 'react-native'

import { SystemLine, SystemNotice } from '../components/ds/SystemNotice'
import { COLOR, MATERIAL } from '../lib/design/tokens'
import { H } from '../lib/haptics'

const flat = (id: string) => StyleSheet.flatten(screen.getByTestId(id).props.style)

describe('<SystemLine>', () => {
  it('one centred sentence in textTertiary', async () => {
    await render(<SystemLine text="Quiet Heron joined" />)
    expect(StyleSheet.flatten(screen.getByText('Quiet Heron joined').props.style)).toMatchObject({
      color: COLOR.textTertiary,
      textAlign: 'center',
    })
  })
})

describe('<SystemNotice>', () => {
  it('info: a surface card; the action is a button, and nothing plays', async () => {
    const spies = Object.keys(H).map((k) => jest.spyOn(H, k as keyof typeof H).mockImplementation(() => {}))
    const onPress = jest.fn()
    await render(
      <SystemNotice
        icon="shield"
        text="This room is anonymous. Be kind, keep it safe — people here are real."
        action={{ label: 'Community guidelines', onPress }}
        testID="n"
      />
    )
    expect(flat('n').backgroundColor).toBe(COLOR.surface)
    await fireEvent.press(screen.getByRole('button', { name: 'Community guidelines' }))
    expect(onPress).toHaveBeenCalledTimes(1)
    for (const spy of spies) expect(spy).not.toHaveBeenCalled()
  })

  it('warn: on the warning tint', async () => {
    await render(<SystemNotice kind="warn" icon="triangle-alert" text="A message here was taken down." testID="n" />)
    expect(flat('n').backgroundColor).toBe(COLOR.warningTint)
  })

  it('Increase Contrast: the 50% hairline', async () => {
    jest.spyOn(AccessibilityInfo, 'isDarkerSystemColorsEnabled').mockResolvedValue(true)
    await render(<SystemNotice text="You’ve been muted." testID="n" />)
    await act(async () => {})
    expect(flat('n').borderColor).toBe(MATERIAL.hairlineIncreaseContrast)
  })
})

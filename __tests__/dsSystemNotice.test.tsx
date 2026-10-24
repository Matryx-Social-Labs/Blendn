/*
 * <SystemNotice> and <SystemLine> (guidelines/components/SystemNotice.html):
 * the thin centred line in textTertiary; the solid card with a glyph, one
 * sentence and at most one text action; warn on the warning tint; no haptic.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import React from 'react'
import { AccessibilityInfo, Dimensions, StyleSheet, View } from 'react-native'

import { SystemLine, SystemNotice } from '../components/ds/SystemNotice'
import { CONTROL_FONT_CAP } from '../components/ds/shared'
import { COLOR, MATERIAL, MAX_FONT_SCALE } from '../lib/design/tokens'
import { H } from '../lib/haptics'
import { AX_XXXL, uncapped } from './helpers/ax'

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

  it('warn: on the warning tint, and read as a warning (never the tint alone)', async () => {
    await render(<SystemNotice kind="warn" text="A message here was taken down." testID="n" />)
    expect(flat('n').backgroundColor).toBe(COLOR.warningTint)
    expect(screen.getByLabelText('Warning: A message here was taken down.')).toBeTruthy()
  })

  it('Increase Contrast: the 50% hairline', async () => {
    jest.spyOn(AccessibilityInfo, 'isDarkerSystemColorsEnabled').mockResolvedValue(true)
    await render(<SystemNotice text="You’ve been muted." testID="n" />)
    await act(async () => {})
    expect(flat('n').borderColor).toBe(MATERIAL.hairlineIncreaseContrast)
  })
})

describe('at AX XXXL (DS-22 sweep: SystemLine had no cap)', () => {
  it('the line, the notice and its action stop at their caps', async () => {
    const window = Dimensions.get('window')
    try {
      await act(async () => Dimensions.set({ window: { ...window, fontScale: AX_XXXL }, screen: { ...window, fontScale: AX_XXXL } }))
      await render(
        <View>
          <SystemLine text="The organiser locked the room" />
          <SystemNotice text="Messages here are moderated." kind="warn" action={{ label: 'Read the guidelines', onPress: jest.fn() }} />
        </View>
      )
      expect(screen.getByText('The organiser locked the room').props.maxFontSizeMultiplier).toBe(MAX_FONT_SCALE.meta)
      expect(screen.getByText('Read the guidelines').props.maxFontSizeMultiplier).toBe(CONTROL_FONT_CAP)
      expect(uncapped(screen.toJSON())).toEqual([])
    } finally {
      Dimensions.set({ window, screen: window })
    }
  })
})

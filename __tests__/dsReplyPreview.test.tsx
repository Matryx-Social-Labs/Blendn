/*
 * <ReplyPreview> (guidelines/components/ReplyPreview.html): the quote in a
 * bubble (a textTertiary rule, who, one line of what) and above the composer
 * (a white rule, "Replying to …", × "Cancel reply"); silent.
 */
import { fireEvent, render, screen } from '@testing-library/react-native'
import React from 'react'
import { StyleSheet } from 'react-native'

import { ReplyPreview } from '../components/ds/ReplyPreview'
import { COLOR } from '../lib/design/tokens'
import { H } from '../lib/haptics'

jest.mock('react-native-reanimated', () => {
  const actual = jest.requireActual('react-native-reanimated')
  return { ...actual, __esModule: true, useReducedMotion: jest.fn(() => false) }
})

const flat = (id: string) => StyleSheet.flatten(screen.getByTestId(id).props.style)
const QUOTE = 'Anyone else here for the B-side argument? Because I have opinions and nowhere to put them.'

describe('<ReplyPreview> in a bubble', () => {
  it('a 2 pt textTertiary rule, the name and one truncated line', async () => {
    await render(<ReplyPreview name="Cosmic Panda" text={QUOTE} testID="q" />)
    expect(flat('q')).toMatchObject({ borderLeftWidth: 2, borderLeftColor: COLOR.textTertiary })
    expect(screen.getByText('Cosmic Panda')).toBeTruthy()
    expect(screen.getByText(QUOTE).props.numberOfLines).toBe(1)
  })

  it('tapping it shows the original, when the screen can', async () => {
    const onPress = jest.fn()
    await render(<ReplyPreview name="Cosmic Panda" text="Rumours side two." onPress={onPress} />)
    await fireEvent.press(screen.getByRole('button', { name: 'Replying to Cosmic Panda: Rumours side two.' }))
    expect(onPress).toHaveBeenCalledTimes(1)
  })
})

describe('<ReplyPreview> above the composer', () => {
  it('a white rule, “Replying to …”, and × that cancels silently', async () => {
    const spies = Object.keys(H).map((k) => jest.spyOn(H, k as keyof typeof H).mockImplementation(() => {}))
    const onCancel = jest.fn()
    await render(<ReplyPreview name="Cosmic Panda" text={QUOTE} onCancel={onCancel} testID="q" />)
    expect(flat('q-rule').backgroundColor).toBe(COLOR.textPrimary)
    expect(screen.getByText('Replying to Cosmic Panda')).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: 'Cancel reply' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
    for (const spy of spies) expect(spy).not.toHaveBeenCalled()
  })
})

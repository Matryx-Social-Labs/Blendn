/*
 * <ReceiptMark> (guidelines/components/ReceiptMark.html): one check and
 * "Sent", two and "Delivered", two in white and "Read"; read as the word,
 * never the glyph; no haptic.
 */
import { render, screen } from '@testing-library/react-native'
import React from 'react'
import { StyleSheet } from 'react-native'

import { ReceiptMark } from '../components/ds/ReceiptMark'
import { COLOR } from '../lib/design/tokens'
import { H } from '../lib/haptics'

const color = (word: string) => StyleSheet.flatten(screen.getByText(word).props.style).color

describe('<ReceiptMark>', () => {
  it('says the state in a word, in textTertiary until it is read', async () => {
    await render(<ReceiptMark state="sent" />)
    expect(color('Sent')).toBe(COLOR.textTertiary)
    await screen.rerender(<ReceiptMark state="delivered" />)
    expect(color('Delivered')).toBe(COLOR.textTertiary)
    await screen.rerender(<ReceiptMark state="read" />)
    expect(color('Read')).toBe(COLOR.textPrimary)
  })

  it('reads as the word, and plays nothing', async () => {
    const spies = Object.keys(H).map((k) => jest.spyOn(H, k as keyof typeof H).mockImplementation(() => {}))
    await render(<ReceiptMark state="delivered" testID="r" />)
    expect(screen.getByTestId('r').props.accessibilityLabel).toBe('Delivered')
    for (const spy of spies) expect(spy).not.toHaveBeenCalled()
  })
})

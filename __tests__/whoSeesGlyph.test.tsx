/*
 * <WhoSees>: the glyph sits on the sentence's first line at every text size. It was top-aligned at a fixed 16 pt
 * while the meta text grew to its 2x cap, so at the largest size the eye floated above line one (iOS AX drive,
 * About you > Sign sheet, 2026-11-19). The slot is one meta line tall, scaled with the text and capped with it.
 */
import { act, render, screen } from '@testing-library/react-native'
import React from 'react'
import { Dimensions, StyleSheet } from 'react-native'

import { WhoSees } from '../components/profile/WhoSees'
import { MAX_FONT_SCALE, TYPE } from '../lib/design/tokens'

const flat = (id: string) => StyleSheet.flatten(screen.getByTestId(id).props.style)
const window = Dimensions.get('window')
afterEach(async () => act(async () => Dimensions.set({ window })))

describe('<WhoSees> glyph', () => {
  it.each([
    [1, TYPE.meta.lineHeight],
    [MAX_FONT_SCALE.meta, TYPE.meta.lineHeight * MAX_FONT_SCALE.meta],
  ])('at fontScale %s the glyph is centred in a first-line slot %s pt tall', async (fontScale, height) => {
    Dimensions.set({ window: { ...window, fontScale } })
    await render(<WhoSees field="sign" testID="w" />)
    expect(flat('w-glyph')).toMatchObject({ height, justifyContent: 'center' })
  })

  it('control: past the meta cap the slot stops growing with the text it sits beside', async () => {
    Dimensions.set({ window: { ...window, fontScale: 3.1 } })
    await render(<WhoSees field="sign" testID="w" />)
    expect(flat('w-glyph').height).toBe(TYPE.meta.lineHeight * MAX_FONT_SCALE.meta)
  })
})

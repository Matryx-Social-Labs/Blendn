/*
 * Me › Nights out, a night with no cover (RC drive 3, qa.rc.c): the calendar glyph was centred over the whole tile, so a
 * two-line title brought the day ("THU 22 OCT") up through it. The glyph now sits in the room above the words.
 */
import { render, screen } from '@testing-library/react-native'
import React from 'react'
import { StyleSheet } from 'react-native'

import { MemoryTile, MEMORY_HEIGHT } from '../components/profile/MemoryTile'
import { CONTROL_FONT_CAP } from '../components/ds/shared'
import { ICON, SPACE, TYPE } from '../lib/design/tokens'

jest.mock('../lib/apiClient', () => ({ apiClient: {} }))
jest.mock('expo-linear-gradient', () => {
  const { View } = jest.requireActual('react-native')
  return { LinearGradient: (props: object) => <View {...props} /> }
})

const hidden = { includeHiddenElements: true }
const flat = (id: string) => StyleSheet.flatten(screen.getByTestId(id, hidden).props.style)
const tile = (imageUrl: string | null) => (
  <MemoryTile title="QA Scale night 1 at the Hall, a long name" imageUrl={imageUrl} when="THU 22 OCT" onPress={jest.fn()} testID="m" />
)

describe('a Nights out tile with no cover', () => {
  it('puts the glyph in the flow above the words, never over them', async () => {
    await render(tile(null))
    const blank = flat('m-blank')
    expect(blank.position).not.toBe('absolute')
    expect(blank.flex).toBe(1)
    const words = flat('m-words')
    expect(words.position).not.toBe('absolute')
    // Before the words in the tile's column: above them.
    const order = JSON.stringify(screen.toJSON())
    expect(order.indexOf('"m-blank"')).toBeLessThan(order.indexOf('"m-words"'))
  })

  it('the words at their tallest (both lines at the control cap, the title on two) leave room for the glyph, at any text size', async () => {
    await render(tile(null))
    expect(screen.getByText('THU 22 OCT').props.maxFontSizeMultiplier).toBe(CONTROL_FONT_CAP)
    expect(screen.getByText('QA Scale night 1 at the Hall, a long name').props.maxFontSizeMultiplier).toBe(CONTROL_FONT_CAP)
    expect(screen.getByText('QA Scale night 1 at the Hall, a long name').props.numberOfLines).toBe(2)
    const words = flat('m-words')
    const tallest = (TYPE.label.lineHeight + 2 * TYPE.meta.lineHeight) * CONTROL_FONT_CAP + (words.gap as number) + (words.paddingBottom as number)
    expect(tallest + ICON.nav + SPACE.sm).toBeLessThanOrEqual(MEMORY_HEIGHT)
  })

  it('a tile with a cover has no glyph', async () => {
    await render(tile('https://example.com/a.jpg'))
    expect(screen.queryByTestId('m-blank', hidden)).toBeNull()
  })
})

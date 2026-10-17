/*
 * <LikingAsChip> (guidelines/components/LikingAsChip.html, Flow 10 · 10.7):
 * the 32 pt raised capsule beside "Crews here" that says who a like comes
 * from: the crew (its emblem) or "Just me" (your creature). It opens a sheet
 * to switch; the switch, not the chip, plays H.select.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import React from 'react'
import { AccessibilityInfo, StyleSheet } from 'react-native'

import { LikingAsChip } from '../components/ds/LikingAsChip'
import { COLOR, MATERIAL, RADIUS, SIZE } from '../lib/design/tokens'
import { H } from '../lib/haptics'

const flat = (id: string) => StyleSheet.flatten(screen.getByTestId(id, { includeHiddenElements: true }).props.style)
const NEBULA = { name: 'Nebula', emblemSeed: 'nebula' }

describe('<LikingAsChip>', () => {
  it('as a crew: the emblem and the crew’s name, a button that opens a menu', async () => {
    const onPress = jest.fn()
    await render(<LikingAsChip crew={NEBULA} pseudonym="Cosmic Panda" onPress={onPress} testID="c" />)
    const chip = screen.getByRole('button', { name: 'Liking as Nebula' })
    expect(chip.props.accessibilityHint).toBe('Opens a menu')
    expect(screen.getByTestId('c-emblem', { includeHiddenElements: true })).toBeTruthy()
    await fireEvent.press(chip)
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('Just me: your creature', async () => {
    await render(<LikingAsChip crew={null} pseudonym="Cosmic Panda" onPress={jest.fn()} testID="c" />)
    expect(screen.getByRole('button', { name: 'Liking as Just me' })).toBeTruthy()
    expect(screen.queryByTestId('c-emblem', { includeHiddenElements: true })).toBeNull()
  })

  it('is a 32 pt raised capsule, reaching the target size through slop', async () => {
    await render(<LikingAsChip crew={NEBULA} pseudonym="Cosmic Panda" onPress={jest.fn()} testID="c" />)
    expect(flat('c')).toMatchObject({ height: SIZE.tag, borderRadius: RADIUS.capsule, backgroundColor: COLOR.surfaceRaised })
    expect(screen.getByTestId('c').props.hitSlop).toMatchObject({ top: 6, bottom: 6 })
  })

  it('opening it plays nothing', async () => {
    const select = jest.spyOn(H, 'select').mockImplementation(() => {})
    await render(<LikingAsChip crew={NEBULA} pseudonym="Cosmic Panda" onPress={jest.fn()} testID="c" />)
    await fireEvent.press(screen.getByTestId('c'))
    expect(select).not.toHaveBeenCalled()
  })

  it('Increase Contrast: the 50% hairline', async () => {
    jest.spyOn(AccessibilityInfo, 'isDarkerSystemColorsEnabled').mockResolvedValue(true)
    await render(<LikingAsChip crew={NEBULA} pseudonym="Cosmic Panda" onPress={jest.fn()} testID="c" />)
    await act(async () => {})
    expect(flat('c-contrast')).toMatchObject({ borderColor: MATERIAL.hairlineIncreaseContrast })
  })
})

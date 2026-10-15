/*
 * <TimeRing> (guidelines/components/TimeRing.html): words set on a circle
 * around your face in the Room, Satoshi 500 at the 12 pt floor with 0.8
 * tracking, textSecondary, centred on the top. Fixed size (a decoration of
 * the count the reader gets as text); Bold Text 700, Increase Contrast white;
 * the words change on a fade; nothing rotates; silent.
 */
import { act, render, screen } from '@testing-library/react-native'
import React from 'react'
import { AccessibilityInfo, StyleSheet, View } from 'react-native'
import * as Reanimated from 'react-native-reanimated'

import { TimeRing } from '../components/ds/TimeRing'
import { COLOR, DURATION, FONT_FAMILY, TYPE } from '../lib/design/tokens'

jest.mock('react-native-reanimated', () => {
  const actual = jest.requireActual('react-native-reanimated')
  return { ...actual, __esModule: true, withTiming: jest.fn(actual.withTiming) }
})

const glyphs = () => screen.getAllByTestId('r-glyph', { includeHiddenElements: true })

it('sets each glyph on the ring at the 12 pt floor, 0.8 tracking, textSecondary, never scaled', async () => {
  await render(
    <TimeRing text="In the room · 1h 12m" testID="r">
      <View testID="face" />
    </TimeRing>
  )
  expect(glyphs()).toHaveLength('In the room · 1h 12m'.length)
  const g = glyphs()[0]
  expect(StyleSheet.flatten(g.props.style)).toMatchObject({
    fontFamily: FONT_FAMILY.brand[500],
    fontSize: TYPE.caption.fontSize,
    letterSpacing: 0.8,
    color: COLOR.textSecondary,
  })
  expect(g.props.allowFontScaling).toBe(false)
  expect(screen.getByTestId('face', { includeHiddenElements: true })).toBeTruthy()
})

it('is 112 by default, the phrase centred on the top', async () => {
  await render(<TimeRing text="Live · 42 min left" testID="r" />)
  expect(StyleSheet.flatten(screen.getByTestId('r', { includeHiddenElements: true }).props.style)).toMatchObject({ width: 112, height: 112 })
  const angle = (i: number) => parseFloat(StyleSheet.flatten(screen.getAllByTestId('r-slot', { includeHiddenElements: true })[i].props.style).transform[0].rotate)
  const n = 'Live · 42 min left'.length
  expect(angle(0)).toBeCloseTo(-angle(n - 1))
})

it('is decorative: hidden from the reader (the caller labels the face)', async () => {
  await render(<TimeRing text="In the room · 4m" testID="r" />)
  expect(screen.getByTestId('r-words', { includeHiddenElements: true }).props.accessibilityElementsHidden).toBe(true)
})

it('the words change on a base fade', async () => {
  await render(<TimeRing text="In the room · 4m" testID="r" />)
  jest.mocked(Reanimated.withTiming).mockClear()
  await screen.rerender(<TimeRing text="In the room · 5m" testID="r" />)
  expect(Reanimated.withTiming).toHaveBeenCalledWith(1, expect.objectContaining({ duration: DURATION.base }))
})

it('Bold Text sets it to 700; Increase Contrast to white', async () => {
  jest.spyOn(AccessibilityInfo, 'isBoldTextEnabled').mockResolvedValue(true)
  jest.spyOn(AccessibilityInfo, 'isDarkerSystemColorsEnabled').mockResolvedValue(true)
  await render(<TimeRing text="In the room · 1h 12m" testID="r" />)
  await act(async () => {})
  expect(StyleSheet.flatten(glyphs()[0].props.style)).toMatchObject({ fontFamily: FONT_FAMILY.brand[700], color: COLOR.textPrimary })
})

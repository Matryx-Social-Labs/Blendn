/*
 * <DayHeading> (guidelines/components/DayHeading.html): between the day groups
 * of a list, the date at 17 in 700 and the weekday in meta beside it. A heading,
 * never a sticky bar, no haptic.
 */
import { act, render, screen } from '@testing-library/react-native'
import React from 'react'
import { AccessibilityInfo, StyleSheet } from 'react-native'

import { DayHeading } from '../components/ds/DayHeading'
import { COLOR, FONT_FAMILY, TYPE } from '../lib/design/tokens'

const style = (t: string) => StyleSheet.flatten(screen.getByText(t).props.style)

it('the date is Satoshi 700 at 17/24, white; the weekday meta in textSecondary beside it', async () => {
  await render(<DayHeading date="Sat 4 Oct" weekday="Saturday" testID="d" />)
  expect(style('Sat 4 Oct')).toMatchObject({ fontFamily: FONT_FAMILY.brand[700], fontSize: TYPE.bodyStrong.fontSize, lineHeight: TYPE.bodyStrong.lineHeight, color: COLOR.textPrimary })
  expect(style('Saturday')).toMatchObject({ fontFamily: TYPE.meta.fontFamily, fontSize: TYPE.meta.fontSize, color: COLOR.textSecondary })
  expect(StyleSheet.flatten(screen.getByTestId('d').props.style)).toMatchObject({ flexDirection: 'row', alignItems: 'baseline' })
})

it('is one heading, read as the date and the weekday (or what the caller names it)', async () => {
  await render(<DayHeading date="Today" weekday="Friday" />)
  expect(screen.getByRole('header', { name: 'Today, Friday' })).toBeTruthy()
  await render(<DayHeading date="Sat 4 Oct" weekday="Saturday" accessibilityLabel="Saturday 4 October" />)
  expect(screen.getByRole('header', { name: 'Saturday 4 October' })).toBeTruthy()
})

it('the weekday is optional', async () => {
  await render(<DayHeading date="Sun 2 Nov" />)
  expect(screen.getByRole('header', { name: 'Sun 2 Nov' })).toBeTruthy()
})

it('Bold Text steps the date to 900 and the weekday to 700', async () => {
  jest.spyOn(AccessibilityInfo, 'isBoldTextEnabled').mockResolvedValue(true)
  await render(<DayHeading date="Sat 4 Oct" weekday="Saturday" />)
  await act(async () => {})
  expect(style('Sat 4 Oct').fontFamily).toBe(FONT_FAMILY.brand[900])
  expect(style('Saturday').fontFamily).toBe(FONT_FAMILY.brand[700])
})

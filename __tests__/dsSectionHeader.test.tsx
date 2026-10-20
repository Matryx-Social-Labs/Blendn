/*
 * <SectionHeader> (guidelines/components/SectionHeader.html): the heading at
 * 20, an optional "· N" in Geist Mono at textSecondary, and at the right a
 * text action in 700 14 white (the R3 ruling: one weight, white, for every
 * row-scale text action) or a built slot; an optional caption under it.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import React from 'react'
import { AccessibilityInfo, Platform, StyleSheet, Text } from 'react-native'

import { SectionHeader } from '../components/ds/SectionHeader'
import { COLOR, FONT_FAMILY, SIZE, TYPE } from '../lib/design/tokens'
import { H } from '../lib/haptics'
import { OPACITY } from '../lib/theme'

const style = (t: string) => StyleSheet.flatten(screen.getByText(t, { includeHiddenElements: true }).props.style)
const on = (os: 'ios' | 'android') => Object.defineProperty(Platform, 'OS', { value: os, configurable: true })

beforeEach(() => on('ios'))

it('the title is heading 20, white, and never ellipsized beside a slot: it holds its width and may take two lines', async () => {
  await render(<SectionHeader title="People you might have missed tonight" action={{ label: 'See all', onPress: jest.fn() }} testID="h" />)
  const title = screen.getByText('People you might have missed tonight', { includeHiddenElements: true })
  expect(StyleSheet.flatten(title.props.style)).toMatchObject({ fontFamily: TYPE.heading.fontFamily, fontSize: TYPE.heading.fontSize, color: COLOR.textPrimary, flexShrink: 0 })
  expect(title.props.numberOfLines).toBe(2)
})

it('the row wraps: the title’s side holds its size (capped at the row), the slot yields and rides to the right edge (audit D4)', async () => {
  await render(<SectionHeader title="Crews here" right={<Text>chip</Text>} testID="h" />)
  const row = StyleSheet.flatten(screen.getByTestId('h').props.style)
  expect(row).toMatchObject({ flexWrap: 'wrap', justifyContent: 'space-between' })
  const left = StyleSheet.flatten(screen.getByRole('header').props.style)
  expect(left).toMatchObject({ flexShrink: 0, maxWidth: '100%' })
  const slot = StyleSheet.flatten(screen.getByText('chip').parent?.props.style)
  expect(slot).toMatchObject({ flexShrink: 1, minWidth: 0, marginLeft: 'auto' })
})

it('the count is "· N" in Geist Mono 700, tabular, at textSecondary; the heading reads "{title}, {N}"', async () => {
  await render(<SectionHeader title="Everyone here" count={14} />)
  expect(style('14')).toMatchObject({ fontFamily: FONT_FAMILY.mono[700], color: COLOR.textSecondary, fontVariant: ['tabular-nums'] })
  expect(style('·').color).toBe(COLOR.textSecondary)
  expect(screen.getByRole('header', { name: 'Everyone here, 14' })).toBeTruthy()
})

it('the action is its own button, 700 14 white, silent, reaching the 44 pt target', async () => {
  const onPress = jest.fn()
  const haptics = Object.keys(H).map((k) => jest.spyOn(H, k as keyof typeof H).mockImplementation(() => {}))
  await render(<SectionHeader title="Tonight" action={{ label: 'See all', onPress }} testID="h" />)
  expect(style('See all')).toMatchObject({ fontFamily: FONT_FAMILY.brand[700], fontSize: TYPE.meta.fontSize, color: COLOR.textPrimary })
  const button = screen.getByRole('button', { name: 'See all' })
  await fireEvent.press(button)
  expect(onPress).toHaveBeenCalledTimes(1)
  for (const spy of haptics) expect(spy).not.toHaveBeenCalled()
  const slop = screen.getByTestId('h-action').props.hitSlop
  expect(TYPE.meta.lineHeight + slop.top + slop.bottom).toBeGreaterThanOrEqual(SIZE.targetIos)
  on('android')
  await render(<SectionHeader title="Tonight" action={{ label: 'See all', onPress }} testID="h" />)
  const a = screen.getByTestId('h-action').props.hitSlop
  expect(TYPE.meta.lineHeight + a.top + a.bottom).toBeGreaterThanOrEqual(SIZE.targetAndroid)
})

it('a short action (“Edit”) is still a 44 / 48 pt wide target, and a keyboard focus rings it', async () => {
  await render(<SectionHeader title="Interests" action={{ label: 'Edit', onPress: jest.fn() }} testID="h" />)
  expect(StyleSheet.flatten(screen.getByTestId('h-action').props.style).minWidth).toBe(SIZE.targetIos)
  await fireEvent(screen.getByTestId('h-action'), 'focus')
  expect(screen.getByTestId('h-action-focus', { includeHiddenElements: true })).toBeTruthy()
  on('android')
  await render(<SectionHeader title="Interests" action={{ label: 'Edit', onPress: jest.fn() }} testID="h" />)
  expect(StyleSheet.flatten(screen.getByTestId('h-action').props.style).minWidth).toBe(SIZE.targetAndroid)
})

it('a busy action is 45%, disabled and says so', async () => {
  const onPress = jest.fn()
  await render(<SectionHeader title="Interests" action={{ label: 'Saving…', onPress, busy: true }} testID="h" />)
  const button = screen.getByTestId('h-action')
  expect(StyleSheet.flatten(button.props.style).opacity).toBe(OPACITY.disabled)
  expect(button.props.accessibilityState).toMatchObject({ disabled: true, busy: true })
  await fireEvent.press(button)
  expect(onPress).not.toHaveBeenCalled()
})

it('takes a live dot, a caption under it and a built right slot', async () => {
  await render(
    <SectionHeader title="Live now" live caption="Select all that apply to you — up to three." right={<Text>Liking as</Text>} testID="h" />
  )
  expect(StyleSheet.flatten(screen.getByTestId('h-live', { includeHiddenElements: true }).props.style).backgroundColor).toBe(COLOR.live)
  expect(style('Select all that apply to you — up to three.')).toMatchObject({ fontSize: TYPE.meta.fontSize, color: COLOR.textSecondary })
  expect(screen.getByText('Liking as')).toBeTruthy()
  expect(StyleSheet.flatten(screen.getByTestId('h').props.style).alignItems).toBe('center')
})

it('Bold Text steps the title to 900 and the action to 900', async () => {
  jest.spyOn(AccessibilityInfo, 'isBoldTextEnabled').mockResolvedValue(true)
  await render(<SectionHeader title="Tonight" action={{ label: 'See all', onPress: jest.fn() }} />)
  await act(async () => {})
  expect(style('Tonight').fontFamily).toBe(FONT_FAMILY.brand[900])
  expect(style('See all').fontFamily).toBe(FONT_FAMILY.brand[900])
})

/*
 * <RevealBar> (guidelines/components/RevealBar.html): the two-sided you / them
 * panel above a DM, on the sheet tier. Each side a face, a name and an eye
 * that says seen or anonymous; under them the one action, "Show them who you
 * are" (white; a sheet confirms it), with "Ask them" beside it. Silent: the
 * sheet that confirms carries the outcome.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import React from 'react'
import { AccessibilityInfo, StyleSheet } from 'react-native'

import { RevealBar } from '../components/ds/RevealBar'
import { SELECTION } from '../components/ds/shared'
import { COLOR, MATERIAL, RADIUS } from '../lib/design/tokens'
import { H } from '../lib/haptics'

jest.mock('expo-linear-gradient', () => {
  const { View } = jest.requireActual('react-native')
  return { LinearGradient: (props: object) => <View {...props} /> }
})

const flat = (id: string) => StyleSheet.flatten(screen.getByTestId(id, { includeHiddenElements: true }).props.style)
const YOU = { face: { kind: 'creature', pseudonym: 'Night Cat' } as const, name: 'Night Cat' }
const THEM = { face: { kind: 'creature', pseudonym: 'Cosmic Panda' } as const, name: 'Cosmic Panda' }

const draw = (props: Partial<React.ComponentProps<typeof RevealBar>> = {}) =>
  render(<RevealBar state="none" you={YOU} them={THEM} onShow={jest.fn()} onAsk={jest.fn()} testID="r" {...props} />)

it('is a radius 24 panel on the sheet tier', async () => {
  await draw()
  expect(flat('r')).toMatchObject({ borderRadius: RADIUS.sheet })
})

it('anonymous both ways: both sides read, then Show them (lit) and Ask them, silently', async () => {
  const onShow = jest.fn()
  const onAsk = jest.fn()
  const haptics = Object.keys(H).map((k) => jest.spyOn(H, k as keyof typeof H).mockImplementation(() => {}))
  await draw({ onShow, onAsk })
  expect(screen.getByLabelText('You, Night Cat, anonymous. Cosmic Panda, anonymous.')).toBeTruthy()
  const show = screen.getByRole('button', { name: 'Show them who you are' })
  expect(StyleSheet.flatten(show.props.style).backgroundColor).toBe(SELECTION.ember.fill)
  const ask = screen.getByRole('button', { name: 'Ask them' })
  expect(StyleSheet.flatten(ask.props.style).backgroundColor).toBe(MATERIAL.fillOnGlass)
  await fireEvent(show, 'pressIn')
  await fireEvent.press(show)
  await fireEvent.press(ask)
  expect(onShow).toHaveBeenCalledTimes(1)
  expect(onAsk).toHaveBeenCalledTimes(1)
  for (const spy of haptics) expect(spy).not.toHaveBeenCalled()
})

it('you revealed: your side is seen, and it waits with no action', async () => {
  await draw({ state: 'youOnly', you: { face: { kind: 'photo', uri: 'https://example.com/sam.jpg' }, name: 'Sam' } })
  expect(screen.getByLabelText('You, Sam, seen. Cosmic Panda, anonymous.')).toBeTruthy()
  expect(screen.queryByRole('button')).toBeNull()
  expect(screen.getByText('They can see you. They’ll decide in their own time.')).toBeTruthy()
})

it('they revealed: their side is seen, and Show them is the one action', async () => {
  await draw({ state: 'theyOnly', them: { face: { kind: 'photo', uri: 'https://example.com/priya.jpg' }, name: 'Priya' } })
  expect(screen.getByLabelText('You, Night Cat, anonymous. Priya, seen.')).toBeTruthy()
  expect(screen.getAllByRole('button')).toHaveLength(1)
})

it('asked: a still line in place of the actions', async () => {
  await draw({ state: 'asked' })
  expect(screen.queryByRole('button')).toBeNull()
  expect(screen.getByText('Asked · they’ll decide in their own time')).toBeTruthy()
})

it('the actions wrap rather than truncate on a narrow phone; the asked line grows rather than clips', async () => {
  await draw({ testID: 'r' })
  expect(flat('r-actions')).toMatchObject({ flexDirection: 'row', flexWrap: 'wrap' })
  await draw({ state: 'asked', testID: 'r' })
  const line = screen.getByText('Asked · they’ll decide in their own time')
  expect(line.props.numberOfLines).toBeUndefined()
  expect(flat('r-asked').minHeight).toBe(48)
})

it('Increase Contrast: the 50% hairline, the eye line in white', async () => {
  jest.spyOn(AccessibilityInfo, 'isDarkerSystemColorsEnabled').mockResolvedValue(true)
  await draw()
  await act(async () => {})
  expect(flat('r-contrast')).toMatchObject({ borderWidth: 1, borderColor: MATERIAL.hairlineIncreaseContrast })
  expect(StyleSheet.flatten(screen.getAllByText('anonymous', { includeHiddenElements: true })[0].props.style).color).toBe(COLOR.textPrimary)
})

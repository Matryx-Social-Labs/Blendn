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

describe('both: the one thing left once you can see each other is to add them (SCRUM-750)', () => {
  const PHOTOS = {
    you: { face: { kind: 'photo', uri: 'https://example.com/sam.jpg' } as const, name: 'Sam' },
    them: { face: { kind: 'photo', uri: 'https://example.com/priya.jpg' } as const, name: 'Priya' },
  }

  it('reads both sides as seen, says so, and has a lit small Add friend', async () => {
    const onPress = jest.fn()
    await draw({ state: 'both', ...PHOTOS, friend: { label: 'Add friend', onPress } })
    expect(screen.getByLabelText('You, Sam, seen. Priya, seen.')).toBeTruthy()
    expect(screen.getByText('You can both see each other')).toBeTruthy()
    const add = screen.getByRole('button', { name: 'Add friend' })
    expect(StyleSheet.flatten(add.props.style)).toMatchObject({ backgroundColor: SELECTION.ember.fill, height: 36 })
    expect(screen.queryByRole('button', { name: 'Show them who you are' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Ask them' })).toBeNull()
    await fireEvent.press(add)
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('an accept says so, and is felt on press-in; adding is silent', async () => {
    const primary = jest.spyOn(H, 'primary').mockImplementation(() => {})
    await draw({ state: 'both', ...PHOTOS, friend: { label: 'Accept friend request', accept: true, onPress: jest.fn() } })
    await fireEvent(screen.getByRole('button', { name: 'Accept friend request' }), 'pressIn')
    expect(primary).toHaveBeenCalledTimes(1)
    primary.mockClear()
    await screen.unmount()
    await draw({ state: 'both', ...PHOTOS, friend: { label: 'Add friend', onPress: jest.fn() } })
    await fireEvent(screen.getByRole('button', { name: 'Add friend' }), 'pressIn')
    expect(primary).not.toHaveBeenCalled()
    primary.mockRestore()
  })

  it('with no action to offer it is only the line', async () => {
    await draw({ state: 'both', ...PHOTOS })
    expect(screen.getByText('You can both see each other')).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
  })
})

describe('rc7 D8', () => {
  it('the eye line shrinks to one line with an ellipsis rather than run past the card at 1.3× / 360', async () => {
    await draw()
    const eye = screen.getAllByText('anonymous', { includeHiddenElements: true })[0]
    expect(eye.props.numberOfLines).toBe(1)
    expect(StyleSheet.flatten(eye.props.style)).toMatchObject({ flexShrink: 1 })
  })

  it('your side before you show yourself reads "You", never "You · anonymous" over an eye that says anonymous', async () => {
    await draw({ you: { face: { kind: 'creature', pseudonym: 'You' }, name: 'You' } })
    expect(screen.getByText('You', { includeHiddenElements: true })).toBeTruthy()
    expect(screen.queryByText(/You · /, { includeHiddenElements: true })).toBeNull()
    expect(screen.getByLabelText('You, anonymous. Cosmic Panda, anonymous.')).toBeTruthy()
  })
})

/*
 * <RevealBar> (Flow 5 D-A under the identity model; board `swap-names/`, advisor pick A): the two-sided you / them panel
 * above a DM, on the sheet tier. Each side a face, a name and an eye line; under them the state's one action, stacked:
 * Swap names (lit) with what it shows, or "Waiting for them to swap too" with Cancel (quiet).
 */
import { act, fireEvent, render, screen, within } from '@testing-library/react-native'
import React from 'react'
import { AccessibilityInfo, StyleSheet } from 'react-native'

import { RevealBar, SWAP_NOTE } from '../components/ds/RevealBar'
import { SELECTION } from '../components/ds/shared'
import { COLOR, MATERIAL, RADIUS } from '../lib/design/tokens'
import { H } from '../lib/haptics'
import { isLitControl } from './helpers/lit'

jest.mock('expo-linear-gradient', () => {
  const { View } = jest.requireActual('react-native')
  return { LinearGradient: (props: object) => <View {...props} /> }
})

const flat = (id: string) => StyleSheet.flatten(screen.getByTestId(id, { includeHiddenElements: true }).props.style)
const YOU = { face: { kind: 'creature', pseudonym: 'Night Cat' } as const, name: 'Night Cat' }
const THEM = { face: { kind: 'creature', pseudonym: 'Cosmic Panda' } as const, name: 'Cosmic Panda' }

const draw = (props: Partial<React.ComponentProps<typeof RevealBar>> = {}) =>
  render(<RevealBar state="none" you={YOU} them={THEM} onSwap={jest.fn()} onCancel={jest.fn()} testID="r" {...props} />)

it('is a radius 24 panel on the sheet tier', async () => {
  await draw()
  expect(flat('r')).toMatchObject({ borderRadius: RADIUS.sheet })
})

it('neither tapped: both sides anonymous, then Swap names (lit) and what a swap shows; no Ask them, no Cancel', async () => {
  const onSwap = jest.fn()
  await draw({ onSwap })
  expect(screen.getByLabelText('You, Night Cat, anonymous. Cosmic Panda, anonymous.')).toBeTruthy()
  const swap = screen.getByRole('button', { name: 'Swap names' })
  expect(isLitControl(swap)).toBe(true)
  expect(screen.getByText(SWAP_NOTE)).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Ask them' })).toBeNull()
  expect(screen.queryByRole('button', { name: /Cancel/ })).toBeNull()
  await fireEvent.press(swap)
  expect(onSwap).toHaveBeenCalledTimes(1)
})

it('you tapped: your side says so, still your pseudonym; waiting, and Cancel (quiet) is the one action', async () => {
  const onCancel = jest.fn()
  await draw({ state: 'mine', onCancel })
  expect(screen.getByLabelText('You, Night Cat, tapped. Cosmic Panda, anonymous.')).toBeTruthy()
  expect(screen.getByText('Waiting for them to swap too')).toBeTruthy()
  // A screen reader hears what is cancelled, not a bare "Cancel".
  const cancel = screen.getByRole('button', { name: 'Cancel your swap' })
  expect(screen.getByText('Cancel')).toBeTruthy()
  expect(StyleSheet.flatten(cancel.props.style).backgroundColor).toBe(MATERIAL.fillOnGlass)
  expect(screen.getAllByRole('button')).toHaveLength(1)
  expect(screen.queryByText(SWAP_NOTE)).toBeNull()
  await fireEvent.press(cancel)
  expect(onCancel).toHaveBeenCalledTimes(1)
})

it('they tapped: their side and a line say so, and Swap names is the one action', async () => {
  await draw({ state: 'theirs' })
  expect(screen.getByLabelText('You, Night Cat, anonymous. Cosmic Panda, wants to swap.')).toBeTruthy()
  expect(screen.getByText('Cosmic Panda wants to swap names')).toBeTruthy()
  expect(screen.getAllByRole('button').map((b) => b.props.accessibilityLabel)).toEqual(['Swap names'])
  expect(screen.getByText(SWAP_NOTE)).toBeTruthy()
})

it('the action is stacked under its line at every size; a refusal is said in place, once', async () => {
  await draw({ state: 'theirs', error: 'Add a photo to your profile first' })
  expect(flat('r-actions')).toMatchObject({ flexDirection: 'column' })
  const err = screen.getByTestId('r-error')
  expect(err.props.accessibilityLiveRegion).toBe('polite')
  expect(screen.getByText('Add a photo to your profile first')).toBeTruthy()
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
    you: { face: { kind: 'photo', uri: 'https://example.com/sam.jpg', name: 'Sam' } as const, name: 'Sam' },
    them: { face: { kind: 'photo', uri: 'https://example.com/priya.jpg', name: 'Priya' } as const, name: 'Priya' },
  }

  it('reads both sides as seen, says so, and has a lit small Add friend', async () => {
    const onPress = jest.fn()
    await draw({ state: 'both', ...PHOTOS, friend: { label: 'Add friend', onPress } })
    expect(screen.getByLabelText('You, Sam, seen. Priya, seen.')).toBeTruthy()
    expect(screen.getByText('You can both see each other')).toBeTruthy()
    const add = screen.getByRole('button', { name: 'Add friend' })
    expect(StyleSheet.flatten(add.props.style)).toMatchObject({ height: 36 })
    expect(isLitControl(add)).toBe(true)
    expect(screen.queryByRole('button', { name: 'Swap names' })).toBeNull()
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

  it('your side with no pseudonym reads "You", never "You · anonymous" over an eye that says anonymous', async () => {
    await draw({ you: { face: { kind: 'creature', pseudonym: 'You' }, name: 'You' } })
    expect(screen.getByText('You', { includeHiddenElements: true })).toBeTruthy()
    expect(screen.queryByText(/You · /, { includeHiddenElements: true })).toBeNull()
    expect(screen.getByLabelText('You, anonymous. Cosmic Panda, anonymous.')).toBeTruthy()
  })
})

/*
 * rc8 10d: at 1.3× / 360 dp both sides read "anony…": beside the face the eye line had about 54 dp, and "anonymous" is
 * one word, so two lines cannot help it. Narrow, it goes under the face and the name, across the side; roomy, it stays
 * under the name. Negative control: with the eye line inside the names column at every width, the narrow case fails.
 */
describe('rc8 10d: the eye line at 360 dp', () => {
  const at = (width: number) => jest.spyOn(require('react-native'), 'useWindowDimensions').mockReturnValue({ width, height: 800, scale: 3, fontScale: 1.3 })
  afterEach(() => jest.restoreAllMocks())

  it('narrow: under the face and the name, across the whole side, on both sides', async () => {
    at(360)
    await draw()
    for (const who of ['you', 'them']) {
      const names = screen.getByTestId(`r-${who}-names`, { includeHiddenElements: true })
      expect(within(names).queryByTestId(`r-${who}-eye`, { includeHiddenElements: true })).toBeNull()
      expect(screen.getByTestId(`r-${who}-eye`, { includeHiddenElements: true })).toBeTruthy()
    }
  })

  it('roomy: under the name, beside the face, as designed', async () => {
    at(402)
    await draw()
    const names = screen.getByTestId('r-you-names', { includeHiddenElements: true })
    expect(within(names).getByTestId('r-you-eye', { includeHiddenElements: true })).toBeTruthy()
  })
})

it('never cuts a long pseudonym: each side name wraps as far as it needs (advisor A, "never truncate")', async () => {
  const long = 'Luminous Wandering Albatross 999'
  await draw({ state: 'theirs', them: { face: { kind: 'creature', pseudonym: long }, name: long } })
  expect(screen.getByText(long).props.numberOfLines).toBeUndefined()
  expect(screen.getByText('You · Night Cat').props.numberOfLines).toBeUndefined()
})

/*
 * <RevealBar>, Flow 5 D-A (dm.html `xReveal`, element-boxes dA-none / dA-mine / dA-ax): the strip under the DM header.
 * Each side a face (40), the name and an eye with "Anonymous" or "Shown" (yours "You · …"); between them a hairline.
 * Then "Show who you are" (lit violet: anything that is you is violet) and "Ask them"; after you show, one line waits.
 * Silent: the sheet that confirms carries the outcome.
 */
import { act, fireEvent, render, screen, within } from '@testing-library/react-native'
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
const YOU = { face: { kind: 'creature', pseudonym: 'Quiet Lynx' } as const, name: 'Quiet Lynx' }
const THEM = { face: { kind: 'creature', pseudonym: 'Lunar Fox' } as const, name: 'Lunar Fox' }

const draw = (props: Partial<React.ComponentProps<typeof RevealBar>> = {}) =>
  render(<RevealBar state="none" you={YOU} them={THEM} onShow={jest.fn()} onAsk={jest.fn()} testID="r" {...props} />)

it('is a radius 24 strip on the surface, padded 12 · 14 · 14, under a violet rim', async () => {
  await draw()
  expect(flat('r')).toMatchObject({ borderRadius: RADIUS.sheet, backgroundColor: COLOR.surface, paddingTop: 12, paddingHorizontal: 14, paddingBottom: 14 })
  expect(flat('r-rim')).toMatchObject({ borderWidth: 1, borderRadius: RADIUS.sheet })
})

it('anonymous both ways: your pseudonym and theirs, then Show who you are (lit violet) and Ask them, silently', async () => {
  const onShow = jest.fn()
  const onAsk = jest.fn()
  const haptics = Object.keys(H).map((k) => jest.spyOn(H, k as keyof typeof H).mockImplementation(() => {}))
  await draw({ onShow, onAsk })
  expect(screen.getByLabelText('You, Quiet Lynx, anonymous. Lunar Fox, anonymous.')).toBeTruthy()
  expect(screen.getByText('You · Anonymous', { includeHiddenElements: true })).toBeTruthy()
  expect(screen.getByText('Anonymous', { includeHiddenElements: true })).toBeTruthy()
  const show = screen.getByRole('button', { name: 'Show who you are' })
  expect(StyleSheet.flatten(show.props.style)).toMatchObject({ backgroundColor: SELECTION.violet.fill, height: 40 })
  const ask = screen.getByRole('button', { name: 'Ask them' })
  expect(StyleSheet.flatten(ask.props.style)).toMatchObject({ backgroundColor: MATERIAL.fillOnGlass, height: 40 })
  await fireEvent(show, 'pressIn')
  await fireEvent.press(show)
  await fireEvent.press(ask)
  expect(onShow).toHaveBeenCalledTimes(1)
  expect(onAsk).toHaveBeenCalledTimes(1)
  for (const spy of haptics) expect(spy).not.toHaveBeenCalled()
})

it('the old names are gone: never "Show them who you are", never "Show who I am"', async () => {
  await draw()
  expect(screen.queryByText(/Show them who you are|Show who I am/, { includeHiddenElements: true })).toBeNull()
})

it('you showed them: your side is your first name, Shown, and the strip waits with one line', async () => {
  await draw({ state: 'youOnly', you: { face: { kind: 'photo', uri: 'https://example.com/rohan.jpg' }, name: 'Rohan' } })
  expect(screen.getByLabelText('You, Rohan, shown. Lunar Fox, anonymous.')).toBeTruthy()
  expect(screen.getByText('You · Shown', { includeHiddenElements: true })).toBeTruthy()
  expect(screen.queryByRole('button')).toBeNull()
  expect(screen.getByText('You showed them who you are. They decide when.')).toBeTruthy()
})

it('they showed you: their side is Shown, and Show who you are is the one action', async () => {
  await draw({ state: 'theyOnly', them: { face: { kind: 'photo', uri: 'https://example.com/ananya.jpg' }, name: 'Ananya' } })
  expect(screen.getByLabelText('You, Quiet Lynx, anonymous. Ananya, shown.')).toBeTruthy()
  expect(screen.getAllByRole('button').map((b) => b.props.accessibilityLabel)).toEqual(['Show who you are'])
})

it('asked: a still line in place of the actions', async () => {
  await draw({ state: 'asked' })
  expect(screen.queryByRole('button')).toBeNull()
  expect(screen.getByText('Asked · they’ll decide in their own time')).toBeTruthy()
})

it('the sides mirror: yours face-first, theirs name-first and right-aligned, a hairline between', async () => {
  await draw()
  expect(flat('r-you')).toMatchObject({ flexDirection: 'row' })
  expect(flat('r-them')).toMatchObject({ flexDirection: 'row-reverse' })
  expect(flat('r-mid')).toMatchObject({ width: 24, height: 1, backgroundColor: COLOR.hairlineStrong })
})

it('a long name takes two lines rather than be cut to a few letters (worst case: Midnight Butterfly, Copper Flamingo)', async () => {
  await draw({ you: { face: YOU.face, name: 'Midnight Butterfly' }, them: { face: THEM.face, name: 'Copper Flamingo' } })
  expect(screen.getByText('Midnight Butterfly', { includeHiddenElements: true }).props.numberOfLines).toBe(2)
  expect(screen.getByText('Copper Flamingo', { includeHiddenElements: true }).props.numberOfLines).toBe(2)
})

it('the actions sit side by side; at the largest text they stack full width (dA-ax)', async () => {
  // RN's jest mock reports fontScale 2: the default text size is set here.
  const dims = jest.spyOn(require('react-native'), 'useWindowDimensions').mockReturnValue({ width: 393, height: 852, scale: 3, fontScale: 1 })
  await draw()
  expect(flat('r-actions')).toMatchObject({ flexDirection: 'row' })
  dims.mockReturnValue({ width: 393, height: 852, scale: 3, fontScale: 2 })
  await draw()
  expect(flat('r-actions')).toMatchObject({ flexDirection: 'column' })
  jest.restoreAllMocks()
})

it('Increase Contrast: the 50% hairline, the eye line in white', async () => {
  jest.spyOn(AccessibilityInfo, 'isDarkerSystemColorsEnabled').mockResolvedValue(true)
  await draw()
  await act(async () => {})
  expect(flat('r-contrast')).toMatchObject({ borderWidth: 1, borderColor: MATERIAL.hairlineIncreaseContrast })
  expect(StyleSheet.flatten(screen.getByText('Anonymous', { includeHiddenElements: true }).props.style).color).toBe(COLOR.textPrimary)
})

describe('both: the one thing left once you can see each other is to add them (SCRUM-750)', () => {
  const PHOTOS = {
    you: { face: { kind: 'photo', uri: 'https://example.com/sam.jpg' } as const, name: 'Sam' },
    them: { face: { kind: 'photo', uri: 'https://example.com/priya.jpg' } as const, name: 'Priya' },
  }

  it('reads both sides as shown, says so, and has a lit small Add friend', async () => {
    const onPress = jest.fn()
    await draw({ state: 'both', ...PHOTOS, friend: { label: 'Add friend', onPress } })
    expect(screen.getByLabelText('You, Sam, shown. Priya, shown.')).toBeTruthy()
    expect(screen.getByText('You can both see each other')).toBeTruthy()
    const add = screen.getByRole('button', { name: 'Add friend' })
    expect(StyleSheet.flatten(add.props.style)).toMatchObject({ backgroundColor: SELECTION.ember.fill, height: 36 })
    expect(screen.queryByRole('button', { name: 'Show who you are' })).toBeNull()
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
  it('the eye line shrinks to one line with an ellipsis rather than run past the strip at 1.3× / 360', async () => {
    await draw()
    const eye = screen.getByText('You · Anonymous', { includeHiddenElements: true })
    expect(eye.props.numberOfLines).toBe(1)
    expect(StyleSheet.flatten(eye.props.style)).toMatchObject({ flexShrink: 1 })
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

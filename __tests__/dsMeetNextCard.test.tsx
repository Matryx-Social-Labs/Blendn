/*
 * <MeetNextCard> (Flow 5 R-A `pick`, Wave B): the lit rose card under "Meet next": a 64 pt face, the name and one reason
 * in two lines each, and a labelled 40 pt Wave pill: Wave → Wave back → ✓ Waved → Say hi (SCRUM-1042). Pressed and
 * focused. Tap opens the PersonCard, silently.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import React from 'react'
import { AccessibilityInfo, StyleSheet } from 'react-native'

import { MeetNextCard } from '../components/ds/MeetNextCard'
import { HueProvider } from '../components/ds/shared'
import { COLOR, MATERIAL, RADIUS, SPACE } from '../lib/design/tokens'
import { H } from '../lib/haptics'

const flat = (id: string) => StyleSheet.flatten(screen.getByTestId(id, { includeHiddenElements: true }).props.style)
const query = (id: string) => screen.queryByTestId(id, { includeHiddenElements: true })
const PRIYA = { face: { kind: 'photo', uri: 'https://example.com/priya.jpg' } as const, name: 'Priya', reason: 'Both open to dating', width: 110 }

it('is a surface card at radius 20 (RADIUS.tile), 110 wide, with a 64 pt face and a 40 pt Wave pill; name and reason take two lines', async () => {
  await render(<MeetNextCard {...PRIYA} testID="m" />)
  expect(flat('m-scale')).toMatchObject({ width: 110 })
  expect(flat('m')).toMatchObject({ borderRadius: RADIUS.tile, backgroundColor: COLOR.surface })
  expect(flat('m-face')).toMatchObject({ width: 64, height: 64 })
  expect(flat('m-wave')).toMatchObject({ minHeight: 40, borderRadius: RADIUS.capsule, alignSelf: 'stretch' })
  expect(screen.getByText('Wave', { includeHiddenElements: true })).toBeTruthy()
  expect(screen.getByText('Priya', { includeHiddenElements: true }).props.numberOfLines).toBe(2)
  for (const t of ['Priya', 'Both open to dating']) {
    expect(screen.getByText(t, { includeHiddenElements: true }).props.maxFontSizeMultiplier).toBe(1.3)
  }
})

it('is a button, “{name}, {reason}”, with Wave as its named action', async () => {
  const onWave = jest.fn()
  await render(<MeetNextCard {...PRIYA} onWave={onWave} />)
  const card = screen.getByRole('button', { name: 'Priya, Both open to dating' })
  expect(card.props.accessibilityActions).toEqual([{ name: 'activate' }, { name: 'wave', label: 'Wave' }])
  await fireEvent(card, 'accessibilityAction', { nativeEvent: { actionName: 'wave' } })
  expect(onWave).toHaveBeenCalledTimes(1)
})

it('the pill’s press is H.select as the hand swings (07-motion), and is not the card’s open', async () => {
  const onWave = jest.fn()
  const onPress = jest.fn()
  const select = jest.spyOn(H, 'select').mockImplementation(() => {})
  await render(<MeetNextCard {...PRIYA} onWave={onWave} onPress={onPress} testID="m" />)
  await fireEvent.press(screen.getByTestId('m-wave', { includeHiddenElements: true }))
  expect(onWave).toHaveBeenCalledTimes(1)
  expect(select).toHaveBeenCalledTimes(1)
  expect(onPress).not.toHaveBeenCalled()
})

it('they waved at you: the rim lights, the reason is “Waved at you” and how long ago, and the pill reads Wave back', async () => {
  await render(<HueProvider value="rose"><MeetNextCard {...PRIYA} wave="wavedAtYou" wavedAgo="4 min" onWave={() => {}} testID="m" /></HueProvider>)
  expect(screen.getByText('Wave back', { includeHiddenElements: true })).toBeTruthy()
  expect(screen.getByText('Waved at you', { includeHiddenElements: true })).toBeTruthy()
  expect(screen.getByText('4 min ago', { includeHiddenElements: true })).toBeTruthy()
  expect(screen.queryByText('Both open to dating', { includeHiddenElements: true })).toBeNull()
  expect(flat('m')).toMatchObject({ borderColor: COLOR.brandRose })
  expect(flat('m-wave')).toMatchObject({ backgroundColor: COLOR.selectionRoseFill, borderColor: COLOR.brandRose })
  expect(screen.getByRole('button', { name: 'Priya, Waved at you 4 min ago' }).props.accessibilityActions).toContainEqual({ name: 'wave', label: 'Wave back' })
})

it('at the largest text “Wave back” wraps inside the pill rather than cutting to “Wave b…” (drive, iOS AX XXXL)', async () => {
  await render(<MeetNextCard {...PRIYA} wave="wavedAtYou" onWave={() => {}} testID="m" />)
  const label = screen.getByText('Wave back', { includeHiddenElements: true })
  expect(label.props.numberOfLines).toBe(2)
  expect(StyleSheet.flatten(label.props.style)).toMatchObject({ flexShrink: 1, textAlign: 'center' })
})

it('at the default size “Wave back” keeps one line in a 110 card: the pill gives the label its width (drive, Android)', async () => {
  // Android draws Satoshi a few dp wider than iOS: with 8 a side and a 4 gap the label had 62 dp and wrapped at 1.0.
  // The pill stretches and centres its content, so the padding shows only when a label overflows.
  await render(<MeetNextCard {...PRIYA} wave="wavedAtYou" onWave={() => {}} testID="m" />)
  expect(StyleSheet.flatten(screen.getByTestId('m-wave', { includeHiddenElements: true }).props.style)).toMatchObject({ paddingHorizontal: SPACE.xs })
})

it('you waved: a still ✓ Waved that does nothing, and no Wave again', async () => {
  const onWave = jest.fn()
  await render(<HueProvider value="rose"><MeetNextCard {...PRIYA} wave="waved" onWave={onWave} testID="m" /></HueProvider>)
  expect(screen.getByText('Waved', { includeHiddenElements: true })).toBeTruthy()
  expect(screen.queryByText('Wave again', { includeHiddenElements: true })).toBeNull()
  expect(flat('m-wave')).toMatchObject({ backgroundColor: 'transparent', borderColor: COLOR.brandRose })
  await fireEvent.press(screen.getByTestId('m-wave', { includeHiddenElements: true }))
  expect(onWave).not.toHaveBeenCalled()
  expect(screen.getByRole('button', { name: 'Priya, Both open to dating, waved' }).props.accessibilityActions).toBeUndefined()
})

it('in flight the hand swings and a second press sends nothing', async () => {
  const onWave = jest.fn()
  await render(<MeetNextCard {...PRIYA} wave="sending" onWave={onWave} testID="m" />)
  expect(query('m-hand-waving')).toBeTruthy()
  await fireEvent.press(screen.getByTestId('m-wave', { includeHiddenElements: true }))
  expect(onWave).not.toHaveBeenCalled()
})

it('you both waved: the reason says so and the pill is Say hi', async () => {
  const onSayHi = jest.fn()
  await render(<MeetNextCard {...PRIYA} wave="mutual" onSayHi={onSayHi} testID="m" />)
  expect(screen.getByText('You both waved', { includeHiddenElements: true })).toBeTruthy()
  await fireEvent.press(screen.getByTestId('m-wave', { includeHiddenElements: true }))
  expect(onSayHi).toHaveBeenCalledTimes(1)
  expect(flat('m-wave')).toMatchObject({ backgroundColor: COLOR.textPrimary })
})

it('a tap opens the card, silently; pressed scales, focused rings it', async () => {
  const onPress = jest.fn()
  const haptics = Object.keys(H).map((k) => jest.spyOn(H, k as keyof typeof H).mockImplementation(() => {}))
  await render(<MeetNextCard {...PRIYA} onPress={onPress} />)
  await fireEvent.press(screen.getByRole('button'))
  expect(onPress).toHaveBeenCalledTimes(1)
  for (const spy of haptics) expect(spy).not.toHaveBeenCalled()
  await render(<MeetNextCard {...PRIYA} previewState="pressed" testID="m" />)
  expect(flat('m-scale').transform).toEqual([{ scale: 0.97 }])
  await render(<MeetNextCard {...PRIYA} previewState="focused" testID="m" />)
  expect(query('m-focus')).toBeTruthy()
})

it('Increase Contrast: the 50% hairline and the reason in white', async () => {
  jest.spyOn(AccessibilityInfo, 'isDarkerSystemColorsEnabled').mockResolvedValue(true)
  await render(<MeetNextCard {...PRIYA} testID="m" />)
  await act(async () => {})
  expect(flat('m')).toMatchObject({ borderWidth: 1, borderColor: MATERIAL.hairlineIncreaseContrast })
  expect(StyleSheet.flatten(screen.getByText('Both open to dating', { includeHiddenElements: true }).props.style).color).toBe(COLOR.textPrimary)
})

it('says Matching v2’s sentence as the reason when the server sent one (R7)', async () => {
  await render(<MeetNextCard {...PRIYA} overlap="Both CSK, in RCB country" />)
  expect(screen.getByText('Both CSK, in RCB country', { includeHiddenElements: true }).props.numberOfLines).toBe(2)
  expect(screen.queryByText('Both open to dating', { includeHiddenElements: true })).toBeNull()
  expect(screen.getByRole('button', { name: 'Priya, Both CSK, in RCB country' })).toBeTruthy()
})

it('a hold opens the card with H.longPress (H1)', async () => {
  const onPress = jest.fn()
  const spy = jest.spyOn(H, 'longPress').mockImplementation(() => {})
  await render(<MeetNextCard {...PRIYA} onPress={onPress} testID="m" />)
  await fireEvent(screen.getByTestId('m'), 'longPress')
  expect(spy).toHaveBeenCalledTimes(1)
  expect(onPress).toHaveBeenCalledTimes(1)
})

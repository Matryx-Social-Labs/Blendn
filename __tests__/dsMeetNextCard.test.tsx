/*
 * <MeetNextCard> (Flow 5 R-A `pick`): the lit rose card under "Meet next": a 64 pt face, the name and one reason in two
 * lines each, and the 40 pt like; liked lights the heart; pressed and focused. Tap opens the PersonCard, silently.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import React from 'react'
import { AccessibilityInfo, StyleSheet } from 'react-native'

import { MeetNextCard } from '../components/ds/MeetNextCard'
import { HueProvider } from '../components/ds/shared'
import { COLOR, MATERIAL, RADIUS } from '../lib/design/tokens'
import { H } from '../lib/haptics'

const flat = (id: string) => StyleSheet.flatten(screen.getByTestId(id, { includeHiddenElements: true }).props.style)
const query = (id: string) => screen.queryByTestId(id, { includeHiddenElements: true })
const PRIYA = { face: { kind: 'photo', uri: 'https://example.com/priya.jpg' } as const, name: 'Priya', reason: 'Both open to dating', width: 110 }

it('is a surface card at radius 20 (RADIUS.tile), 110 wide, with a 64 pt face and a 40 pt heart; name and reason take two lines', async () => {
  await render(<MeetNextCard {...PRIYA} testID="m" />)
  expect(flat('m-scale')).toMatchObject({ width: 110 })
  expect(flat('m')).toMatchObject({ borderRadius: RADIUS.tile, backgroundColor: COLOR.surface })
  expect(flat('m-face')).toMatchObject({ width: 64, height: 64 })
  expect(flat('m-like')).toMatchObject({ width: 40, height: 40 })
  expect(screen.getByText('Priya', { includeHiddenElements: true }).props.numberOfLines).toBe(2)
  for (const t of ['Priya', 'Both open to dating']) {
    expect(screen.getByText(t, { includeHiddenElements: true }).props.maxFontSizeMultiplier).toBe(1.3)
  }
})

it('is a button, “{name}, {reason}”; liked adds the heart mark and “liked”', async () => {
  await render(<MeetNextCard {...PRIYA} />)
  expect(screen.getByRole('button', { name: 'Priya, Both open to dating' })).toBeTruthy()
  await render(<HueProvider value="rose"><MeetNextCard {...PRIYA} liked testID="m" /></HueProvider>)
  expect(flat('m-like')).toMatchObject({ backgroundColor: COLOR.brandRose })
  expect(screen.getByRole('button', { name: 'Priya, Both open to dating, liked' })).toBeTruthy()
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

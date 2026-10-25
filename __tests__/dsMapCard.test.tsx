/*
 * <MapCard>, <MapPin>, <MapCluster> (guidelines/components/MapCard.html): the
 * 200 pt map band on the Scene and the venue page, with the venue's ember pin
 * at the centre and "Open in Maps" as a scrim pill; the pin family (event,
 * venue, live, you, selected) and the cluster, which zooms and never opens a
 * list.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import React from 'react'
import { AccessibilityInfo, StyleSheet, View } from 'react-native'

import { MapCard, MapCluster, MapPin } from '../components/ds/MapCard'
import { COLOR, FONT_FAMILY, MATERIAL, RADIUS, SIZE, TYPE } from '../lib/design/tokens'
import { H } from '../lib/haptics'
import { tint } from '../lib/theme'

const flat = (id: string) => StyleSheet.flatten(screen.getByTestId(id, { includeHiddenElements: true }).props.style)
const query = (id: string) => screen.queryByTestId(id, { includeHiddenElements: true })

let select: jest.SpyInstance
beforeEach(() => {
  select = jest.spyOn(H, 'select').mockImplementation(() => {})
})

describe('<MapCard>', () => {
  it('a radius-24, 200 pt band with the ember pin at the centre over the map the screen draws', async () => {
    await render(<MapCard venue="Toit" map={<View testID="the-map" />} testID="m" />)
    expect(flat('m')).toMatchObject({ height: 200, borderRadius: RADIUS.mediaInCard, backgroundColor: COLOR.surfaceSunken })
    expect(screen.getByTestId('the-map', { includeHiddenElements: true })).toBeTruthy()
    expect(flat('m-pin-dot')).toMatchObject({ width: 14, height: 14, backgroundColor: COLOR.brandOrange })
    expect(flat('m-pin')).toMatchObject({ borderColor: tint(COLOR.brandOrange, 0.35) })
    expect(screen.getByText('Open in Maps', { includeHiddenElements: true })).toBeTruthy()
  })

  it('reads as one button, “Map, {venue}, {address}”, opening Maps, silently', async () => {
    const onPress = jest.fn()
    const haptics = Object.keys(H).map((k) => jest.spyOn(H, k as keyof typeof H).mockImplementation(() => {}))
    await render(<MapCard venue="Toit" address="12th Main, Indiranagar" onPress={onPress} />)
    const card = screen.getByRole('button', { name: 'Map, Toit, 12th Main, Indiranagar' })
    expect(card.props.accessibilityHint).toBe('Opens Maps')
    await fireEvent.press(card)
    expect(onPress).toHaveBeenCalledTimes(1)
    for (const spy of haptics) expect(spy).not.toHaveBeenCalled()
  })

  it('the address at the bottom right; your dot when you are near', async () => {
    await render(<MapCard venue="Toit" address="12th Main, Indiranagar" you testID="m" />)
    expect(StyleSheet.flatten(screen.getByText('12th Main, Indiranagar', { includeHiddenElements: true }).props.style)).toMatchObject({
      fontSize: TYPE.caption.fontSize,
      color: COLOR.textPrimary,
    })
    expect(query('m-you')).toBeTruthy()
    // One line with an ellipsis, never two lines clipped mid-word (r7 L4).
    expect(screen.getByText('12th Main, Indiranagar', { includeHiddenElements: true }).props.numberOfLines).toBe(1)
  })

  it('the pill and the address share one bottom row, the address taking what is left: no overlap at 1.3× / 360 (rc7 D5)', async () => {
    await render(<MapCard venue="Toit" address="8, Allied Grande Plaza, Koramangala" testID="m" />)
    expect(StyleSheet.flatten(screen.getByTestId('m-foot', { includeHiddenElements: true }).props.style)).toMatchObject({ position: 'absolute', flexDirection: 'row' })
    const address = StyleSheet.flatten(screen.getByText('8, Allied Grande Plaza, Koramangala', { includeHiddenElements: true }).props.style)
    expect(address.position).toBeUndefined()
  })

  // rc8 10a: right-aligned and ellipsized, Android drew the line at its full width, so "8," lost its "8" at 1.3× / 360.
  // The address hugs its text and shrinks into what the pill leaves, pushed right by its margin.
  // Negative control: the rc7 style (`flex: 1, textAlign: 'right'`) fails it.
  it('the address is pushed right by its margin, never right-aligned text, so Android never clips its first character (rc8 10a)', async () => {
    await render(<MapCard venue="Toit" address="8, Allied Grande Plaza, Koramangala" testID="m" />)
    const address = StyleSheet.flatten(screen.getByText('8, Allied Grande Plaza, Koramangala', { includeHiddenElements: true }).props.style)
    expect(address).toMatchObject({ flexShrink: 1, marginLeft: 'auto' })
    expect(address.textAlign).not.toBe('right')
    expect(address.flex).toBeUndefined()
  })

  it('focused rings it; Increase Contrast adds the 50% hairline', async () => {
    await render(<MapCard venue="Toit" previewState="focused" testID="m" />)
    expect(query('m-focus')).toBeTruthy()
    jest.spyOn(AccessibilityInfo, 'isDarkerSystemColorsEnabled').mockResolvedValue(true)
    await render(<MapCard venue="Toit" testID="m" />)
    await act(async () => {})
    expect(flat('m-contrast')).toMatchObject({ borderWidth: 1, borderColor: MATERIAL.hairlineIncreaseContrast })
  })
})

describe('<MapPin>', () => {
  it.each([
    ['event', COLOR.brandOrange],
    ['venue', COLOR.brandViolet],
    ['live', COLOR.live],
  ] as const)('%s is 10 pt of colour inside a 2 pt ink ring', async (kind, color) => {
    await render(<MapPin kind={kind} testID="p" />)
    expect(flat('p-dot')).toMatchObject({ width: 14, height: 14, backgroundColor: color, borderWidth: 2, borderColor: COLOR.ink })
  })

  it('selected is 14 pt of colour with a white ring outside the ink one', async () => {
    await render(<MapPin kind="event" selected testID="p" />)
    expect(flat('p-dot')).toMatchObject({ width: 18, height: 18 })
    expect(flat('p-selected')).toMatchObject({ width: 22, borderWidth: 2, borderColor: COLOR.textPrimary })
  })

  it('you: 14 pt of white with a halo', async () => {
    await render(<MapPin kind="you" testID="p" />)
    expect(flat('p-dot')).toMatchObject({ width: 18, backgroundColor: COLOR.textPrimary })
    expect(query('p-halo')).toBeTruthy()
  })

  it('a pin you can tap is a 44 pt button, “{title}, {time}, pin”, and plays H.select', async () => {
    const onPress = jest.fn()
    await render(<MapPin kind="event" label="Vinyl Night, 9 PM" onPress={onPress} testID="p" />)
    expect(flat('p')).toMatchObject({ width: SIZE.targetIos, height: SIZE.targetIos })
    await fireEvent.press(screen.getByRole('button', { name: 'Vinyl Night, 9 PM, pin' }))
    expect(select).toHaveBeenCalledTimes(1)
    expect(onPress).toHaveBeenCalledTimes(1)
  })
})

describe('<MapCluster>', () => {
  it('an ink disc at 28 with a white ring and the count in Geist Mono 700; 34 from 100', async () => {
    await render(<MapCluster count={12} testID="c" />)
    expect(flat('c-disc')).toMatchObject({ width: 28, height: 28, borderColor: COLOR.textPrimary })
    expect(StyleSheet.flatten(screen.getByText('12', { includeHiddenElements: true }).props.style)).toMatchObject({
      fontFamily: FONT_FAMILY.mono[700],
      fontVariant: ['tabular-nums'],
    })
    await render(<MapCluster count={120} testID="c" />)
    expect(flat('c-disc').width).toBe(34)
  })

  it('a tap zooms in, silently: “{N} events here”, a button', async () => {
    const onPress = jest.fn()
    const haptics = Object.keys(H).map((k) => jest.spyOn(H, k as keyof typeof H).mockImplementation(() => {}))
    await render(<MapCluster count={12} onPress={onPress} />)
    const c = screen.getByRole('button', { name: '12 events here' })
    expect(c.props.accessibilityHint).toBe('Zooms in')
    await fireEvent.press(c)
    expect(onPress).toHaveBeenCalledTimes(1)
    for (const spy of haptics) expect(spy).not.toHaveBeenCalled()
  })
})

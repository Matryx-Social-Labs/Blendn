/*
 * <EventCard> (guidelines/components/EventCard.html): one card, three sizes.
 * Hero (radius 32) and compact (radius 24) put the words on the photo over
 * the 62% scrim, with the time badge and "N going" as scrim pills top-left;
 * row is the list form, a 56 pt thumb and one line each. Saved adds the
 * "You're going · 9 PM" ribbon. A push, so no haptic.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import React from 'react'
import { AccessibilityInfo, Platform, StyleSheet } from 'react-native'

import { EventCard } from '../components/ds/EventCard'
import { PHOTO_SCRIM } from '../components/ui/GradientFill'
import { PRESSED_WASH } from '../components/ds/shared'
import { COLOR, FONT_FAMILY, MATERIAL, RADIUS, TYPE } from '../lib/design/tokens'
import { H } from '../lib/haptics'
import { tint } from '../lib/theme'

jest.mock('expo-linear-gradient', () => {
  const { View } = jest.requireActual('react-native')
  return { LinearGradient: (props: object) => <View {...props} testID="scrim" /> }
})

const flat = (id: string) => StyleSheet.flatten(screen.getByTestId(id, { includeHiddenElements: true }).props.style)
const style = (t: string) => StyleSheet.flatten(screen.getByText(t, { includeHiddenElements: true }).props.style)
const on = (os: 'ios' | 'android') => Object.defineProperty(Platform, 'OS', { value: os, configurable: true })
const VINYL = { title: 'Vinyl Night', time: '9 PM', venue: 'Toit', distance: '1.2 km', going: 42, cover: 'https://example.com/v.jpg' }

beforeEach(() => on('ios'))

describe('hero and compact', () => {
  it('hero is radius 32 with the title in title; compact is radius 24 with it in bodyStrong; two lines at most', async () => {
    await render(<EventCard kind="hero" {...VINYL} testID="e" />)
    expect(flat('e')).toMatchObject({ borderRadius: RADIUS.card, backgroundColor: COLOR.surface })
    const title = screen.getByText('Vinyl Night', { includeHiddenElements: true })
    expect(StyleSheet.flatten(title.props.style)).toMatchObject({ fontSize: TYPE.title.fontSize, color: COLOR.textPrimary })
    expect(title.props.numberOfLines).toBe(2)
    await render(<EventCard kind="compact" {...VINYL} testID="e" />)
    expect(flat('e').borderRadius).toBe(RADIUS.mediaInCard)
    expect(style('Vinyl Night').fontSize).toBe(TYPE.bodyStrong.fontSize)
  })

  it('the words sit on the photo over the scrim: 62% of the card, to 88% ink', async () => {
    await render(<EventCard kind="compact" {...VINYL} testID="e" />)
    expect(StyleSheet.flatten(screen.getByTestId('scrim', { includeHiddenElements: true }).props.style).height).toBe('62%')
    expect(screen.getByTestId('scrim', { includeHiddenElements: true }).props.colors).toEqual([tint(COLOR.ink, 0), tint(COLOR.ink, PHOTO_SCRIM.foot)])
    expect(style('at Toit · 1.2 km')).toMatchObject({ fontSize: TYPE.meta.fontSize, color: COLOR.textPrimary })
  })

  it('the time badge in Geist Mono and “N going”, top-left as scrim pills', async () => {
    await render(<EventCard kind="compact" {...VINYL} />)
    expect(style('9 PM').fontFamily).toBe(FONT_FAMILY.mono[500])
    expect(screen.getByText('42 going', { includeHiddenElements: true })).toBeTruthy()
  })

  it('saved: the white ribbon, “You’re going · 9 PM”, the time in Geist Mono, read first', async () => {
    await render(<EventCard kind="compact" {...VINYL} saved="9 PM" testID="e" />)
    expect(flat('e-saved')).toMatchObject({ backgroundColor: COLOR.textPrimary, borderRadius: RADIUS.capsule })
    expect(screen.getByRole('button').props.accessibilityLabel).toBe('You’re going, Vinyl Night, 9 PM, at Toit, 1.2 km, 42 going')
  })

  it('is one button, “{title}, {time}, at {venue}, {distance}, {N} going”; the tap is silent', async () => {
    const onPress = jest.fn()
    const haptics = Object.keys(H).map((k) => jest.spyOn(H, k as keyof typeof H).mockImplementation(() => {}))
    await render(<EventCard kind="hero" {...VINYL} onPress={onPress} />)
    await fireEvent.press(screen.getByRole('button', { name: 'Vinyl Night, 9 PM, at Toit, 1.2 km, 42 going' }))
    expect(onPress).toHaveBeenCalledTimes(1)
    for (const spy of haptics) expect(spy).not.toHaveBeenCalled()
  })

  it('pressed scales on iOS; Android ripples instead; focused rings it', async () => {
    await render(<EventCard kind="compact" {...VINYL} previewState="pressed" testID="e" />)
    expect(flat('e-scale').transform).toEqual([{ scale: 0.97 }])
    on('android')
    await render(<EventCard kind="compact" {...VINYL} onPress={jest.fn()} previewState="pressed" testID="e" />)
    expect(flat('e-scale').transform).toBeUndefined()
    expect(flat('e-wash').backgroundColor).toBe(PRESSED_WASH.android)
    await render(<EventCard kind="compact" {...VINYL} previewState="focused" testID="e" />)
    expect(screen.getByTestId('e-focus', { includeHiddenElements: true })).toBeTruthy()
  })
})

it('the words on the photo stop at 1.5×, so the foot never runs up under the pills in a fixed card', async () => {
  await render(<EventCard kind="compact" {...VINYL} />)
  expect(screen.getByText('Vinyl Night', { includeHiddenElements: true }).props.maxFontSizeMultiplier).toBe(1.5)
  expect(screen.getByText('at Toit · 1.2 km', { includeHiddenElements: true }).props.maxFontSizeMultiplier).toBe(1.5)
})

describe('row', () => {
  it('a long venue gives way; the time is never the part cut off', async () => {
    await render(<EventCard kind="row" {...VINYL} venue="Toit Brewpub, 100 Feet Road, Indiranagar" />)
    const venue = screen.getByText('Toit Brewpub, 100 Feet Road, Indiranagar · 1.2 km ·', { includeHiddenElements: true })
    expect(venue.props.numberOfLines).toBe(1)
    expect(StyleSheet.flatten(venue.props.style).flexShrink).toBe(1)
    const time = screen.getByText('9 PM', { includeHiddenElements: true })
    expect(StyleSheet.flatten(time.props.style).flexShrink ?? 0).toBe(0)
  })

  it('a 64 pt row: the 56 pt thumb at radius 8, the title on one line, venue · distance · the time in Geist Mono', async () => {
    await render(<EventCard kind="row" {...VINYL} testID="e" />)
    expect(flat('e').height).toBe(64)
    expect(flat('e-thumb')).toMatchObject({ width: 56, height: 56, borderRadius: RADIUS.thumb })
    const title = screen.getByText('Vinyl Night', { includeHiddenElements: true })
    expect(title.props).toMatchObject({ numberOfLines: 1, maxFontSizeMultiplier: 1.3 })
    expect(style('9 PM')).toMatchObject({ fontFamily: FONT_FAMILY.mono[500], fontVariant: ['tabular-nums'] })
    expect(screen.getByRole('button', { name: 'Vinyl Night, 9 PM, at Toit, 1.2 km, 42 going' })).toBeTruthy()
  })
})

it('Increase Contrast: the 50% hairline on the card and the scrim 20% deeper', async () => {
  jest.spyOn(AccessibilityInfo, 'isDarkerSystemColorsEnabled').mockResolvedValue(true)
  await render(<EventCard kind="compact" {...VINYL} testID="e" />)
  await act(async () => {})
  expect(flat('e-contrast')).toMatchObject({ borderWidth: 1, borderColor: MATERIAL.hairlineIncreaseContrast })
  expect(screen.getByTestId('scrim', { includeHiddenElements: true }).props.colors[1]).toBe(tint(COLOR.ink, 1))
})

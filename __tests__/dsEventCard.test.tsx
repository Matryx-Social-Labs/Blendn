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
import { HueProvider, PRESSED_WASH } from '../components/ds/shared'
import { COLOR, FONT_FAMILY, MATERIAL, RADIUS, TYPE } from '../lib/design/tokens'
import { H } from '../lib/haptics'
import { tint } from '../lib/theme'

jest.mock('../components/ds/anchor', () => ({
  measureAnchor: (_node: unknown, then: (r: { x: number; y: number; width: number; height: number }) => void) => then({ x: 24, y: 300, width: 240, height: 170 }),
}))
jest.mock('../components/ui/Icon', () => {
  const { View } = jest.requireActual('react-native')
  return { Icon: ({ name, size, color }: { name: string; size: number; color: string }) => <View testID={`icon-${name}`} size={size} color={color} /> }
})
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

describe('the peek (onLongPress)', () => {
  it('a hold plays H.longPress once and hands the screen the card\'s frame; a tap plays none', async () => {
    const longPress = jest.spyOn(H, 'longPress').mockImplementation(() => {})
    const onLongPress = jest.fn()
    const onPress = jest.fn()
    await render(<EventCard kind="compact" {...VINYL} onPress={onPress} onLongPress={onLongPress} testID="e" />)
    await fireEvent.press(screen.getByTestId('e'))
    expect(longPress).not.toHaveBeenCalled()
    await fireEvent(screen.getByTestId('e'), 'longPress')
    expect(longPress).toHaveBeenCalledTimes(1)
    expect(onLongPress).toHaveBeenCalledWith({ x: 24, y: 300, width: 240, height: 170 })
  })

  it('a screen reader reaches it as "Quick actions", with the same frame and no hold haptic', async () => {
    const longPress = jest.spyOn(H, 'longPress').mockImplementation(() => {})
    const onLongPress = jest.fn()
    await render(<EventCard kind="row" {...VINYL} onLongPress={onLongPress} testID="e" />)
    await fireEvent(screen.getByTestId('e'), 'accessibilityAction', { nativeEvent: { actionName: 'quickActions' } })
    expect(onLongPress).toHaveBeenCalledWith({ x: 24, y: 300, width: 240, height: 170 })
    expect(longPress).not.toHaveBeenCalled()
  })

  it('a card with no peek has no Quick actions and no hold', async () => {
    await render(<EventCard kind="row" {...VINYL} testID="e" />)
    expect(screen.getByTestId('e').props.accessibilityActions).toBeUndefined()
  })
})

describe('row · lead="distance"', () => {
  it('moves the distance into a Geist Mono 700 column ahead of the thumb, and out of the meta line', async () => {
    await render(<EventCard kind="row" lead="distance" {...VINYL} testID="e" />)
    expect(style('1.2 km')).toMatchObject({ fontFamily: FONT_FAMILY.mono[700], minWidth: 64 })
    expect(screen.queryByText(/Toit · 1\.2 km/, { includeHiddenElements: true })).toBeNull()
    expect(screen.getByRole('button').props.accessibilityLabel).toContain('1.2 km')
  })

  it('the column is at least 64 and sizes to its words up to 96, never a fixed width that clips them (drive 4 D-4)', async () => {
    await render(<EventCard kind="row" lead="distance" {...VINYL} distance="16 km" testID="e" />)
    const lead = style('16 km')
    expect(lead.width).toBeUndefined()
    expect(lead).toMatchObject({ minWidth: 64, maxWidth: 96, flexShrink: 0 })
  })

  it('beside the column the venue has its own line, so the time never squeezes it to "…" (R6-6, 360 dp at 1.3)', async () => {
    await render(<EventCard kind="row" lead="distance" {...VINYL} venue="Toit Brewpub, Indiranagar" testID="e" />)
    const venue = screen.getByTestId('e-venue', { includeHiddenElements: true })
    expect(venue.props).toMatchObject({ numberOfLines: 1, children: 'Toit Brewpub, Indiranagar' })
    expect(StyleSheet.flatten(venue.props.style).flexShrink ?? 0).toBe(0)
    // The time line is the time alone: no venue run, no dot to share it with.
    expect(screen.queryByText('·', { includeHiddenElements: true })).toBeNull()
    expect(screen.getByText('9 PM', { includeHiddenElements: true })).toBeTruthy()
    expect(screen.getByText('Vinyl Night', { includeHiddenElements: true }).props.numberOfLines).toBe(2)
  })

  it('draws no column when the row has no distance, and leaves the default row alone', async () => {
    await render(<EventCard kind="row" lead="distance" {...VINYL} distance={undefined} testID="e" />)
    expect(screen.queryByTestId('e-lead')).toBeNull()
    await render(<EventCard kind="row" {...VINYL} testID="e" />)
    expect(screen.queryByTestId('e-lead')).toBeNull()
    expect(screen.getByText(/Toit · 1\.2 km/, { includeHiddenElements: true })).toBeTruthy()
  })
})

describe('row', () => {
  it('a long venue gives way; the time is never the part cut off', async () => {
    await render(<EventCard kind="row" {...VINYL} venue="Toit Brewpub, 100 Feet Road, Indiranagar" />)
    const venue = screen.getByText('Toit Brewpub, 100 Feet Road, Indiranagar · 1.2 km', { includeHiddenElements: true })
    expect(venue.props.numberOfLines).toBe(1)
    expect(StyleSheet.flatten(venue.props.style).flexShrink).toBe(1)
    // The separator before the time is its own run, so truncating the venue never takes it (r7 L12).
    const dot = screen.getByText('·', { includeHiddenElements: true })
    expect(StyleSheet.flatten(dot.props.style).flexShrink ?? 0).toBe(0)
    const time = screen.getByText('9 PM', { includeHiddenElements: true })
    expect(StyleSheet.flatten(time.props.style).flexShrink ?? 0).toBe(0)
  })

  it('a row of 64 pt at least: the 56 pt thumb at radius 8, the title on two lines, venue · distance · the time in Geist Mono', async () => {
    await render(<EventCard kind="row" {...VINYL} testID="e" />)
    // A two-line title grows the row: its height is a minimum, never a box (shared.ts).
    expect(flat('e')).toMatchObject({ minHeight: 64 })
    expect(flat('e').height).toBeUndefined()
    expect(flat('e-thumb')).toMatchObject({ width: 56, height: 56, borderRadius: RADIUS.thumb })
    const title = screen.getByText('Vinyl Night', { includeHiddenElements: true })
    expect(title.props).toMatchObject({ numberOfLines: 2, maxFontSizeMultiplier: 1.3 })
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

describe('inert: a card with nowhere to go', () => {
  it('is read and not pressed: text role, disabled, and a press does nothing (row and card)', async () => {
    const onPress = jest.fn()
    for (const kind of ['row', 'compact'] as const) {
      const { unmount } = await render(<EventCard kind={kind} title="Toit" time="28 Sep" venue="Live here" inert onPress={onPress} testID={`inert-${kind}`} />)
      const card = screen.getByTestId(`inert-${kind}`)
      expect(card.props.accessibilityRole).toBe('text')
      await fireEvent.press(card)
      expect(onPress).not.toHaveBeenCalled()
      await unmount()
    }
  })
})

describe('the category plate (D8: no empty box in a populated row)', () => {
  const hidden = { includeHiddenElements: true }
  const NO_COVER = { ...VINYL, cover: null }

  it('a row with no cover draws its category: the glyph in the hue’s light on the hue’s fill', async () => {
    await render(<EventCard kind="row" {...NO_COVER} category="music" testID="e" />)
    expect(flat('e-plate')).toMatchObject({ backgroundColor: COLOR.selectionEmberFill })
    const glyph = screen.getByTestId('icon-music-2', hidden)
    expect(glyph.props.color).toBe(COLOR.selectionEmberGlyph)
    expect(screen.getByTestId('e-plate', hidden).props.accessibilityElementsHidden).toBe(true)
  })

  it('in the screen’s hue: rose together', async () => {
    await render(
      <HueProvider value="rose">
        <EventCard kind="row" {...NO_COVER} category="music" testID="e" />
      </HueProvider>
    )
    expect(flat('e-plate').backgroundColor).toBe(COLOR.selectionRoseFill)
    expect(screen.getByTestId('icon-music-2', hidden).props.color).toBe(COLOR.selectionRoseGlyph)
  })

  it('a category with no glyph draws the fill alone; a cover always wins; a venue plate wins over a category', async () => {
    await render(<EventCard kind="row" {...NO_COVER} category="something-new" testID="e" />)
    expect(flat('e-plate').backgroundColor).toBe(COLOR.selectionEmberFill)
    expect(screen.queryAllByTestId(/^icon-/, hidden)).toEqual([])
    await render(<EventCard kind="row" {...VINYL} category="music" testID="e" />)
    expect(screen.queryByTestId('e-plate', hidden)).toBeNull()
    await render(<EventCard kind="row" {...NO_COVER} plate="cafe" category="music" testID="e" />)
    expect(screen.queryByTestId('e-plate', hidden)).toBeNull()
  })

  it('hero and compact with no cover draw it under the scrim', async () => {
    for (const kind of ['hero', 'compact'] as const) {
      await render(<EventCard kind={kind} {...NO_COVER} category="nightlife" testID="e" />)
      expect(flat('e-plate').backgroundColor).toBe(COLOR.selectionEmberFill)
      expect(screen.getByTestId('icon-moon', hidden)).toBeTruthy()
    }
  })

  it('with no category, a coverless row is as it was', async () => {
    await render(<EventCard kind="row" {...NO_COVER} testID="e" />)
    expect(screen.queryByTestId('e-plate', hidden)).toBeNull()
  })
})

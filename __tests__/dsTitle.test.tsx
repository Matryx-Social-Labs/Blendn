/*
 * SCRUM-1041 (owner pick A + D, 2026-11-15; board ~/blendn-design-export/mockups/redesign-2026-11/long-titles/): a title whose
 * longest word is wider than its line shrinks until that word fits, never below the role's 1× size; every other title draws
 * as the role says. On the offer pass the tile stacks over the venue at the accessibility sizes (D).
 *
 * The platform's own layout is the input: `textLayout` carries the lines the phone drew, the hidden `title-measure` copy
 * carries the split word's width at 1×. The widths below are Satoshi Bold's, measured on the board (lt.js): Thiruvananthapuram
 * is 224.5 pt at 24 pt, and the offer pass's line beside the 48 tile is 270 pt on an iPhone 17.
 */
import { fireEvent, render, screen } from '@testing-library/react-native'
import React from 'react'
import { Platform, StyleSheet } from 'react-native'

import { fittedSize, splitWords, Title } from '../components/ds/Title'
import { DoorTicket } from '../components/offer/OfferSections'
import type { PassView } from '../lib/offers'
import { AX_XXXL, atScale, resetScale } from './helpers/ax'
import { WORST } from './helpers/longText'

jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default)

const WORD_AT_1X = 224.5
const OFFER_LINE = 270
const lines = (...texts: string[]) => texts.map((text) => ({ text, width: 0, height: 0, x: 0, y: 0, ascender: 0, descender: 0, capHeight: 0, xHeight: 0 }))
const style = (id: string) => StyleSheet.flatten(screen.getByTestId(id).props.style) as { fontSize: number; lineHeight: number; letterSpacing: number }

/** The phone draws the title: its box, then its lines. */
async function drawn(id: string, line: number, ...texts: string[]) {
  const title = screen.getByTestId(id)
  await fireEvent(title, 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: line, height: 0 } } })
  await relaid(id, ...texts)
}
/** The phone lays the title out again, as drawn now. */
const relaid = (id: string, ...texts: string[]) => fireEvent(screen.getByTestId(id), 'textLayout', { nativeEvent: { lines: lines(...texts) } })
/** The hidden copy of the split word reports its width at 1×. */
const measured = (width: number) =>
  fireEvent(screen.getByTestId('title-measure', { includeHiddenElements: true }), 'textLayout', { nativeEvent: { lines: [{ ...lines('w')[0], width }] } })
const measuring = () => screen.queryByTestId('title-measure', { includeHiddenElements: true })

afterEach(() => resetScale())

describe('splitWords: a line that ends inside a word', () => {
  it('finds the word the layout split, whole', () => {
    expect(splitWords(lines('Thiruvananthap', 'uram'))).toEqual(['Thiruvananthapuram'])
    expect(splitWords(lines('The Thiruvanan', 'thapuram Arts'))).toEqual(['Thiruvananthapuram'])
  })

  it('a break on a space is not a split', () => {
    expect(splitWords(lines('Kowdiar ', 'Junction'))).toEqual([])
  })

  it('a break after a hyphen is not a split (iOS), one inside a hyphenated word is (Android at font 2.0, SCRUM-1054)', () => {
    expect(splitWords(lines('Saint-Jean-sur-', 'Richelieu Runners'))).toEqual([])
    expect(splitWords(lines('Saint-Jean-s', 'ur-Richelieu ', 'Runners'))).toEqual(['Saint-Jean-sur-Richelieu'])
  })

  it('Devanagari breaks between its words, and a script without spaces between its characters', () => {
    expect(splitWords(lines('थिरुवनंतपुरम कला एवं ', 'कॉफ़ी संग्रहालय'))).toEqual([])
    expect(splitWords(lines('東京デザイン', 'フェスティバル'))).toEqual([])
  })
})

describe('fittedSize: the size the word fits, on the half point, never under 1×', () => {
  const base = { fontSize: 24, lineHeight: 30, letterSpacing: -0.4 }
  it('matches the board (offer pass, iOS: 28.5 pt; Android 279 dp: 29.5 pt)', () => {
    expect(fittedSize(base, WORD_AT_1X, OFFER_LINE)).toBe(28.5)
    expect(fittedSize(base, WORD_AT_1X, 279)).toBe(29.5)
  })
  it('never under the role size, however wide the word', () => {
    expect(fittedSize(base, 600, OFFER_LINE)).toBe(24)
  })
})

describe('<Title> at the largest text', () => {
  beforeEach(() => atScale(AX_XXXL))

  it('a title whose words fit stays at its role size, scaled by the phone, and nothing is measured', async () => {
    await render(<Title testID="t">Kowdiar Junction</Title>)
    await drawn('t', OFFER_LINE, 'Kowdiar ', 'Junction')
    expect(measuring()).toBeNull()
    const t = screen.getByTestId('t')
    expect(style('t').fontSize).toBe(24)
    expect(t.props.maxFontSizeMultiplier).toBe(2)
    expect(t.props.allowFontScaling).not.toBe(false)
  })

  it('Thiruvananthapuram shrinks until it fits its line, its line height and tracking with it', async () => {
    await render(<Title testID="t">{WORST.city}</Title>)
    await drawn('t', OFFER_LINE, 'Thiruvananthap', 'uram')
    expect(measuring()?.props.children).toBe(WORST.city)
    await measured(WORD_AT_1X)
    expect(measuring()).toBeNull()
    expect(style('t')).toMatchObject({ fontSize: 28.5, lineHeight: 36 })
    expect(style('t').letterSpacing).toBeCloseTo(-0.475)
    // Drawn at the fitted size by this component alone: the phone's own scaling would multiply it again.
    expect(screen.getByTestId('t').props.allowFontScaling).toBe(false)
  })

  it('never breaks: still split once shrunk (a glyph rounding past the line), it steps down another half point', async () => {
    await render(<Title testID="t">{WORST.city}</Title>)
    await drawn('t', OFFER_LINE, 'Thiruvananthap', 'uram')
    await measured(WORD_AT_1X)
    await relaid('t', 'Thiruvananthapura', 'm')
    expect(style('t').fontSize).toBe(28)
    await relaid('t', WORST.city)
    expect(style('t').fontSize).toBe(28)
  })

  it('never goes below the role size, even when the word cannot fit at it', async () => {
    await render(<Title testID="t">{WORST.city}</Title>)
    await drawn('t', 100, 'Thiruv', 'anant', 'hapuram')
    await measured(WORD_AT_1X)
    expect(style('t').fontSize).toBe(24)
    await relaid('t', 'Thiruvanant', 'hapuram')
    expect(style('t').fontSize).toBe(24)
  })

  it('measures the same when the lines arrive before the box', async () => {
    await render(<Title testID="t">{WORST.city}</Title>)
    await relaid('t', 'Thiruvananthap', 'uram')
    expect(measuring()).toBeNull()
    await fireEvent(screen.getByTestId('t'), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: OFFER_LINE, height: 0 } } })
    await measured(WORD_AT_1X)
    expect(style('t').fontSize).toBe(28.5)
  })

  it('a clamped title stays shrunk when the clamp, at the new size, shows more of it', async () => {
    const t = 'Thiruvananthapuram Jazz Weekender at the Kowdiar Palace Grounds'
    await render(<Title testID="t" numberOfLines={2}>{t}</Title>)
    await drawn('t', 370, 'Thiruvananthapur', 'am Jazz Weekender')
    await measured(WORD_AT_1X)
    expect(style('t').fontSize).toBe(39.5)
    await relaid('t', 'Thiruvananthapuram Jazz ', 'Weekender at the Kowdiar')
    expect(style('t').fontSize).toBe(39.5)
  })

  it('a Devanagari title is unchanged', async () => {
    const dev = 'थिरुवनंतपुरम कला एवं कॉफ़ी संग्रहालय'
    await render(<Title testID="t">{dev}</Title>)
    await drawn('t', OFFER_LINE, 'थिरुवनंतपुरम कला ', 'एवं कॉफ़ी ', 'संग्रहालय')
    expect(measuring()).toBeNull()
    expect(style('t').fontSize).toBe(24)
  })

  it('a new title is drawn at the role size again and judged afresh', async () => {
    await render(<Title testID="t">{WORST.city}</Title>)
    await drawn('t', OFFER_LINE, 'Thiruvananthap', 'uram')
    await measured(WORD_AT_1X)
    await screen.rerender(<Title testID="t">Kochi</Title>)
    await relaid('t', 'Kochi')
    expect(style('t').fontSize).toBe(24)
    expect(screen.getByTestId('t').props.allowFontScaling).not.toBe(false)
  })
})

describe('<Title> at the default size', () => {
  it('measures nothing: at 1× the floor leaves nothing to shrink', async () => {
    await atScale(1)
    await render(<Title testID="t">{WORST.city}</Title>)
    await drawn('t', 120, 'Thiruvanan', 'thapuram')
    expect(measuring()).toBeNull()
    expect(style('t').fontSize).toBe(24)
  })
})

/*
 * SCRUM-1109: on Android 14+ the phone scales 24 sp to 26.4 dp at 1.3 but the 30 sp line only to 30 dp, under Satoshi's 1.25 em,
 * so the last line lost its descenders ("Table 33 Regulars"). Android titles past 1× draw at the phone's own size in dp with the
 * role's line height in proportion, as the shrink path already does.
 */
describe('<Title> on Android past the default size (SCRUM-1109)', () => {
  const os = (value: string, version: number) => {
    Object.defineProperty(Platform, 'OS', { value, configurable: true })
    Object.defineProperty(Platform, 'Version', { value: version, configurable: true })
  }
  const was = { OS: Platform.OS, Version: Platform.Version }
  afterEach(() => os(was.OS, was.Version as number))

  it('at 1.3 draws the phone’s 26.4 dp with a 33 dp line, not a squeezed 30', async () => {
    os('android', 34)
    await atScale(1.3)
    await render(<Title testID="t">Table 33 Regulars</Title>)
    expect(style('t')).toMatchObject({ fontSize: 26.4, lineHeight: 33 })
    expect(screen.getByTestId('t').props.allowFontScaling).toBe(false)
  })

  it('at 2.0: 36 dp on a 45 dp line', async () => {
    os('android', 35)
    await atScale(2)
    await render(<Title testID="t">Hidden Tiger</Title>)
    expect(style('t')).toMatchObject({ fontSize: 36, lineHeight: 45 })
  })

  it('a word fitted at 2.0 never draws bigger than the phone draws the title (36, not 40)', async () => {
    os('android', 34)
    await atScale(2)
    await render(<Title testID="t">{WORST.city}</Title>)
    await drawn('t', 360, 'Thiruvananthap', 'uram')
    // At 1× the word is 216 wide, so it fits the 360 line at 40: bigger than the 36 the phone draws, so nothing changes.
    await measured(216)
    expect(style('t').fontSize).toBe(36)
  })

  it('negative controls: iOS at 1.3, Android at 1×, and Android 13 keep the platform’s own scaling', async () => {
    os('ios', 18)
    await atScale(1.3)
    await render(<Title testID="t">Table 33 Regulars</Title>)
    expect(style('t')).toMatchObject({ fontSize: 24, lineHeight: 30 })
    expect(screen.getByTestId('t').props.allowFontScaling).not.toBe(false)

    os('android', 34)
    await atScale(1)
    await screen.rerender(<Title testID="t">Table 33 Regulars</Title>)
    expect(style('t')).toMatchObject({ fontSize: 24, lineHeight: 30 })

    os('android', 33)
    await atScale(1.3)
    await screen.rerender(<Title testID="t">Table 33 Regulars</Title>)
    expect(style('t')).toMatchObject({ fontSize: 24, lineHeight: 30 })
    expect(screen.getByTestId('t').props.allowFontScaling).not.toBe(false)
  })
})

describe('offer pass (D): the tile stacks over the venue only at the accessibility sizes', () => {
  const view: PassView = { door: 'live', level: 1, spent: false, stamp: null, redeemedClock: undefined, foot: '' }
  const ticket = () => render(<DoorTicket venueName={WORST.city} offerText="A free filter coffee" until={null} view={view} active={false} />)
  const direction = () => StyleSheet.flatten(screen.getByTestId('door-head').props.style).flexDirection

  it.each([1, 1.35])('beside the venue at %s×', async (scale) => {
    await atScale(scale)
    await ticket()
    expect(direction()).toBe('row')
  })

  it.each([1.65, 2, AX_XXXL])('over the venue at %s×', async (scale) => {
    await atScale(scale)
    await ticket()
    expect(direction()).toBe('column')
  })
})

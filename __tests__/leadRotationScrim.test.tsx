/*
 * The Pulse lead's rotation scrim (pulse-media sheet 08, owner 2026-11-17). Featured C shows frames nobody picked as the
 * cover, so the words must hold over ANY frame. Checked here against the worst frame there is, pure white, with the
 * board's 345 × 256 card and its 3-line worst-case title: the overline (white, 12 pt: 4.5:1) from y 92, the title's top
 * line (24 pt bold: 3:1) from y 108. Today's scrim (0 → 88% ink over the lower 70%, overline 78% white) is the control:
 * it fails both, as the board measured on staging (1.2:1 and 1.6:1).
 */
import { act, render, screen } from '@testing-library/react-native'
import React from 'react'
import { Dimensions, StyleSheet, View } from 'react-native'

import { EventCard } from '../components/ds/EventCard'
import { PHOTO_SCRIM } from '../components/ui/GradientFill'
import { COLOR } from '../lib/design/tokens'

jest.mock('expo-linear-gradient', () => {
  const { View: V } = jest.requireActual('react-native')
  return { LinearGradient: (props: object) => <V {...props} /> }
})

const CARD_H = 256
const OVERLINE_TOP = 92
const TITLE_TOP = 108

const hex = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16))
const rgba = (c: string) => {
  const m = /rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/.exec(c)
  if (!m) throw new Error(`not rgba: ${c}`)
  return { rgb: [+m[1], +m[2], +m[3]], a: +m[4] }
}
const lin = (v: number) => {
  const c = v / 255
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}
const lum = ([r, g, b]: number[]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
const mix = (under: number[], over: number[], a: number) => under.map((u, i) => u * (1 - a) + over[i] * a)
const ratio = (x: number[], y: number[]) => {
  const [hi, lo] = [lum(x), lum(y)].sort((p, q) => q - p)
  return (hi + 0.05) / (lo + 0.05)
}

/** The ink alpha a gradient puts at `y` (pt from the card's top), given where the gradient's box starts and its stops. */
function inkAt(y: number, box: { top: number; height: number }, stops: { at: number; a: number }[]) {
  const t = (y - box.top) / box.height
  if (t <= stops[0].at) return t < 0 ? 0 : stops[0].a
  for (let i = 1; i < stops.length; i++) {
    const [p, q] = [stops[i - 1], stops[i]]
    if (t <= q.at) return p.a + ((q.a - p.a) * (t - p.at)) / (q.at - p.at)
  }
  return stops[stops.length - 1].a
}

/** White text at `alpha` over a pure-white frame under the scrim at `y`. */
function worst(y: number, box: { top: number; height: number }, stops: { at: number; a: number }[], alpha: number) {
  const ink = hex(COLOR.ink)
  const ground = mix([255, 255, 255], ink, inkAt(y, box, stops))
  return ratio(mix(ground, [255, 255, 255], alpha), ground)
}

function rendered(testID: string) {
  const scrim = screen.getByTestId(`${testID}-scrim`, { includeHiddenElements: true })
  const height = StyleSheet.flatten(scrim.props.style).height
  const share = typeof height === 'string' ? parseFloat(height) / 100 : 1
  const colors: string[] = scrim.props.colors
  const locations: number[] = scrim.props.locations ?? colors.map((_, i) => i / (colors.length - 1))
  const stops = colors.map((c, i) => ({ at: locations[i], a: rgba(c).a }))
  return { box: { top: CARD_H * (1 - share), height: CARD_H * share }, stops }
}

const overlineAlpha = () => {
  const c = StyleSheet.flatten(screen.getByText('FEATURED · MARKET', { includeHiddenElements: true }).props.style).color as string
  return c.startsWith('rgba') ? rgba(c).a : 1
}

it('the lead: the overline holds 4.5:1 and the title 3:1 over a pure-white frame', async () => {
  await render(<View><EventCard kind="hero" layout="lead" title="T" time="Sat · 7:30 PM" venue="V" overline="Featured · Market" testID="l" /></View>)
  const { box, stops } = rendered('l')
  expect(worst(OVERLINE_TOP, box, stops, overlineAlpha())).toBeGreaterThanOrEqual(4.5)
  expect(worst(TITLE_TOP, box, stops, 1)).toBeGreaterThanOrEqual(3)
})

it('at the largest text the words climb to ~26% of the card (drive, AX5): the scrim rises earlier and still holds', async () => {
  const window = Dimensions.get('window')
  await act(async () => Dimensions.set({ window: { ...window, fontScale: 2 }, screen: { ...window, fontScale: 2 } }))
  await render(<View><EventCard kind="hero" layout="lead" title="T" time="Sat · 7:30 PM" venue="V" overline="Featured · Market" testID="l" /></View>)
  const { box, stops } = rendered('l')
  // Measured on the iOS sim at AX5: the overline from y 66, the title's top line from y 86 of 256.
  expect(worst(66, box, stops, overlineAlpha())).toBeGreaterThanOrEqual(4.5)
  expect(worst(86, box, stops, 1)).toBeGreaterThanOrEqual(3)
  await act(async () => Dimensions.set({ window, screen: window }))
})

it('control: today’s scrim (0 → 88% over the lower 70%, overline 78%) fails both, as the board measured', () => {
  const box = { top: CARD_H * 0.3, height: CARD_H * 0.7 }
  const stops = [{ at: 0, a: 0 }, { at: 1, a: PHOTO_SCRIM.foot }]
  expect(worst(OVERLINE_TOP, box, stops, 0.78)).toBeLessThan(1.5)
  expect(worst(TITLE_TOP, box, stops, 1)).toBeLessThan(3)
})

it('the DS hero elsewhere keeps its 62% scrim (no rotation there)', async () => {
  await render(<EventCard kind="hero" title="T" time="9 PM" venue="V" testID="h" />)
  expect(StyleSheet.flatten(screen.getByTestId('h-scrim', { includeHiddenElements: true }).props.style).height).toBe('62%')
})

it('the lead’s title takes three lines (pulse-media 07, the long-title case); two at large text; the DS hero keeps two', async () => {
  const LONG = 'Thiruvananthapuram Indie Makers Night Market and Late Supper Club Takeover'
  const window = Dimensions.get('window')
  await act(async () => Dimensions.set({ window: { ...window, fontScale: 1 }, screen: { ...window, fontScale: 1 } }))
  await render(<EventCard kind="hero" layout="lead" title={LONG} time="Sat · 7:30 PM" venue="V" testID="l" />)
  expect(screen.getByText(LONG, { includeHiddenElements: true }).props.numberOfLines).toBe(3)
  await act(async () => Dimensions.set({ window: { ...window, fontScale: 2 }, screen: { ...window, fontScale: 2 } }))
  expect(screen.getByText(LONG, { includeHiddenElements: true }).props.numberOfLines).toBe(2)
  await act(async () => Dimensions.set({ window, screen: window }))
  // The control: a hero elsewhere.
  await render(<EventCard kind="hero" title={LONG} time="9 PM" venue="V" testID="h" />)
  expect(screen.getByText(LONG, { includeHiddenElements: true }).props.numberOfLines).toBe(2)
})

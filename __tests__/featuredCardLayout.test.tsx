/*
 * The tab layout is imported for `tabBarTop` only; what it pulls in that needs
 * a native module or a server is stubbed (same stubs as `roomStageOrigin`).
 */
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
)
jest.mock('../lib/apiClient', () => ({ apiClient: {} }))
jest.mock('../lib/socketClient', () => ({}))
jest.mock('../components/blendn/BlendnScreen', () => ({ BlendnScreen: () => null }))
jest.mock('expo-router/js-tabs', () => ({ Tabs: () => null }))
// FeaturedCard draws media through expo-video, which Jest cannot load; only the layout is used.
jest.mock('../components/pulse/FeedMedia', () => ({ FeedMedia: () => null }))

import { Dimensions } from 'react-native'

import { TAB_BAR_CLEARANCE, tabBarTop } from '../app/(tabs)/_layout'
import { GUTTER, SPACE } from '../lib/theme'

/**
 * The Featured card never runs under the tab bar.
 *
 * `featuredCardLayout` fits photo plus words into the space between the header
 * and the bar. The failure this pins was live: on a short phone, or with a
 * banner above the header, the card's date and venue slid under the navigation
 * while every internal dimension of the card was still correct. It is called
 * with the real `tabBarTop` at real device sizes, so a change to the bar, the
 * header chrome or the card's own terms moves the result rather than a copy of
 * the arithmetic kept in a test.
 *
 * `FeaturedCard` reads the screen width once, at import, so each device loads
 * a fresh copy under its own width.
 */
type Card = typeof import('../components/pulse/FeaturedCard')

const DEVICES = [
  { name: 'iPhone 17 Pro Max', width: 440, height: 956, top: 62, bottom: 34 },
  { name: 'iPhone 15/16', width: 390, height: 844, top: 47, bottom: 34 },
  { name: 'SE: no safe insets, short screen', width: 375, height: 667, top: 20, bottom: 0 },
]

function cardFor(width: number, height: number): Card {
  let card!: Card
  jest.isolateModules(() => {
    jest
      .spyOn(Dimensions, 'get')
      .mockReturnValue({ width, height, scale: 3, fontScale: 1 })
    card = require('../components/pulse/FeaturedCard')
  })
  return card
}

afterEach(() => jest.restoreAllMocks())

describe('featuredCardLayout', () => {
  it.each(DEVICES)('fits the card above the bar on $name', ({ width, height, top, bottom }) => {
    const { featuredCardLayout, CHROME_ABOVE_CARD } = cardFor(width, height)
    const barTop = tabBarTop(height, bottom)
    const l = featuredCardLayout({ top, bottom }, barTop)
    expect(top + CHROME_ABOVE_CARD + l.height).toBeLessThanOrEqual(barTop)
    expect(l.width).toBeGreaterThan(0)
  })

  it('starts on the page margin, whatever the size', () => {
    const { featuredCardLayout, FEATURED_ROW_INSET } = cardFor(390, 844)
    expect(featuredCardLayout({ top: 47, bottom: 34 }, tabBarTop(844, 34)).inset).toBe(GUTTER)
    expect(FEATURED_ROW_INSET).toBe(GUTTER)
  })

  it('never exceeds the peeking width, or the solo width when alone', () => {
    const { featuredCardLayout, FEATURED_CARD_WIDTH, FEATURED_CARD_SOLO } = cardFor(390, 844)
    const roomy = { top: 0, bottom: 0 }
    expect(featuredCardLayout(roomy, 5000).width).toBe(FEATURED_CARD_WIDTH)
    expect(featuredCardLayout(roomy, 5000, true).width).toBe(FEATURED_CARD_SOLO)
    // The peek leaves the next card showing at the edge.
    expect(FEATURED_CARD_WIDTH).toBeLessThan(FEATURED_CARD_SOLO)
  })

  it('makes room for a banner above the header by shrinking, not by running under the bar', () => {
    // "You're in San Francisco — nothing here yet" once pushed the card's date
    // and venue under the bar: the fit assumed nothing sat above the header.
    const { featuredCardLayout, CHROME_ABOVE_CARD } = cardFor(390, 844)
    const insets = { top: 47, bottom: 34 }
    const barTop = tabBarTop(844, 34)
    const plain = featuredCardLayout(insets, barTop)
    const banner = featuredCardLayout(insets, barTop, false, 40)
    expect(banner.height).toBeLessThan(plain.height)
    // The clamp binds here (the card is narrower than its cap), so the daylight
    // above the bar is the clamp's own, not a side effect of the width cap.
    expect(insets.top + CHROME_ABOVE_CARD + 40 + banner.height + SPACE.xl).toBeLessThanOrEqual(barTop)
  })

  it('floors the card at 60% of its width instead of shrinking to a thumbnail', () => {
    // A stack of banners pushes the card down the page rather than crushing it.
    const { featuredCardLayout, FEATURED_CARD_WIDTH } = cardFor(390, 844)
    const l = featuredCardLayout({ top: 47, bottom: 34 }, tabBarTop(844, 34), false, 2000)
    expect(l.width).toBe(Math.round(FEATURED_CARD_WIDTH * 0.6))
  })

  it('carries the words under the photo in its height', () => {
    const { featuredCardLayout, FEATURED_BODY_HEIGHT } = cardFor(390, 844)
    const l = featuredCardLayout({ top: 47, bottom: 34 }, tabBarTop(844, 34))
    expect(l.height - l.photoHeight).toBe(FEATURED_BODY_HEIGHT)
  })
})

describe('the tab bar', () => {
  it('is as tall as TAB_BAR_CLEARANCE claims, so scrolls that reserve it do not drift', () => {
    /*
     * Seating the centre button made the disc, not the icon-plus-label column,
     * the row's tallest child: the bar grew from 100 to 108 while
     * `TAB_BAR_CLEARANCE` stayed 88. Padding tolerated the drift; the Pulse's
     * hero card, sized against the bar's real top edge, did not. A home-indicator
     * phone is the case the constant is written for.
     */
    expect(956 - tabBarTop(956, 34)).toBe(TAB_BAR_CLEARANCE)
    expect(844 - tabBarTop(844, 34)).toBe(TAB_BAR_CLEARANCE)
  })
})

/*
 * Banter's live room card with no cover is the brand orbs on ink, held still in a list, as the Scene and Room info draw a
 * room with nothing to show (r7 M6): never a flat grey card. With a cover, the photograph.
 */
import { render, screen } from '@testing-library/react-native'
import React from 'react'
import { StyleSheet } from 'react-native'

import { BanterRow, BlendLiveCard, LiveHero } from '../components/banter/BanterParts'
import { CONTROL_FONT_CAP, HueProvider } from '../components/ds/shared'
import { COLOR, FONT_FAMILY, MAX_FONT_SCALE } from '../lib/design/tokens'
import { AX_XXXL, atScale, clipped, resetScale, textNodes, uncapped } from './helpers/togetherAx'

jest.mock('expo-linear-gradient', () => {
  const { View } = jest.requireActual('react-native')
  return { LinearGradient: (props: object) => <View {...props} /> }
})
jest.mock('../lib/apiClient', () => ({ apiClient: {} }))

const card = (coverUrl: string | null) => (
  <LiveHero title="Vinyl Night" coverUrl={coverUrl} count={12} line={null} unread={0} muted={false} onPress={() => {}} testID="h" />
)

it('no cover: the brand orbs', async () => {
  await render(card(null))
  expect(screen.getByTestId('h-orbs', { includeHiddenElements: true })).toBeTruthy()
})

it('a cover: the photograph, no orbs', async () => {
  await render(card('https://x/y.jpg'))
  expect(screen.queryByTestId('h-orbs', { includeHiddenElements: true })).toBeNull()
})

describe('at AX XXXL (TG-03)', () => {
  beforeEach(() => atScale(AX_XXXL))
  afterEach(resetScale)
  const LONG = 'The Very Long Saturday Night Vinyl and Natural Wine Social at the Old Brewery'

  it('Live now: the title takes two lines at its cap, nothing is uncapped, and the card grows rather than clips', async () => {
    await render(<LiveHero title={LONG} coverUrl={null} count={483} line="Asha: see you by the stage" unread={3} muted onPress={() => {}} testID="h" />)
    const title = screen.getByText(LONG)
    expect(title.props.numberOfLines).toBe(2)
    expect(title.props.maxFontSizeMultiplier).toBe(MAX_FONT_SCALE.heading)
    // The count's digits are the DS RollingNumber, which sets its role's cap on an Animated.Text the test renderer drops.
    const notDigit = (t: string) => !/^\["\d"\]$/.test(t)
    expect(uncapped(screen.toJSON() as never).filter(notDigit)).toEqual([])
    expect(clipped(screen.toJSON() as never).filter(notDigit)).toEqual([])
  })

  it('a Blend open tonight: the close time is a tag at the control cap, the rest at their roles', async () => {
    await render(<BlendLiveCard title={LONG} seeds={['a', 'b']} closesAt="2026-10-25T22:30:00.000Z" unread={0} onPress={() => {}} />)
    expect(uncapped(screen.toJSON() as never)).toEqual([])
    expect(screen.getByText(LONG).props.numberOfLines).toBe(2)
    const time = textNodes(screen.toJSON() as never).filter((n) => JSON.stringify(n.props.style).includes('GeistMono'))
    expect(time.length).toBeGreaterThan(0)
    for (const t of time) expect(t.props.maxFontSizeMultiplier).toBe(CONTROL_FONT_CAP)
  })
})

describe('the Banter list’s rows (TG-12)', () => {
  const row = (time: string, unread = true) => (
    <HueProvider value="rose">
      <BanterRow face={{ kind: 'room', cover: null }} title="Vinyl Night" line={{ kind: 'text', text: 'see you there' }} time={time} unread={unread} testID="r" />
    </HueProvider>
  )
  const faceOf = (node: { props: Record<string, unknown> }) => (StyleSheet.flatten(node.props.style as never) as { fontFamily?: string }).fontFamily

  it('an unread dot is the world’s rose, never white (white is for counts)', async () => {
    await render(row('7h'))
    expect(StyleSheet.flatten(screen.getByTestId('r-dot', { includeHiddenElements: true }).props.style).backgroundColor).toBe(COLOR.selectionRoseGlyph)
  })

  it('a word is in the sans and digits are in Geist Mono, so one column never mixes faces in a word', async () => {
    await render(row('Yesterday'))
    expect(faceOf(screen.getByText('Yesterday'))).not.toBe(FONT_FAMILY.mono[500])
    await render(row('10h'))
    expect(faceOf(screen.getByText('10h'))).toBe(FONT_FAMILY.mono[500])
    await render(row('4 Oct'))
    expect(faceOf(screen.getByText('4'))).toBe(FONT_FAMILY.mono[500])
    expect(textNodes(screen.toJSON() as never).every((n) => n.props.maxFontSizeMultiplier === CONTROL_FONT_CAP || n.props.maxFontSizeMultiplier === MAX_FONT_SCALE.bodyStrong || n.props.maxFontSizeMultiplier === MAX_FONT_SCALE.meta)).toBe(true)
  })
})

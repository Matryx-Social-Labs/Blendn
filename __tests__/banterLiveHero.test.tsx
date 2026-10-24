/*
 * Banter's live room card with no cover is the brand orbs on ink, held still in a list, as the Scene and Room info draw a
 * room with nothing to show (r7 M6): never a flat grey card. With a cover, the photograph.
 */
import { render, screen } from '@testing-library/react-native'
import React from 'react'

import { BlendLiveCard, LiveHero } from '../components/banter/BanterParts'
import { CONTROL_FONT_CAP } from '../components/ds/shared'
import { MAX_FONT_SCALE } from '../lib/design/tokens'
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

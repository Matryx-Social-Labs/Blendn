/** The Lobby's cards draw their sentence in the lede role, 15/22, as the board does (`.lro`, `.lend`; owner 2026-11-06). */
import { render, screen } from '@testing-library/react-native'
import { StyleSheet } from 'react-native'

import { ClosedCard, LiveEmptyCard, LobbyGate, ReadOnlyBanner } from '../components/board/LobbyParts'
import { MAX_FONT_SCALE } from '../lib/design/tokens'

const lineHeightOf = (text: RegExp) => StyleSheet.flatten(screen.getByText(text).props.style).lineHeight

it('draws the closed, read-only and live-empty sentences at 15/22, and leaves the gate’s at 15/20', async () => {
  await render(<ClosedCard />)
  expect(lineHeightOf(/close a day after the event ends/)).toBe(22)
  expect(StyleSheet.flatten(screen.getByText(/close a day after the event ends/).props.style).fontSize).toBe(15)
  expect(screen.getByText(/close a day after the event ends/).props.maxFontSizeMultiplier).toBe(MAX_FONT_SCALE.lede)
  await render(<ReadOnlyBanner onOpenRoom={() => {}} />)
  expect(lineHeightOf(/read-only now/)).toBe(22)
  await render(<LiveEmptyCard onOpenRoom={() => {}} />)
  expect(lineHeightOf(/^The room is open\.$/)).toBe(22)
  await render(<LobbyGate gate="going" onPress={() => {}} />)
  expect(lineHeightOf(/You can read along now/)).toBe(20)
})

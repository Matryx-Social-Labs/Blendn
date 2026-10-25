/*
 * TG-14 (B-R8): Tonight and the Room are rose (BlendnScreen's HueProvider), and the stage drew the brand orbs, an ember
 * and violet glow under rose controls. The stage's glow takes the screen's hue. Negative control: without `tint` on the
 * stage's Orbs this fails.
 */
import { render, screen } from '@testing-library/react-native'
import React from 'react'

import { RoomStage } from '../components/blendn/RoomStage'
import { HueProvider } from '../components/ds/shared'
import { COLOR } from '../lib/design/tokens'

jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 59, bottom: 34, left: 0, right: 0 }) }))
const mockOrbs = jest.fn((_: { tint?: string }) => null)
jest.mock('../components/ds/Orbs', () => ({ Orbs: (props: { tint?: string }) => mockOrbs(props) }))

it('the stage’s glow is the screen’s hue: rose under the Blend’n overlay', async () => {
  await render(
    <HueProvider value="rose">
      <RoomStage onClosed={jest.fn()}>{null}</RoomStage>
    </HueProvider>,
  )
  expect(mockOrbs).toHaveBeenCalled()
  expect(mockOrbs.mock.calls.every(([props]) => props.tint === COLOR.brandRose)).toBe(true)
  expect(screen.toJSON()).toBeTruthy()
})

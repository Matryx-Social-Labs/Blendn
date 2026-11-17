/*
 * The live dock (venue page): a long venue name in the live pill squeezed "Open the room" to a sliver of its glyph — the
 * button had `flex: 1` (a zero basis), so it got only what the pill left (buttons-c drive, iOS, 2026-11-17). The action
 * keeps its whole label; the pill gives way.
 */
import { render, screen } from '@testing-library/react-native'
import React from 'react'
import { StyleSheet } from 'react-native'

import { VenueDock } from '../components/venue/VenueDock'

jest.mock('expo-router', () => ({ ...jest.requireActual('expo-router'), useIsFocused: () => true }))
jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default)
jest.mock('expo-glass-effect', () => {
  const { View } = jest.requireActual('react-native')
  return { GlassView: (props: object) => <View {...props} />, isGlassEffectAPIAvailable: jest.fn(() => true), isLiquidGlassAvailable: jest.fn(() => true) }
})

const live = {
  open: true,
  closedReason: null,
  eventId: null,
  liveNow: null,
  youAreLive: true,
  expiresAt: new Date(Date.now() + 20 * 60_000).toISOString(),
  chatGroupId: 'g1',
} as never

it('Open the room never shrinks below its label; it grows into the rest of the row', async () => {
  const noop = jest.fn()
  await render(
    <VenueDock
      mode={{ kind: 'live' }}
      name="Thiruvananthapuram Brewing Company and Kitchen"
      live={live}
      eventTitle={null}
      busy={false}
      onGoLive={noop}
      onPickAnother={noop}
      onOpenRoom={noop}
      onPill={noop}
      onLeave={noop}
      onEvent={noop}
      onZero={noop}
      onHeight={noop}
    />
  )
  const wrap = StyleSheet.flatten(screen.getByTestId('venue-open-room').parent?.props.style)
  expect(wrap).toMatchObject({ flexGrow: 1, flexShrink: 0 })
  // Control: the zero basis that squeezed it is gone.
  expect(wrap.flexBasis).not.toBe(0)
  expect(wrap.flex).toBeUndefined()
})

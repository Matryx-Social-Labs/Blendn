/*
 * The venue page's dock while you are live (venue live pill, option B, owner 2026-11-17, SCRUM-1063): the event page's
 * checked-in line. "● Live · 2h 45m" over "Extend or stop" on the left, Open the room on the right; in the last five
 * minutes "● Ending · 4:59" over "Extend". The left side opens the live sheet; there is no Leave button.
 *
 * Board: ~/blendn-design-export/mockups/redesign-2026-11/venue-live-pill/ (worst case: Saint-Jean-sur-Richelieu Craft
 * Brewing Co., 2h 45m left, the largest text, iOS 402 and Android 360).
 */
import { fireEvent, render, screen } from '@testing-library/react-native'
import { readFileSync } from 'fs'
import { join } from 'path'
import React from 'react'
import { StyleSheet } from 'react-native'

import { VenueDock } from '../components/venue/VenueDock'
import { COLOR, FONT_FAMILY, SIZE, SPACE } from '../lib/design/tokens'
import { H } from '../lib/haptics'
import { atScale, AX_XXXL, resetScale } from './helpers/ax'

jest.mock('expo-router', () => ({ ...jest.requireActual('expo-router'), useIsFocused: () => true }))
jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default)
jest.mock('expo-glass-effect', () => {
  const { View } = jest.requireActual('react-native')
  return { GlassView: (props: object) => <View {...props} />, isGlassEffectAPIAvailable: jest.fn(() => true), isLiquidGlassAvailable: jest.fn(() => true) }
})
jest.mock('expo-linear-gradient', () => {
  const { View } = jest.requireActual('react-native')
  return { LinearGradient: (props: object) => <View {...props} /> }
})

const NOW = Date.parse('2026-11-17T20:00:00.000Z')
const LONG = 'Saint-Jean-sur-Richelieu Craft Brewing Co.'
const inMs = (ms: number) => new Date(NOW + ms).toISOString()
const MIN = 60_000

beforeEach(() => {
  jest.useFakeTimers({ now: NOW })
  jest.spyOn(H, 'primary').mockImplementation(() => {})
})
afterEach(() => {
  jest.useRealTimers()
  resetScale()
})

const live = (over: object = {}) => ({ open: true, closedReason: null, eventId: null, liveNow: null, youAreLive: true, expiresAt: inMs(20 * MIN), chatGroupId: 'g1', ...over }) as never

async function dock(over: object = {}, props: Partial<React.ComponentProps<typeof VenueDock>> = {}) {
  const noop = jest.fn()
  await render(
    <VenueDock
      mode={{ kind: 'live' }}
      name={LONG}
      live={live(over)}
      eventTitle={null}
      busy={false}
      onGoLive={noop}
      onPickAnother={noop}
      onOpenRoom={noop}
      onPill={noop}
      onEvent={noop}
      onZero={noop}
      onHeight={noop}
      {...props}
    />
  )
}

const flat = (id: string) => StyleSheet.flatten(screen.getByTestId(id, { includeHiddenElements: true }).props.style)

describe('the state line', () => {
  beforeEach(() => atScale(1, 360))

  it('live: "● Live · 20 min" over "Extend or stop", read as one control that names the place', async () => {
    await dock()
    expect(screen.getByTestId('venue-live-state')).toHaveTextContent('Live ·', { exact: false })
    expect(screen.getByTestId('venue-live-clock')).toHaveTextContent('20 min')
    expect(screen.getByTestId('venue-live-sub')).toHaveTextContent('Extend or stop')
    expect(flat('venue-live-dot').backgroundColor).toBe(COLOR.live)
    const state = screen.getByRole('button', { name: `Live at ${LONG}, 20 minutes left. Extend or stop` })
    expect(state.props.accessibilityHint).toBe('Opens your live time')
  })

  it('a window over an hour reads "2h 45m"; Extend would not move its end, so the line offers Stop', async () => {
    await dock({ expiresAt: inMs(165 * MIN) })
    expect(screen.getByTestId('venue-live-clock')).toHaveTextContent('2h 45m')
    expect(screen.getByTestId('venue-live-sub')).toHaveTextContent('Stop')
    expect(screen.getByRole('button', { name: `Live at ${LONG}, 2 hours 45 minutes left. Stop` })).toBeTruthy()
  })

  it('the last five minutes: "● Ending · 4:59" in the warning dot, the clock in Geist Mono 700, over "Extend"', async () => {
    await dock({ expiresAt: inMs(4 * MIN + 59_000) })
    expect(screen.getByTestId('venue-live-state')).toHaveTextContent('Ending ·', { exact: false })
    expect(screen.getByTestId('venue-live-clock')).toHaveTextContent('4:59')
    expect(flat('venue-live-clock').fontFamily).toBe(FONT_FAMILY.mono[700])
    expect(screen.getByTestId('venue-live-sub')).toHaveTextContent('Extend')
    expect(flat('venue-live-dot').backgroundColor).toBe(COLOR.warning)
    // The space before the time is a margin, not a trailing space: Android drops a trailing space from a squeezed line
    // and drew "Ending ·4:16" at 360 (drive, 2026-11-17).
    expect(screen.getByTestId('venue-live-state').props.children).toBe('Ending ·')
    expect(flat('venue-live-clock').marginLeft).toBe(SPACE.xs)
    // Never colour alone: the word changes with the dot.
    expect(screen.getByRole('button', { name: `Live at ${LONG}, 4:59 left, ending soon. Extend` })).toBeTruthy()
  })

  it('a stay says staying, with no clock to cut', async () => {
    await dock({ stay: true })
    expect(screen.getByTestId('venue-live-state')).toHaveTextContent('Live · staying')
    expect(screen.queryByTestId('venue-live-clock')).toBeNull()
    expect(screen.getByTestId('venue-live-sub')).toHaveTextContent('Stop')
  })

  it('the state opens the live sheet; in the last five minutes with the Extend cue', async () => {
    const onPill = jest.fn()
    await dock({ expiresAt: inMs(4 * MIN) }, { onPill })
    fireEvent.press(screen.getByTestId('venue-live-left'))
    expect(onPill).toHaveBeenCalledTimes(1)
    expect(H.primary).toHaveBeenCalledTimes(1)
  })

  it('Open the room is the one lit action; with no room yet there is no action at all', async () => {
    await dock()
    expect(screen.getByRole('button', { name: 'Open the room' })).toBeTruthy()
    await dock({ chatGroupId: null })
    expect(screen.queryByRole('button', { name: 'Open the room' })).toBeNull()
  })
})

describe('the board’s geometry (B is drawn with md buttons in the standard dock)', () => {
  it('Open the room is md (48), and the dock keeps 16 over and the 24 gutter both sides: at 360 the dock button left “Endin… 2:19” (drive, 2026-11-17)', async () => {
    await atScale(1, 360)
    await dock({ expiresAt: inMs(4 * MIN) })
    expect(flat('venue-open-room').height).toBe(SIZE.control)
    expect(flat('venue-dock')).toMatchObject({ paddingTop: SPACE.lg, paddingHorizontal: SPACE.gutter })
    expect(flat('venue-dock').paddingRight).toBeUndefined()
  })
})

describe('Leave is gone (the owner, 2026-11-17: leaving is through the sheet)', () => {
  it('the live dock has no Leave button', async () => {
    await atScale(1, 402)
    await dock()
    expect(screen.queryByTestId('venue-leave')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Leave' })).toBeNull()
  })

  it('and no Leave, old pill or chips left in the source', () => {
    const src = readFileSync(join(__dirname, '..', 'components', 'venue', 'VenueDock.tsx'), 'utf8')
    for (const gone of ['onLeave', 'venue-leave', 'venue-live-pill', 'LivePill', 'ENDING_CHIP', 'EXTEND_CHIP', 'label="Leave"']) expect(src).not.toContain(gone)
  })
})

describe('the time is never cut (worst case: the long name, 2h 45m, 360 and the largest text)', () => {
  /** The clock is its own slot: never a line limit, never shrinks. The state's word is what gives way. */
  const timeWhole = () => {
    const clock = screen.getByTestId('venue-live-clock')
    expect(clock.props.numberOfLines).toBeUndefined()
    expect(flat('venue-live-clock').flexShrink).toBe(0)
    expect(flat('venue-live-state').flexShrink).toBe(1)
    // The place's name is the page's title above: it is not in the dock's words at all.
    expect(screen.getByTestId('venue-live-left')).not.toHaveTextContent(LONG, { exact: false })
  }

  for (const [width, scale] of [[360, 1], [402, 1], [360, 1.3], [360, AX_XXXL], [402, AX_XXXL]] as const) {
    it(`${width} wide at ${scale}×`, async () => {
      await atScale(scale, width)
      await dock({ expiresAt: inMs(165 * MIN) })
      timeWhole()
    })
  }

  it('the last five minutes too, at 360', async () => {
    await atScale(1, 360)
    await dock({ expiresAt: inMs(4 * MIN + 59_000) })
    timeWhole()
  })

  it('from 1.2× (TWO_LINE_NAMES_FROM) it stacks already: at 1.3 on Android 360 the row kept the time but cut the word to “..” (drive, 2026-11-17)', async () => {
    await atScale(1.3, 360)
    await dock({ expiresAt: inMs(16 * MIN) })
    expect(flat('venue-live')).toMatchObject({ flexDirection: 'column' })
    expect(screen.getByTestId('venue-live-state').props.numberOfLines).toBeUndefined()
    expect(screen.getByTestId('venue-live-sub').props.numberOfLines).toBeUndefined()
    // Control: at 1× it is still the one row.
    await atScale(1, 360)
    await dock({ expiresAt: inMs(16 * MIN) })
    expect(flat('venue-live').flexDirection).toBe('row')
  })

  it('at the largest text the line stacks over a full-width Open the room (DockRow’s AX rule), the state on as many lines as it needs', async () => {
    await atScale(AX_XXXL, 360)
    await dock({ expiresAt: inMs(165 * MIN) })
    expect(flat('venue-live')).toMatchObject({ flexDirection: 'column' })
    expect(screen.getByTestId('venue-live-state').props.numberOfLines).toBeUndefined()
  })
})

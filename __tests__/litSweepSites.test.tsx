/*
 * The sweep (foundations C, part 2, batch L3): each swept call site draws a lit action in its screen's hue, where the audit said so,
 * and the ones the audit kept quiet or kept as the screen's one primary stay so. The source pin in `litSweep.test.ts` says no new
 * white `strong` lands; this says what the swept ones became.
 */
import { fireEvent, render, screen } from '@testing-library/react-native'
import React from 'react'
import { AccessibilityInfo, StyleSheet } from 'react-native'

import { RequestCard } from '../components/banter/BanterParts'
import { InviteRow } from '../components/crews/InviteRow'
import { GoLiveSheet } from '../components/ds/GoLiveSheet'
import { Sheet } from '../components/ds/Sheet'
import { HueProvider, SELECTION, type Hue } from '../components/ds/shared'
import { StateScreen } from '../components/ds/StateScreen'
import { TopBar } from '../components/ds/TopBar'
import { IncomingRequestRow } from '../components/friends/IncomingRequestRow'
import { COLOR, SIZE } from '../lib/design/tokens'
import { H } from '../lib/haptics'

jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default)
jest.mock('react-native-reanimated', () => ({ ...jest.requireActual('react-native-reanimated'), __esModule: true, useReducedMotion: jest.fn(() => false) }))
jest.mock('expo-glass-effect', () => {
  const { View } = jest.requireActual('react-native')
  return { GlassView: (props: object) => <View {...props} />, isGlassEffectAPIAvailable: jest.fn(() => true), isLiquidGlassAvailable: jest.fn(() => true) }
})
jest.mock('expo-linear-gradient', () => {
  const { View } = jest.requireActual('react-native')
  return { LinearGradient: (props: object) => <View {...props} testID="gradient" /> }
})
jest.mock('../components/OptimizedImage', () => ({ OptimizedImage: () => null }))

const flat = (id: string) => StyleSheet.flatten(screen.getByTestId(id, { includeHiddenElements: true }).props.style)
const button = (name: string) => StyleSheet.flatten(screen.getByRole('button', { name }).props.style)
const world = (hue: Hue, node: React.ReactElement) => <HueProvider value={hue}>{node}</HueProvider>
/** A lit Button draws its hue's fill, and a quiet one does not. */
const isLit = (name: string, hue: Hue) => button(name).backgroundColor === SELECTION[hue].fill

beforeEach(() => {
  jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(false)
  for (const k of Object.keys(H)) jest.spyOn(H, k as keyof typeof H).mockImplementation(() => {})
})

describe('Friends › Requests (rose)', () => {
  it('Accept is lit with its glyph at 48, beside a quiet Not now', async () => {
    const request = { id: 'r1', createdAt: '2026-10-22T10:00:00Z', person: { userId: 'u1', name: 'Priya Raman', photo: null } } as never
    await render(world('rose', <IncomingRequestRow request={request} busy={false} onRespond={jest.fn()} />))
    expect(isLit('Accept Priya Raman', 'rose')).toBe(true)
    expect(button('Accept Priya Raman').height).toBe(SIZE.control)
    expect(isLit('Not now, Priya Raman', 'rose')).toBe(false)
    expect(JSON.stringify(screen.toJSON())).toContain(SELECTION.rose.glyph)
  })
})

describe('Banter (rose)', () => {
  const card = (accept?: string) =>
    render(world('rose', <RequestCard face={null} name="Nebula" note="asked you to join" time="3 h" accept={accept} onAccept={jest.fn()} onDecline={jest.fn()} testID="r" />))

  it('Accept and Join are lit, Decline is quiet, and neither plays a press haptic', async () => {
    await card()
    expect(flat('r-accept').backgroundColor).toBe(SELECTION.rose.fill)
    expect(flat('r-decline').backgroundColor).not.toBe(SELECTION.rose.fill)
    await fireEvent(screen.getByTestId('r-accept'), 'pressIn')
    expect(H.primary).not.toHaveBeenCalled()
    await card('Join')
    expect(flat('r-accept').backgroundColor).toBe(SELECTION.rose.fill)
  })
})

describe('Crews › Invites (rose)', () => {
  it('See invite is lit; a lapsed invite has no action', async () => {
    const invite = { id: 'i1', crewId: 'c1', name: 'The Usual Suspects', invitedBy: 'Aisha', invitedAt: new Date().toISOString(), emblemSeed: 'x' } as never
    await render(world('rose', <InviteRow row={{ invite, lapsed: false }} onSee={jest.fn()} />))
    expect(isLit('See invite, The Usual Suspects', 'rose')).toBe(true)
    await render(world('rose', <InviteRow row={{ invite, lapsed: true }} onSee={jest.fn()} />))
    expect(screen.queryAllByRole('button', { name: /See invite/ })).toHaveLength(0)
  })
})

describe('a sheet’s lit action', () => {
  const sheet = (hue: Hue) =>
    render(
      world(
        hue,
        <Sheet
          visible
          onClose={jest.fn()}
          title="Not quite there yet"
          actions={[
            { label: 'Cancel', kind: 'tertiary', onPress: jest.fn() },
            { label: 'Close', kind: 'secondary', onPress: jest.fn() },
            { label: 'Open Maps', kind: 'lit', onPress: jest.fn() },
          ]}
          testID="s"
        />
      )
    )

  it('sits first, in its hue, and the whole stack is 48, never the primary’s 56', async () => {
    await sheet('ember')
    const names = screen.getAllByRole('button').map((b) => b.props.accessibilityLabel)
    expect(names.indexOf('Open Maps')).toBeLessThan(names.indexOf('Close'))
    expect(isLit('Open Maps', 'ember')).toBe(true)
    for (const name of ['Open Maps', 'Close']) expect(button(name).height).toBe(SIZE.control)
  })

  it('a sheet with no lit action keeps its 56', async () => {
    await render(<Sheet visible onClose={jest.fn()} title="t" actions={[{ label: 'Close', kind: 'secondary', onPress: jest.fn() }]} />)
    expect(button('Close').height).toBe(SIZE.primary)
  })
})

describe('a state screen’s recovery', () => {
  it('the first action is lit, the rest quiet, all at 48', async () => {
    await render(
      world(
        'ember',
        <StateScreen
          icon="search"
          title="Nothing here"
          actions={[
            { label: 'Change city', kind: 'lit', onPress: jest.fn() },
            { label: 'Refresh', kind: 'secondary', onPress: jest.fn() },
          ]}
        />
      )
    )
    expect(isLit('Change city', 'ember')).toBe(true)
    expect(isLit('Refresh', 'ember')).toBe(false)
    expect(button('Change city').height).toBe(SIZE.control)
    expect(button('Refresh').height).toBe(SIZE.control)
  })
})

describe('Go live refusals (ember)', () => {
  const refusal = (r: React.ComponentProps<typeof GoLiveSheet>['refusal']) =>
    render(<GoLiveSheet visible onClose={jest.fn()} venue="Toit" pseudonym="Night Cat" choice={45} onChoice={jest.fn()} onGoLive={jest.fn()} refusal={r} onRefusalAction={jest.fn()} testID="g" />)

  it('Close is quiet: it is a close, not a yes', async () => {
    await refusal('noArea')
    expect(isLit('Close', 'ember')).toBe(false)
    expect(button('Close').backgroundColor).not.toBe(COLOR.textPrimary)
  })

  it('the refusal’s way on is lit', async () => {
    await refusal('notHere')
    expect(isLit('Open Maps', 'ember')).toBe(true)
  })
})

describe('the sheet’s single commit stays the gradient', () => {
  it('Edit profile’s Save stays the screen’s gradient primary', async () => {
    await render(world('violet', <TopBar title="Edit profile" onBack={jest.fn()} save={{ onPress: jest.fn() }} />))
    expect(screen.queryByRole('button', { name: 'Save' })).toBeTruthy()
    expect(button('Save').backgroundColor).toBe('transparent')
    expect(screen.getAllByTestId('gradient').length).toBeGreaterThan(0)
  })
})

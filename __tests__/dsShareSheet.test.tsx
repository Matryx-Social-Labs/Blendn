/*
 * <ShareSheet> (guidelines/components/ShareSheet.html, Flow 16 · 16.1): the
 * card first, "This is what they'll see", then WhatsApp (the white disc,
 * first), Instagram Story, Copy link, More…. Copy carries no haptic and reads
 * "Copied" for 2 s; no WhatsApp drops it; unlisted shows the area only.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import React from 'react'
import { AccessibilityInfo, Platform, StyleSheet } from 'react-native'
import * as Reanimated from 'react-native-reanimated'

import type { ShareEvent } from '../components/ds/LinkPreviewCard'
import { ShareSheet } from '../components/ds/ShareSheet'
import { COLOR } from '../lib/design/tokens'
import { H } from '../lib/haptics'

jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default)
jest.mock('react-native-reanimated', () => {
  const actual = jest.requireActual('react-native-reanimated')
  return { ...actual, __esModule: true, useReducedMotion: jest.fn(() => false) }
})
jest.mock('expo-glass-effect', () => {
  const { View } = jest.requireActual('react-native')
  return { GlassView: (props: object) => <View {...props} />, isGlassEffectAPIAvailable: jest.fn(() => true), isLiquidGlassAvailable: jest.fn(() => true) }
})
jest.mock('expo-linear-gradient', () => {
  const { View } = jest.requireActual('react-native')
  return { LinearGradient: (props: object) => <View {...props} /> }
})

const reduceMotion = Reanimated.useReducedMotion as jest.Mock
const flat = (id: string) => StyleSheet.flatten(screen.getByTestId(id, { includeHiddenElements: true }).props.style)
const on = (os: 'ios' | 'android', version = 34) => {
  Object.defineProperty(Platform, 'OS', { value: os, configurable: true })
  Object.defineProperty(Platform, 'Version', { value: version, configurable: true })
}

const NEON: ShareEvent = {
  title: 'Neon Nights',
  date: { day: 'SAT', num: '04', month: 'OCT', time: '9:00 PM' },
  dateText: 'Sat 4 Oct, 9 PM',
  venue: 'Toit',
  area: 'Indiranagar',
  cover: 'https://example.com/cover.jpg',
  url: 'https://www.blendn.app/e/7f3a2c',
}

const sheet = (props: Partial<React.ComponentProps<typeof ShareSheet>> = {}) => (
  <ShareSheet
    visible
    onClose={jest.fn()}
    share={{ kind: 'event', event: NEON }}
    onWhatsApp={jest.fn()}
    onStory={jest.fn()}
    onCopy={jest.fn()}
    onMore={jest.fn()}
    testID="s"
    {...props}
  />
)

let spies: jest.SpyInstance[]
beforeEach(() => {
  jest.useFakeTimers()
  on('ios')
  reduceMotion.mockReturnValue(false)
  spies = Object.keys(H).map((k) => jest.spyOn(H, k as keyof typeof H).mockImplementation(() => {}))
})
afterEach(() => jest.useRealTimers())

describe('<ShareSheet>', () => {
  it('shows the card first and says what it is', async () => {
    await render(sheet())
    expect(screen.getByLabelText('This is what they’ll see: Neon Nights, Sat 4 Oct, 9 PM, Toit, Indiranagar')).toBeTruthy()
    expect(screen.getByText('This is what they’ll see')).toBeTruthy()
  })

  it('four actions, WhatsApp first on the lit disc (direction C: never the white one)', async () => {
    await render(sheet())
    const names = screen.getAllByRole('button').map((b) => b.props.accessibilityLabel)
    expect(names.slice(-4)).toEqual(['WhatsApp', 'Instagram Story', 'Copy link', 'More…'])
    expect(flat('s-whatsapp-disc')).toMatchObject({ backgroundColor: COLOR.selectionEmberFill, borderWidth: 1, borderColor: COLOR.brandOrange })
    expect(flat('s-story-disc').backgroundColor).toBe(COLOR.surface)
  })

  it('the message sent with the link', async () => {
    await render(sheet())
    expect(screen.getByText('MESSAGE SENT WITH THE LINK')).toBeTruthy()
    expect(screen.getByText('https://www.blendn.app/e/7f3a2c')).toBeTruthy()
  })

  it('Copy: no haptic, “Copied” for 2 s from the last copy, said once', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {})
    const onCopy = jest.fn()
    await render(sheet({ onCopy }))
    await fireEvent.press(screen.getByRole('button', { name: 'Copy link' }))
    expect(onCopy).toHaveBeenCalledTimes(1)
    for (const s of spies) expect(s).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Copied' })).toBeTruthy()
    expect(announce).toHaveBeenCalledWith('Copied')
    // Android 12 and below have no system confirmation: the label is a live region.
    expect(screen.getByText('Copied').props.accessibilityLiveRegion).toBe('polite')
    await act(async () => jest.advanceTimersByTime(1500))
    await fireEvent.press(screen.getByRole('button', { name: 'Copied' }))
    await act(async () => jest.advanceTimersByTime(1500))
    expect(screen.getByRole('button', { name: 'Copied' })).toBeTruthy()
    await act(async () => jest.advanceTimersByTime(600))
    expect(screen.getByRole('button', { name: 'Copy link' })).toBeTruthy()
  })

  it('Android 13+: the system confirms a copy, so we don’t', async () => {
    on('android', 33)
    await render(sheet())
    await fireEvent.press(screen.getByRole('button', { name: 'Copy link' }))
    expect(screen.queryByRole('button', { name: 'Copied' })).toBeNull()
  })

  it('WhatsApp and Story: H.primary on press-in; More…: H.select', async () => {
    await render(sheet())
    await fireEvent(screen.getByRole('button', { name: 'WhatsApp' }), 'pressIn')
    await fireEvent(screen.getByRole('button', { name: 'Instagram Story' }), 'pressIn')
    expect(H.primary).toHaveBeenCalledTimes(2)
    await fireEvent(screen.getByRole('button', { name: 'More…' }), 'pressIn')
    expect(H.primary).toHaveBeenCalledTimes(2)
    expect(H.select).toHaveBeenCalledTimes(1)
  })

  it('no WhatsApp installed: three actions', async () => {
    await render(sheet({ whatsApp: false }))
    expect(screen.queryByRole('button', { name: 'WhatsApp' })).toBeNull()
  })

  it('unlisted: the area only, in the line, the message, the card and what is read', async () => {
    await render(sheet({ share: { kind: 'event', event: { ...NEON, cover: null, unlisted: true } } }))
    expect(screen.queryByText(/Toit/, { includeHiddenElements: true })).toBeNull()
    expect(screen.getByLabelText('This is what they’ll see: Neon Nights, Sat 4 Oct, 9 PM, Indiranagar')).toBeTruthy()
  })

  it('a venue and an invite', async () => {
    await render(sheet({ share: { kind: 'venue', name: 'Toit', typeLabel: 'Brewery', area: 'Indiranagar', url: 'https://www.blendn.app/v/9c1e' } }))
    expect(screen.getByText('Brewery · Indiranagar')).toBeTruthy()
    await screen.unmount() // one sheet on screen at a time (lib/modalTurn): the first goes before the next
    await render(sheet({ share: { kind: 'invite', url: 'https://www.blendn.app/f/abc' } }))
    expect(screen.getByText('Your invite to Blend’n')).toBeTruthy()
    expect(screen.getByText('A link only you can send · no name on the card')).toBeTruthy()
  })
})

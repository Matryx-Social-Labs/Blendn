/*
 * <BroadcastNotice> (guidelines/components/BroadcastNotice.html, ROUND3 D 5.5):
 * full width, no tail, no creature; an announcement on surface with the
 * organiser's mark, a sponsored notice on sunken, labelled and quieter; an
 * image; a video that never autoplays, plays muted inline with a mute toggle,
 * never loops, and says so when it fails; no haptic.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import React from 'react'
import { AccessibilityInfo, StyleSheet } from 'react-native'

import { BroadcastNotice, spokenDuration } from '../components/ds/BroadcastNotice'
import { COLOR, MATERIAL } from '../lib/design/tokens'
import { H } from '../lib/haptics'

type FakePlayer = { muted: boolean; loop: boolean; play: jest.Mock; emit: (event: string, payload?: object) => void }
const players: FakePlayer[] = []

jest.mock('expo-video', () => {
  const React = jest.requireActual('react')
  const { View } = jest.requireActual('react-native')
  return {
    useVideoPlayer: (_source: string, setup?: (p: FakePlayer) => void) => {
      const [player] = React.useState(() => {
        const listeners: Record<string, (payload?: object) => void> = {}
        const p = {
          muted: false,
          loop: true,
          play: jest.fn(),
          addListener: (event: string, fn: (payload?: object) => void) => {
            listeners[event] = fn
            return { remove: () => delete listeners[event] }
          },
          emit: (event: string, payload?: object) => listeners[event]?.(payload),
        }
        setup?.(p)
        players.push(p)
        return p
      })
      return player
    },
    VideoView: (props: object) => <View {...props} testID="video-view" />,
  }
})
jest.mock('expo-glass-effect', () => {
  const { View } = jest.requireActual('react-native')
  return { GlassView: (props: object) => <View {...props} />, isGlassEffectAPIAvailable: () => true, isLiquidGlassAvailable: () => true }
})

const flat = (id: string) => StyleSheet.flatten(screen.getByTestId(id).props.style)
const latest = () => players[players.length - 1]
const VIDEO = { kind: 'video' as const, uri: 'https://cdn.example/clip.mp4', poster: 'https://cdn.example/poster.jpg', duration: '0:30' }

beforeEach(() => {
  players.length = 0
})

describe('spokenDuration', () => {
  it('reads m:ss as words', () => {
    expect(spokenDuration('0:30')).toBe('30 seconds')
    expect(spokenDuration('1:05')).toBe('1 minute 5 seconds')
    expect(spokenDuration('2:00')).toBe('2 minutes')
  })
})

describe('<BroadcastNotice>', () => {
  it('an announcement: surface, the organiser named in the label, read as one', async () => {
    await render(<BroadcastNotice kind="announcement" from="Toit" text="Last call for the terrace." time="10:02 PM" testID="b" />)
    expect(flat('b').backgroundColor).toBe(COLOR.surface)
    expect(screen.getByText('ANNOUNCEMENT · TOIT', { includeHiddenElements: true })).toBeTruthy()
    expect(screen.getByLabelText('Announcement from Toit: Last call for the terrace., 10:02 PM')).toBeTruthy()
  })

  it('sponsored: sunken, labelled, the text quieter', async () => {
    await render(<BroadcastNotice kind="sponsored" from="Bira 91" text="Two-for-one till 11." time="10:02 PM" testID="b" />)
    expect(flat('b').backgroundColor).toBe(COLOR.surfaceSunken)
    expect(screen.getByText('SPONSORED · BIRA 91', { includeHiddenElements: true })).toBeTruthy()
    expect(StyleSheet.flatten(screen.getByText('Two-for-one till 11.', { includeHiddenElements: true }).props.style).color).toBe(
      COLOR.textSecondary
    )
    expect(screen.getByLabelText('Sponsored, Bira 91: Two-for-one till 11., 10:02 PM')).toBeTruthy()
  })

  it('a video never autoplays: the poster and a play button naming its length', async () => {
    await render(<BroadcastNotice kind="sponsored" from="Bira 91" text="Two-for-one." time="10:02 PM" media={VIDEO} />)
    expect(players).toHaveLength(0)
    expect(screen.queryByTestId('video-view')).toBeNull()
    expect(screen.getByRole('button', { name: 'Play video, 30 seconds' })).toBeTruthy()
  })

  it('a tap plays it inline, muted and once; the toggle turns the sound on; at its end the poster returns', async () => {
    const spies = Object.keys(H).map((k) => jest.spyOn(H, k as keyof typeof H).mockImplementation(() => {}))
    await render(<BroadcastNotice kind="sponsored" from="Bira 91" text="Two-for-one." time="10:02 PM" media={VIDEO} />)
    await fireEvent.press(screen.getByRole('button', { name: 'Play video, 30 seconds' }))
    expect(screen.getByTestId('video-view')).toBeTruthy()
    expect(latest()).toMatchObject({ muted: true, loop: false })
    expect(latest().play).toHaveBeenCalled()
    await fireEvent.press(screen.getByRole('button', { name: 'Turn sound on' }))
    expect(latest().muted).toBe(false)
    expect(screen.getByRole('button', { name: 'Turn sound off' })).toBeTruthy()
    await act(async () => latest().emit('playToEnd'))
    expect(screen.queryByTestId('video-view')).toBeNull()
    expect(screen.getByRole('button', { name: 'Play video, 30 seconds' })).toBeTruthy()
    for (const spy of spies) expect(spy).not.toHaveBeenCalled()
  })

  it('a video that fails says so, and Try again plays it afresh', async () => {
    await render(<BroadcastNotice kind="sponsored" from="Bira 91" text="Two-for-one." time="10:02 PM" media={VIDEO} />)
    await fireEvent.press(screen.getByRole('button', { name: 'Play video, 30 seconds' }))
    await act(async () => latest().emit('statusChange', { status: 'error' }))
    expect(screen.getByText('Couldn’t load this')).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }))
    expect(players).toHaveLength(2)
    expect(latest().play).toHaveBeenCalled()
  })

  it('an image keeps its place in the card', async () => {
    await render(
      <BroadcastNotice kind="announcement" from="Toit" text="Swap table by the stairs." time="9:00 PM" media={{ kind: 'image', uri: 'https://x/y.jpg' }} testID="b" />
    )
    expect(screen.getByTestId('b-media')).toBeTruthy()
  })

  it('Increase Contrast: the 50% hairline', async () => {
    jest.spyOn(AccessibilityInfo, 'isDarkerSystemColorsEnabled').mockResolvedValue(true)
    await render(<BroadcastNotice kind="sponsored" from="Bira 91" text="Two-for-one." time="10:02 PM" testID="b" />)
    await act(async () => {})
    expect(flat('b').borderColor).toBe(MATERIAL.hairlineIncreaseContrast)
  })
})

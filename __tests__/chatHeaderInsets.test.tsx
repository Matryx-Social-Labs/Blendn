import React from 'react'
import { act, render, screen } from '@testing-library/react-native'
import { Dimensions, Platform, StyleSheet, Text } from 'react-native'

/**
 * The room's and the DM's header sit under the status bar, never in it, and
 * the feed's window starts below the status bar (owner's sim drive: the
 * header and the messages collided with the clock).
 */
const INSET_TOP = 59
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 59, bottom: 34, left: 0, right: 0 }),
}))

/* eslint-disable import/first */
import { ChatHeader, chatCapsuleHeight, chatFeedFrame, chatHeaderBottom } from '../components/chat/ChatHeader'
import { RADIUS, SIZE, SPACE } from '../lib/design/tokens'
/* eslint-enable import/first */

const window = Dimensions.get('window')
const atScale = (fontScale: number) => act(async () => Dimensions.set({ window: { ...window, fontScale }, screen: { ...window, fontScale } }))
// The suite's measures are the builder's, at the default text size (the jest window reads 2).
beforeEach(() => atScale(1))
afterEach(() => atScale(window.fontScale))

it('the capsule starts 2 pt under the safe-area top inset: not in the status bar, and no 8 pt gap above it', async () => {
  await render(<ChatHeader title="Vinyl Night" leading={<Text>c</Text>} onBack={() => {}} onMore={() => {}} moreLabel="Room info" testID="hdr" />)
  const top = StyleSheet.flatten(screen.getByTestId('hdr').props.style).top
  expect(top).toBe(INSET_TOP + 2)
})

it('the feed’s window starts at the capsule’s bottom edge, its first message 12 below', () => {
  const frame = chatFeedFrame(INSET_TOP)
  expect(frame.style.marginTop).toBe(INSET_TOP + 2 + SIZE.input)
  // In the window: the list's top plus its padding is the capsule's bottom edge plus the gap.
  expect(frame.style.marginTop + frame.paddingTop).toBe(chatHeaderBottom(INSET_TOP))
  expect(chatHeaderBottom(INSET_TOP)).toBe(INSET_TOP + 2 + SIZE.input + SPACE.md)
  // A strip pinned under the capsule (the DM's reveal bar, a Blend's sides) moves the window's top under it, so nothing
  // the feed holds scrolls behind it (TG-04): the strip starts at chatHeaderBottom and is 120 tall.
  const under = chatFeedFrame(INSET_TOP, 120)
  expect(under.style.marginTop).toBe(chatHeaderBottom(INSET_TOP) + 120)
  expect(under.paddingTop).toBe(frame.paddingTop)
})

describe('the capsule is the Flow 5 builder’s (flow5.js header): 56 on iOS, 60 on Android, 28 round', () => {
  const capsule = () => StyleSheet.flatten(screen.getByTestId('hdr-capsule').props.style)
  const header = <ChatHeader title="Vinyl Night" leading={<Text>c</Text>} onBack={() => {}} onMore={() => {}} moreLabel="Room info" testID="hdr" />
  afterEach(() => Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true }))

  it('iOS: 56 (SIZE.input), radius 28 (RADIUS.button: fully round), and the feed starts at its foot', async () => {
    await render(header)
    expect(capsule()).toMatchObject({ height: SIZE.input, borderRadius: RADIUS.button, gap: 10, paddingLeft: SPACE.xs, paddingRight: SPACE.sm })
    expect(RADIUS.button * 2).toBe(SIZE.input)
    expect(chatFeedFrame(INSET_TOP).style.marginTop).toBe(INSET_TOP + 2 + SIZE.input)
  })

  it('Android: 60 with the builder’s 28 radius, and the feed follows the taller capsule', async () => {
    Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true })
    await render(header)
    expect(capsule()).toMatchObject({ height: 60, borderRadius: RADIUS.button })
    expect(chatFeedFrame(INSET_TOP).style.marginTop).toBe(INSET_TOP + 2 + 60)
    expect(chatHeaderBottom(INSET_TOP)).toBe(INSET_TOP + 2 + 60 + SPACE.md)
  })
})

describe('rc9 D4: a name of two lines keeps its subtitle at large text', () => {
  const capsule = () => StyleSheet.flatten(screen.getByTestId('hdr-capsule').props.style)
  const long = 'RC7 Crew G × RC4 Crew Y'
  const header = <ChatHeader title={long} subtitle={<Text>Both anonymous</Text>} leading={<Text>c</Text>} onBack={() => {}} onMore={() => {}} moreLabel="More" testID="hdr" />

  it('the name may take two lines', async () => {
    await render(header)
    expect(screen.getByText(long).props.numberOfLines).toBe(2)
  })

  it('the capsule grows with the text, to the header’s cap, and the feed starts at its new foot', async () => {
    expect(chatCapsuleHeight(1)).toBe(SIZE.input)
    expect(chatCapsuleHeight(1.3)).toBe(SIZE.input + 17)
    // Past the cap the header's own text stops growing, so does the capsule.
    expect(chatCapsuleHeight(3.5)).toBe(chatCapsuleHeight(1.3))
    // Never below the builder's height: a smaller-than-default text size is not a shorter capsule.
    expect(chatCapsuleHeight(0.85)).toBe(SIZE.input)
    await atScale(1.3)
    await render(header)
    // Negative control: a capsule fixed at 56 (the old `chatCapsuleHeight()`) fails this: two 26 pt lines and a 21 pt one need 73.
    expect(capsule().height).toBe(SIZE.input + 17)
    expect(chatFeedFrame(INSET_TOP, 0, 1.3).style.marginTop).toBe(INSET_TOP + 2 + SIZE.input + 17)
    expect(chatHeaderBottom(INSET_TOP, 1.3)).toBe(INSET_TOP + 2 + SIZE.input + 17 + SPACE.md)
  })
})

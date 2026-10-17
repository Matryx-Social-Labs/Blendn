import React from 'react'
import { render, screen } from '@testing-library/react-native'
import { StyleSheet, Text } from 'react-native'

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
import { ChatHeader, chatFeedFrame, chatHeaderBottom } from '../components/chat/ChatHeader'
import { SIZE, SPACE } from '../lib/design/tokens'
/* eslint-enable import/first */

it('the capsule starts below the safe-area top inset', async () => {
  await render(<ChatHeader title="Vinyl Night" leading={<Text>c</Text>} onBack={() => {}} onMore={() => {}} moreLabel="Room info" testID="hdr" />)
  const top = StyleSheet.flatten(screen.getByTestId('hdr').props.style).top
  expect(top).toBe(INSET_TOP + SPACE.xs)
  expect(top).toBeGreaterThan(INSET_TOP)
})

it('the feed’s window starts at the capsule’s bottom edge, its first message 12 below', () => {
  const frame = chatFeedFrame(INSET_TOP)
  expect(frame.style.marginTop).toBe(INSET_TOP + SPACE.xs + SIZE.input)
  // In the window: the list's top plus its padding is the capsule's bottom edge plus the gap.
  expect(frame.style.marginTop + frame.paddingTop).toBe(chatHeaderBottom(INSET_TOP))
  expect(chatHeaderBottom(INSET_TOP)).toBe(INSET_TOP + SPACE.xs + SIZE.input + SPACE.md)
  // The DM's reveal bar adds its own height under the capsule.
  expect(chatFeedFrame(INSET_TOP, 120).paddingTop).toBe(frame.paddingTop + 120)
})

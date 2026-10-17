/*
 * <Composer> (guidelines/components/Composer.html, ROUND3 C2–C4 and D 5.3,
 * 5.4): the glass bar; Send dimmed until there is text, lit by the gradient
 * after, H.send when a message is committed; the reply quote; the counter
 * from 900 characters; "Not sent · Tap to retry" with H.error once; every
 * reason it can't post, in the server's words, with no mute countdown; left,
 * ended and banned draw nothing.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import React from 'react'
import { AccessibilityInfo, Platform, StyleSheet } from 'react-native'

import { Composer, type ComposerProps } from '../components/ds/Composer'
import { MATERIAL } from '../lib/design/tokens'
import { H } from '../lib/haptics'

jest.mock('react-native-reanimated', () => {
  const actual = jest.requireActual('react-native-reanimated')
  return { ...actual, __esModule: true, useReducedMotion: jest.fn(() => false) }
})
jest.mock('expo-glass-effect', () => {
  const { View } = jest.requireActual('react-native')
  return { GlassView: (props: object) => <View {...props} testID="glass" />, isGlassEffectAPIAvailable: () => true, isLiquidGlassAvailable: () => true }
})
jest.mock('expo-linear-gradient', () => {
  const { View } = jest.requireActual('react-native')
  return { LinearGradient: (props: object) => <View {...props} testID="gradient" /> }
})

const composer = (props: Partial<ComposerProps> = {}) => (
  <Composer value="" onChangeText={jest.fn()} onSend={jest.fn()} testID="c" {...props} />
)
const send = () => screen.getByRole('button', { name: 'Send' })

let haptic: Record<'send' | 'error', jest.SpyInstance>
beforeEach(() => {
  Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true })
  haptic = {
    send: jest.spyOn(H, 'send').mockImplementation(() => {}),
    error: jest.spyOn(H, 'error').mockImplementation(() => {}),
  }
})

describe('<Composer>', () => {
  it('empty: the field and a dimmed Send, no gradient', async () => {
    await render(composer())
    expect(screen.getByLabelText('Message').props.placeholder).toBe('Say something to the room')
    expect(send().props.accessibilityState).toMatchObject({ disabled: true })
    expect(screen.queryByTestId('gradient')).toBeNull()
  })

  it('with text: Send lights with the gradient and commits with H.send', async () => {
    const onSend = jest.fn()
    await render(composer({ value: 'Rumours side two. Fight me.', onSend }))
    expect(screen.getByTestId('gradient')).toBeTruthy()
    await fireEvent.press(send())
    expect(haptic.send).toHaveBeenCalledTimes(1)
    expect(onSend).toHaveBeenCalledTimes(1)
  })

  it('whitespace is not a message', async () => {
    const onSend = jest.fn()
    await render(composer({ value: '   ', onSend }))
    await fireEvent.press(send())
    expect(onSend).not.toHaveBeenCalled()
    expect(haptic.send).not.toHaveBeenCalled()
  })

  it('takes the server’s 1000 characters; the counter starts at 900', async () => {
    await render(composer({ value: 'x'.repeat(899) }))
    expect(screen.getByLabelText('Message').props.maxLength).toBe(1000)
    expect(screen.queryByText(/left$/)).toBeNull()
    await screen.rerender(composer({ value: 'x'.repeat(900) }))
    expect(screen.getByText('100 left')).toBeTruthy()
  })

  it('replying: the quote above the field, and × cancels it', async () => {
    const onCancelReply = jest.fn()
    await render(composer({ reply: { name: 'Cosmic Panda', text: 'Rumours side two.' }, onCancelReply }))
    expect(screen.getByText('Replying to Cosmic Panda')).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: 'Cancel reply' }))
    expect(onCancelReply).toHaveBeenCalledTimes(1)
  })

  it('failed: “Not sent · Tap to retry”, H.error and an announcement once as it fails, never on mount', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {})
    const onRetry = jest.fn()
    await render(composer({ value: 'Tusk.', state: 'failed', onRetry }))
    expect(haptic.error).not.toHaveBeenCalled()
    await screen.rerender(composer({ value: 'Tusk.', onRetry }))
    await screen.rerender(composer({ value: 'Tusk.', state: 'failed', onRetry }))
    await screen.rerender(composer({ value: 'Tusk!', state: 'failed', onRetry }))
    expect(haptic.error).toHaveBeenCalledTimes(1)
    expect(announce).toHaveBeenCalledWith('Not sent. Tap to retry')
    await fireEvent.press(screen.getByRole('button', { name: 'Not sent. Tap to retry' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['muted', 'Muted. The organiser has muted you in this room.'],
    ['automuted', 'Muted. You are muted in this room. Your messages have been flagged for policy violations.'],
    ['locked', 'Read only. The organiser locked posting in this room.'],
    ['closed', 'This chat has closed. Event chats stay open for 24 hours after the event ends.'],
    ['ratelimited', 'Slow down a moment. Too many messages.'],
    // R2-D2: the two CHAT_CLOSED reasons the server words apart.
    ['notopen', 'Not open yet. This chat opens 24 hours before the event starts.'],
    ['hidden', 'This room is hidden. This event is no longer available.'],
  ] as const)('%s: no field, the reason in the server’s words as one element, nothing plays', async (state, said) => {
    await render(composer({ state }))
    expect(screen.queryByLabelText('Message')).toBeNull()
    expect(screen.getByLabelText(said)).toBeTruthy()
    expect(haptic.send).not.toHaveBeenCalled()
    expect(haptic.error).not.toHaveBeenCalled()
  })

  it('Send a photo only where the screen offers it (a DM you can both see, R9)', async () => {
    await render(composer())
    expect(screen.queryByLabelText('Send a photo')).toBeNull()
    const onAttach = jest.fn()
    await screen.rerender(composer({ onAttach }))
    await fireEvent.press(screen.getByLabelText('Send a photo'))
    expect(onAttach).toHaveBeenCalledTimes(1)
  })

  it('a lock that arrives while you are in the room is announced', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {})
    await render(composer())
    await screen.rerender(composer({ state: 'muted' }))
    expect(announce).toHaveBeenCalledWith('Muted. The organiser has muted you in this room.')
  })

  it('a mute carries no countdown; a rate limit carries the server’s, as the hint', async () => {
    await render(composer({ state: 'muted', countdown: '43:00' }))
    expect(screen.queryByText('43:00')).toBeNull()
    await screen.rerender(composer({ state: 'ratelimited', countdown: '0:12' }))
    expect(screen.getByText('0:12')).toBeTruthy()
    expect(screen.getByLabelText('Slow down a moment. Too many messages.').props.accessibilityHint).toBe('You can post again in 0:12')
  })

  it('the server’s own sentence replaces the default', async () => {
    await render(composer({ state: 'closed', reason: 'This chat has closed.' }))
    expect(screen.getByLabelText('This chat has closed. This chat has closed.')).toBeTruthy()
  })

  it('not checked in: the server’s RSVP sentence and the I’m going chip', async () => {
    const onPress = jest.fn()
    await render(composer({ state: 'notcheckedin', action: { label: 'I’m going', onPress } }))
    expect(screen.getByLabelText('RSVP to this event to join the chat')).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: 'I’m going' }))
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it.each(['left', 'ended', 'banned'] as const)('%s: draws nothing (one line in the feed says so)', async (state) => {
    await render(composer({ state }))
    expect(screen.queryByTestId('c')).toBeNull()
  })

  it('iOS: bar glass; Android: the solid tier', async () => {
    await render(composer())
    expect(screen.getByTestId('glass')).toBeTruthy()
    Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true })
    await render(composer())
    expect(screen.queryByTestId('glass')).toBeNull()
  })

  it('Increase Contrast: the hairline', async () => {
    jest.spyOn(AccessibilityInfo, 'isDarkerSystemColorsEnabled').mockResolvedValue(true)
    await render(composer())
    await act(async () => {})
    expect(StyleSheet.flatten(screen.getByTestId('glass').props.style).borderColor).toBe(MATERIAL.hairlineIncreaseContrast)
  })
})

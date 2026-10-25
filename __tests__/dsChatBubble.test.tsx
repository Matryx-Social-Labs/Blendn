/*
 * <ChatBubble> (guidelines/components/ChatBubble.html; ROUND3 C6, D 5.1, 5.2,
 * 5.8, 5.11; motion #35, #36) and the rules it applies (chatShared): grouping
 * (the name on the first, the creature, the time and the tail on the last);
 * inbound on surfaceSunken, yours on surfaceRaised; a DM has no names or
 * creatures and carries the receipt; removed, failed, waiting, emoji-only,
 * links; the hold (H.longPress, the menu at the bubble's frame) and the swipe
 * to reply (H.threshold once per crossing); a screen reader's actions.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import React from 'react'
import { AccessibilityInfo, Dimensions, processColor, StyleSheet } from 'react-native'
import { State } from 'react-native-gesture-handler'
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils'

import * as Reanimated from 'react-native-reanimated'

import { ChatBubble, PRESS_DELAY_MS, type ChatBubbleProps } from '../components/ds/ChatBubble'
import { avatarOf, BUBBLE, emojiOnly, linkHost, linkParts, replyOffset } from '../components/ds/chatShared'
import { COLOR, FONT_FAMILY, MATERIAL } from '../lib/design/tokens'
import { H } from '../lib/haptics'
import { CONTROL_FONT_CAP } from '../components/ds/shared'
import { AX_XXXL, uncapped } from './helpers/ax'

jest.mock('react-native-reanimated', () => {
  const actual = jest.requireActual('react-native-reanimated')
  return { ...actual, __esModule: true, useReducedMotion: jest.fn(() => false), withDelay: jest.fn(actual.withDelay) }
})

// A test renderer lays nothing out: the screen reader's menu is measured from here.
const FRAME = { x: 16, y: 300, width: 240, height: 44 }
jest.mock('../components/ds/anchor', () => ({ measureAnchor: (_node: unknown, then: (r: typeof FRAME) => void) => then(FRAME) }))

const PANDA = { name: 'Cosmic Panda' }
const bubble = (props: Partial<ChatBubbleProps> = {}) => (
  <ChatBubble mine={false} sender={PANDA} text="Rumours side two. Fight me." time="9:38 PM" testID="b" {...props} />
)
const flat = (id: string) => StyleSheet.flatten(screen.getByTestId(id, { includeHiddenElements: true }).props.style)
const message = () => screen.getByTestId('b-bubble')

let haptic: Record<'longPress' | 'threshold' | 'send', jest.SpyInstance>
beforeEach(() => {
  haptic = {
    longPress: jest.spyOn(H, 'longPress').mockImplementation(() => {}),
    threshold: jest.spyOn(H, 'threshold').mockImplementation(() => {}),
    send: jest.spyOn(H, 'send').mockImplementation(() => {}),
  }
})

describe('the rules', () => {
  it('emoji-only: one to three emoji and nothing else', () => {
    expect(emojiOnly('🔥🔥')).toBe(true)
    expect(emojiOnly('❤️')).toBe(true)
    expect(emojiOnly('👍🏽')).toBe(true)
    expect(emojiOnly('👨‍👩‍👧')).toBe(true)
    expect(emojiOnly('🔥🔥🔥🔥')).toBe(false)
    expect(emojiOnly('so good 🔥')).toBe(false)
    expect(emojiOnly('42')).toBe(false)
  })

  it('links: a domain with an optional scheme and path, opened over https', () => {
    expect(linkParts('set times are up: toit.in/vinyl-night')).toEqual([
      { text: 'set times are up: ' },
      { text: 'toit.in/vinyl-night', url: 'https://toit.in/vinyl-night' },
    ])
    expect(linkParts('Till midnight. Stairs by the bar.')).toEqual([{ text: 'Till midnight. Stairs by the bar.' }])
  })

  /*
   * The host on the link sheet is the parsed URL's, never the link's text, and
   * a link whose host parsers disagree on is not a link at all. Run against
   * both URLs the app meets: WHATWG (jest, a browser) and React Native's shim
   * (the phone), which reads `evil.example\@toit.in` as toit.in.
   */
  describe.each([
    ['WHATWG URL', globalThis.URL],
    ['React Native URL', require('react-native/Libraries/Blob/URL').URL],
  ])('link host · %s', (_name, Impl) => {
    const real = globalThis.URL
    beforeEach(() => {
      globalThis.URL = Impl
    })
    afterEach(() => {
      globalThis.URL = real
    })

    it('names the host the link goes to', () => {
      expect(linkHost('https://toit.in/vinyl-night?x=1')).toBe('toit.in')
      expect(linkHost('http://toit.in:8080/@someone?a=b@c')).toBe('toit.in')
      expect(linkHost('https://evil.example/x@toit.in')).toBe('evil.example')
      expect(linkHost('HtTpS://Toit.IN/vinyl')).toBe('toit.in') // a mixed-case scheme
      expect(linkHost('https://xn--80ak6aa92e.com/')).toBe('xn--80ak6aa92e.com') // punycode shows as it is
    })

    it('refuses every spoofable or non-web link', () => {
      for (const url of [
        'https://toit.in@evil.example/vinyl',
        'https://evil.example\\@toit.in/',
        'https://evil.example\\toit.in',
        'https://toit.in\u200B@evil.example',
        'https://\u202Eni.tiot',
        'javascript:alert(1)',
        'intent://toit.in#Intent;end',
        'blendn://chat/1',
        'https://',
        'https://t\u043Eit.in/', // a Cyrillic о: a homograph of toit.in
        'https://toit.in%2eevil.com/',
        'https://toit.in\u3002evil.com/', // an ideographic full stop
        'https://toit.in\uFF20evil.com/', // fullwidth ＠
        'https://evil.com\uFF0Ftoit.in', // fullwidth ／
        'https://0x7f.1/',
        'https://127.0.0.1/',
        'https://[::1]/',
        'https://toit.in:abc/', // a port that is not a number
      ]) {
        expect([url, linkHost(url)]).toEqual([url, null])
      }
    })

    it('a refused link is words, with nothing to tap', () => {
      expect(linkParts('menu: https://toit.in@evil.example/menu').some((p) => p.url)).toBe(false)
      expect(linkParts('menu: https://evil.example\\@toit.in').some((p) => p.url)).toBe(false)
      expect(linkParts('menu: HTTPS://toit.in/menu').find((p) => p.url)?.url).toBe('https://toit.in/menu')
    })
  })

  it('links: a whole multi-part domain, never cut to a different one', () => {
    const url = (t: string) => linkParts(t).find((p) => p.url)?.url
    expect(url('news at bbc.co.uk/news today')).toBe('https://bbc.co.uk/news')
    expect(url('tickets on foo.com.au')).toBe('https://foo.com.au')
  })

  it('links: a path keeps its own parenthesis, a sentence keeps its own', () => {
    const url = (t: string) => linkParts(t).find((p) => p.url)?.url
    expect(url('see en.wikipedia.org/wiki/Rumours_(album) first')).toBe('https://en.wikipedia.org/wiki/Rumours_(album)')
    expect(url('(menu at toit.in/menu)')).toBe('https://toit.in/menu')
    expect(url('set times are up: toit.in/vinyl.')).toBe('https://toit.in/vinyl')
  })

  it('links: not an email’s domain, not two words joined by a dot', () => {
    expect(linkParts('write to me@gmail.com').some((p) => p.url)).toBe(false)
    expect(linkParts('ask Dr.Smith, ok.thanks').some((p) => p.url)).toBe(false)
  })

  it('#35: 1:1 to 56, then half speed to a stop at 96; never left', () => {
    expect([replyOffset(-20), replyOffset(30), replyOffset(56), replyOffset(96), replyOffset(300)]).toEqual([0, 30, 56, 76, 96])
  })

  it('a person is their photo where the room shows it, else their creature', () => {
    expect(avatarOf({ name: 'Priya', photoUri: 'https://x/p.jpg' }, 32)).toEqual({ kind: 'photo', uri: 'https://x/p.jpg', size: 32 })
    expect(avatarOf({ name: 'Attendee', pseudonym: 'Quiet Heron' }, 32)).toEqual({ kind: 'creature', pseudonym: 'Quiet Heron', size: 32 })
  })
})

describe('<ChatBubble>', () => {
  it('inbound, the first of a group: the name (a button to their card) and no creature, time or tail yet', async () => {
    const onSenderPress = jest.fn()
    await render(bubble({ first: true, last: false, onSenderPress }))
    await fireEvent.press(screen.getByRole('button', { name: 'Cosmic Panda' }))
    expect(onSenderPress).toHaveBeenCalledTimes(1)
    expect(screen.queryByTestId('b-avatar', { includeHiddenElements: true })).toBeNull()
    expect(screen.queryByText('9:38 PM', { includeHiddenElements: true })).toBeNull()
    expect(flat('b-bubble')).toMatchObject({ backgroundColor: COLOR.surfaceSunken, borderBottomLeftRadius: 20 })
  })

  it('inbound, the last: the creature, the time once, the 6 pt tail on the left', async () => {
    await render(bubble({ first: false, last: true }))
    expect(screen.queryByText('Cosmic Panda')).toBeNull()
    expect(screen.getByTestId('b-avatar', { includeHiddenElements: true })).toBeTruthy()
    expect(screen.getByText('9:38 PM', { includeHiddenElements: true })).toBeTruthy()
    expect(flat('b-bubble').borderBottomLeftRadius).toBe(6)
  })

  it('yours: surfaceRaised, the tail on the right, no name or creature', async () => {
    await render(bubble({ mine: true }))
    expect(flat('b-bubble')).toMatchObject({ backgroundColor: COLOR.surfaceRaised, borderBottomRightRadius: 6 })
    expect(screen.queryByTestId('b-avatar', { includeHiddenElements: true })).toBeNull()
    expect(message().props.accessibilityLabel).toBe('You, Rumours side two. Fight me., 9:38 PM')
  })

  it('a DM: no name, no creature; your last carries the receipt, read as its word', async () => {
    await render(bubble({ surface: 'dm', first: true }))
    expect(screen.queryByText('Cosmic Panda')).toBeNull()
    expect(screen.queryByTestId('b-avatar', { includeHiddenElements: true })).toBeNull()
    await screen.rerender(bubble({ surface: 'dm', mine: true, receipt: 'read' }))
    expect(screen.getByText('Read', { includeHiddenElements: true })).toBeTruthy()
    expect(message().props.accessibilityLabel).toBe('You, Rumours side two. Fight me., 9:38 PM, Read')
  })

  it('reads “{name}, {text}, {time}”, a reply as its hint; no “edited” anywhere (C6)', async () => {
    await render(bubble({ replyTo: { name: 'Quiet Heron', text: 'Side one, obviously.' } }))
    expect(message().props.accessibilityLabel).toBe('Cosmic Panda, Rumours side two. Fight me., 9:38 PM')
    expect(message().props.accessibilityHint).toBe('Replying to Quiet Heron: Side one, obviously.')
    expect(screen.queryByText(/edited/)).toBeNull()
  })

  it('reactions are pills under it; a tap gives or takes back', async () => {
    const onReactionPress = jest.fn()
    await render(bubble({ reactions: [{ emoji: '🔥', count: 3, mine: true }, { emoji: '😂', count: 1, mine: false }], onReactionPress }))
    await fireEvent.press(screen.getByRole('button', { name: 'fire, 3, including you' }))
    expect(onReactionPress).toHaveBeenCalledWith('🔥')
  })

  it('removed: keeps its place in the DS dashed frame, italic; no hold, no swipe', async () => {
    const onLongPress = jest.fn()
    await render(bubble({ removed: true, onLongPress, onReply: jest.fn() }))
    expect(flat('b-bubble')).toMatchObject({ backgroundColor: 'transparent' })
    // No border dash (per platform, and solid on Android with any per-side width): the SVG frame's 6 4 at 1.5 in inputBorder.
    expect(flat('b-bubble').borderStyle).toBeUndefined()
    await fireEvent(screen.getByTestId('b-dashed', { includeHiddenElements: true }), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 240, height: 44 } } })
    type Node = { props?: Record<string, unknown>; children?: (Node | string)[] | null }
    const find = (n: Node | string | null | undefined): Node | undefined =>
      !n || typeof n === 'string' ? undefined : n.props?.strokeDasharray !== undefined ? n : (n.children ?? []).map(find).find(Boolean)
    const rect = find(screen.toJSON() as Node)?.props ?? {}
    // As the SVG host receives them: the dash split, the colour processed.
    expect(rect).toMatchObject({ strokeDasharray: ['6', '4'], strokeWidth: 1.5, stroke: { payload: processColor(COLOR.inputBorder) }, fill: null, width: 238.5, height: 42.5 })
    expect(Number(rect.rx)).toBeCloseTo(BUBBLE.radius - 0.75)
    expect(screen.getByText('This message was removed by moderation.', { includeHiddenElements: true })).toBeTruthy()
    // L9: read without the full stop before the time.
    expect(message().props.accessibilityLabel).toBe('Cosmic Panda, This message was removed by moderation, 9:38 PM')
    await act(async () => fireGestureHandler(getByGestureTestId('b-hold'), [{ state: State.BEGAN }, { state: State.ACTIVE }, { state: State.END }]))
    expect(onLongPress).not.toHaveBeenCalled()
  })

  it('a removed photo, the sender’s view (round 4 #37): 220×160 in the dashed frame, a shield, “Removed by moderation”', async () => {
    await render(bubble({ mine: true, text: undefined, removed: 'photo', surface: 'dm' }))
    expect(flat('b-bubble')).toMatchObject({ width: 220, height: 160, backgroundColor: 'transparent' })
    expect(screen.getByTestId('b-dashed', { includeHiddenElements: true })).toBeTruthy()
    expect(screen.getByText('Removed by moderation', { includeHiddenElements: true })).toBeTruthy()
    expect(message().props.accessibilityLabel).toBe('You, Photo removed by moderation, 9:38 PM')
    expect(message().props.accessibilityActions).toEqual([])
  })

  it('not sent: the line under it; a tap retries with H.send; the server’s reason when it gave one', async () => {
    const onRetry = jest.fn()
    await render(bubble({ mine: true, failed: true, onRetry }))
    expect(screen.getByText('Not sent · Tap to retry', { includeHiddenElements: true })).toBeTruthy()
    expect(message().props.accessibilityLabel).toBe('Not sent: Rumours side two. Fight me., 9:38 PM')
    await fireEvent.press(message())
    expect(haptic.send).toHaveBeenCalledTimes(1)
    expect(onRetry).toHaveBeenCalledTimes(1)
    await screen.rerender(bubble({ mine: true, failed: 'Not sent · Two links at most', onRetry }))
    expect(screen.getByText('Not sent · Two links at most', { includeHiddenElements: true })).toBeTruthy()
  })

  it('offline: “Waiting for connection”, not a spinner', async () => {
    await render(bubble({ mine: true, waiting: true }))
    expect(screen.getByText('Waiting for connection', { includeHiddenElements: true })).toBeTruthy()
  })

  it('emoji-only: no bubble, at 32 pt', async () => {
    await render(bubble({ text: '🔥🔥' }))
    expect(flat('b-bubble').backgroundColor).toBe('transparent')
    expect(StyleSheet.flatten(screen.getByText('🔥🔥', { includeHiddenElements: true }).props.style).fontSize).toBe(32)
  })

  it('a link is tappable text, never a preview, and an action for a screen reader', async () => {
    const onLinkPress = jest.fn()
    await render(bubble({ text: 'set times are up: toit.in/vinyl-night', onLinkPress }))
    await fireEvent.press(screen.getByText('toit.in/vinyl-night', { includeHiddenElements: true }))
    expect(onLinkPress).toHaveBeenCalledWith('https://toit.in/vinyl-night')
    await fireEvent(message(), 'accessibilityAction', { nativeEvent: { actionName: 'Open toit.in' } })
    expect(onLinkPress).toHaveBeenCalledTimes(2)
  })

  it('a photo opens the viewer from the bubble’s frame', async () => {
    const onPress = jest.fn()
    await render(bubble({ text: undefined, photo: { uri: 'https://x/p.jpg', onPress } }))
    expect(message().props.accessibilityLabel).toBe('Cosmic Panda, Photo, 9:38 PM')
    await fireEvent(screen.getByTestId('b-hold-area'), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 228, height: 168 } } })
    await fireEvent.press(message(), { nativeEvent: { pageX: 100, pageY: 300, locationX: 40, locationY: 20 } })
    expect(onPress).toHaveBeenCalledWith({ x: 60, y: 280, width: 228, height: 168 })
  })

  it('#36: a 400 ms hold plays H.longPress and hands the menu the bubble’s frame', async () => {
    const onLongPress = jest.fn()
    await render(bubble({ onLongPress }))
    await fireEvent(screen.getByTestId('b-hold-area'), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 240, height: 44 } } })
    await act(async () =>
      fireGestureHandler(getByGestureTestId('b-hold'), [
        { state: State.BEGAN, x: 20, y: 10, absoluteX: 84, absoluteY: 330 },
        { state: State.ACTIVE, x: 20, y: 10, absoluteX: 84, absoluteY: 330 },
        { state: State.END },
      ])
    )
    expect(haptic.longPress).toHaveBeenCalledTimes(1)
    expect(onLongPress).toHaveBeenCalledWith({ x: 64, y: 320, width: 240, height: 44 })
  })

  it('#35: dragged right past 56 pt it arms once (H.threshold, Medium) and replies on release', async () => {
    const onReply = jest.fn()
    await render(bubble({ onReply }))
    await act(async () =>
      fireGestureHandler(getByGestureTestId('b-swipe'), [
        { state: State.BEGAN, translationX: 0 },
        { state: State.ACTIVE, translationX: 0 },
        { state: State.ACTIVE, translationX: 40 },
        { state: State.ACTIVE, translationX: 70 },
        { state: State.ACTIVE, translationX: 120 },
        { state: State.END, translationX: 120 },
      ])
    )
    expect(haptic.threshold).toHaveBeenCalledTimes(1)
    expect(haptic.threshold).toHaveBeenCalledWith({ swipeToReply: true })
    expect(onReply).toHaveBeenCalledTimes(1)
  })

  it('short of 56 pt: no haptic, no reply', async () => {
    const onReply = jest.fn()
    await render(bubble({ onReply }))
    await act(async () =>
      fireGestureHandler(getByGestureTestId('b-swipe'), [
        { state: State.BEGAN, translationX: 0 },
        { state: State.ACTIVE, translationX: 0 },
        { state: State.ACTIVE, translationX: 40 },
        { state: State.END, translationX: 40 },
      ])
    )
    expect(haptic.threshold).not.toHaveBeenCalled()
    expect(onReply).not.toHaveBeenCalled()
  })

  it('a screen reader gets Reply and the menu as actions: the gestures are shortcuts', async () => {
    const onReply = jest.fn()
    const report = jest.fn()
    await render(bubble({ onReply, actions: [{ label: 'Copy', onPress: jest.fn() }, { label: 'Report…', onPress: report }] }))
    expect(message().props.accessibilityActions.map((a: { name: string }) => a.name)).toEqual(['Reply', 'Copy', 'Report…'])
    await fireEvent(message(), 'accessibilityAction', { nativeEvent: { actionName: 'Reply' } })
    await fireEvent(message(), 'accessibilityAction', { nativeEvent: { actionName: 'Report…' } })
    expect(onReply).toHaveBeenCalledTimes(1)
    expect(report).toHaveBeenCalledTimes(1)
  })

  it('H1: a screen reader opens the same menu the hold does (More options), at the bubble’s frame, and the card (View profile)', async () => {
    const onLongPress = jest.fn()
    const onSenderPress = jest.fn()
    await render(bubble({ onLongPress, onSenderPress, onReply: jest.fn() }))
    expect(message().props.accessibilityActions.map((a: { name: string }) => a.name).slice(0, 3)).toEqual(['Reply', 'More options', 'View profile'])
    await fireEvent(message(), 'accessibilityAction', { nativeEvent: { actionName: 'More options' } })
    expect(onLongPress).toHaveBeenCalledWith(FRAME)
    expect(haptic.longPress).toHaveBeenCalledTimes(1)
    await fireEvent(message(), 'accessibilityAction', { nativeEvent: { actionName: 'View profile' } })
    expect(onSenderPress).toHaveBeenCalledTimes(1)
  })

  it('H1: no menu handler, no More options; a removed message offers neither', async () => {
    await render(bubble({ onSenderPress: jest.fn() }))
    expect(message().props.accessibilityActions.map((a: { name: string }) => a.name)).toEqual(['View profile'])
    await screen.rerender(bubble({ removed: true, onLongPress: jest.fn(), onSenderPress: jest.fn() }))
    expect(message().props.accessibilityActions).toEqual([])
  })

  it('a screen reader reacts from the bubble: the six as actions, landing with H.reaction', async () => {
    const land = jest.spyOn(H, 'reaction').mockImplementation(() => {})
    const onReactionPress = jest.fn()
    await render(bubble({ reactions: [{ emoji: '🔥', count: 3, mine: true }], onReactionPress }))
    const names = message().props.accessibilityActions.map((a: { name: string }) => a.name)
    expect(names).toEqual(expect.arrayContaining(['React, thumbs up', 'Take back fire']))
    await fireEvent(message(), 'accessibilityAction', { nativeEvent: { actionName: 'React, heart' } })
    expect(onReactionPress).toHaveBeenLastCalledWith('❤️')
    expect(land).toHaveBeenCalledWith('land')
    land.mockClear()
    await fireEvent(message(), 'accessibilityAction', { nativeEvent: { actionName: 'Take back fire' } })
    expect(onReactionPress).toHaveBeenLastCalledWith('🔥')
    expect(land).not.toHaveBeenCalled()
  })

  it('removed offers no actions; not sent offers no Reply', async () => {
    const actions = [{ label: 'Copy', onPress: jest.fn() }]
    await render(bubble({ removed: true, onReply: jest.fn(), actions }))
    expect(message().props.accessibilityActions).toEqual([])
    await screen.rerender(bubble({ mine: true, failed: true, onReply: jest.fn(), actions }))
    expect(message().props.accessibilityActions.map((a: { name: string }) => a.name)).toEqual(['Copy'])
  })

  it('a cancelled swipe (a system interrupt) springs back and replies to nothing', async () => {
    const onReply = jest.fn()
    await render(bubble({ onReply }))
    await act(async () =>
      fireGestureHandler(getByGestureTestId('b-swipe'), [
        { state: State.BEGAN, translationX: 0 },
        { state: State.ACTIVE, translationX: 0 },
        { state: State.ACTIVE, translationX: 80 },
        { state: State.CANCELLED, translationX: 80 },
      ])
    )
    expect(onReply).not.toHaveBeenCalled()
  })

  it('lifted (the menu’s copy): the bubble alone, no name, creature, time or gestures', async () => {
    await render(bubble({ lifted: true, first: true, last: true, onLongPress: jest.fn() }))
    expect(message()).toBeTruthy()
    expect(screen.queryByText('Cosmic Panda')).toBeNull()
    expect(screen.queryByTestId('b-avatar', { includeHiddenElements: true })).toBeNull()
    expect(screen.queryByText('9:38 PM', { includeHiddenElements: true })).toBeNull()
    expect(() => getByGestureTestId('b-hold')).toThrow()
  })

  it('arrives silently: no haptic for an incoming message', async () => {
    const spies = Object.keys(H).map((k) => jest.spyOn(H, k as keyof typeof H).mockImplementation(() => {}))
    await render(bubble({ animateIn: 'arrive' }))
    for (const spy of spies) expect(spy).not.toHaveBeenCalled()
  })

  it('Increase Contrast: a 50% hairline on every bubble', async () => {
    jest.spyOn(AccessibilityInfo, 'isDarkerSystemColorsEnabled').mockResolvedValue(true)
    await render(bubble())
    await act(async () => {})
    expect(flat('b-bubble').borderColor).toBe(MATERIAL.hairlineIncreaseContrast)
  })
})


describe('the press squash waits for a touch that stays (audit L2: bubbles flickered under a scrolling thumb)', () => {
  const withDelay = Reanimated.withDelay as jest.Mock

  it('squashes after a 120 ms hold, not on touch-down', async () => {
    expect(PRESS_DELAY_MS).toBe(120)
    await render(bubble({ onLongPress: jest.fn() }))
    withDelay.mockClear()
    await act(async () => fireGestureHandler(getByGestureTestId('b-hold'), [{ state: State.BEGAN }]))
    expect(withDelay).toHaveBeenCalledWith(120, expect.anything())
  })

  it('a touch that ends first springs straight back: nothing was ever squashed', async () => {
    await render(bubble({ onLongPress: jest.fn() }))
    withDelay.mockClear()
    await act(async () => fireGestureHandler(getByGestureTestId('b-hold'), [{ state: State.BEGAN }, { state: State.FAILED }]))
    // The release is a plain spring to 1 (it replaces the pending delayed squash), never delayed itself.
    const delays = withDelay.mock.calls.map(([ms]) => ms)
    expect(delays).toEqual([120])
  })
})

describe('the bubble’s time (DS-09 C16, DS-18 C31)', () => {
  it('sets "1:12 PM" with its space in the brand face', async () => {
    await render(bubble({ time: '1:12 PM' }))
    const time = screen.getByText('1:12 PM', { includeHiddenElements: true })
    const space = time.children.find((c) => typeof c !== 'string' && c.props.children === ' ') as unknown as { props: { style: { fontFamily?: string } } }
    expect(StyleSheet.flatten(space.props.style).fontFamily).toBe(FONT_FAMILY.brand[500])
  })

  it('stops at the control cap, a tag as Banter’s time is; at AX XXXL nothing on a bubble is uncapped (C31)', async () => {
    const window = Dimensions.get('window')
    try {
      await act(async () => Dimensions.set({ window: { ...window, fontScale: AX_XXXL }, screen: { ...window, fontScale: AX_XXXL } }))
      await render(bubble({ time: '1:12 PM' }))
      expect(screen.getByText('1:12 PM', { includeHiddenElements: true }).props.maxFontSizeMultiplier).toBe(CONTROL_FONT_CAP)
      expect(uncapped(screen.toJSON())).toEqual([])
    } finally {
      Dimensions.set({ window, screen: window })
    }
  })
})

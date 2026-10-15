/*
 * The haptic vocabulary plays what §10.2 names, per platform and Android API
 * level, and nothing below the end of a token's Android chain (rule 7: system
 * constants only; no haptic beats a buzzy one).
 */
import * as Haptics from 'expo-haptics'
import { Platform } from 'react-native'

import { H } from '../lib/haptics'

jest.mock('expo-haptics', () => {
  const actual = jest.requireActual('expo-haptics')
  return {
    ImpactFeedbackStyle: actual.ImpactFeedbackStyle,
    NotificationFeedbackType: actual.NotificationFeedbackType,
    AndroidHaptics: actual.AndroidHaptics,
    impactAsync: jest.fn(async () => {}),
    notificationAsync: jest.fn(async () => {}),
    selectionAsync: jest.fn(async () => {}),
    performAndroidHapticsAsync: jest.fn(async () => {}),
  }
})

const mocked = Haptics as jest.Mocked<typeof Haptics>

function on(os: 'ios' | 'android', version: number | string) {
  Object.defineProperty(Platform, 'OS', { value: os, configurable: true })
  Object.defineProperty(Platform, 'Version', { value: version, configurable: true })
}

/** Everything played, as `kind:value` strings in order. */
function played() {
  return [
    ...mocked.impactAsync.mock.calls.map(([s]) => `impact:${s}`),
    ...mocked.notificationAsync.mock.calls.map(([t]) => `notify:${t}`),
    ...mocked.selectionAsync.mock.calls.map(() => 'selection'),
    ...mocked.performAndroidHapticsAsync.mock.calls.map(([t]) => `android:${t}`),
  ]
}

describe('H on iOS', () => {
  beforeEach(() => on('ios', '26.0'))

  it.each([
    ['primary', () => H.primary(), ['impact:light']],
    ['disc', () => H.disc(), ['impact:medium']],
    ['select', () => H.select(), ['selection']],
    ['toggle', () => H.toggle(true), ['impact:light']],
    ['threshold', () => H.threshold(), ['impact:light']],
    ['threshold, swipe to reply', () => H.threshold({ swipeToReply: true }), ['impact:medium']],
    ['longPress', () => H.longPress(), ['impact:medium']],
    ['drag', () => H.drag(), ['impact:medium']],
    ['like', () => H.like(), ['impact:soft']],
    ['commit', () => H.commit(), ['impact:rigid']],
    ['success', () => H.success(), ['notify:success']],
    ['error', () => H.error(), ['notify:error']],
    ['send', () => H.send(), ['impact:light']],
    ['reaction scrub', () => H.reaction('scrub'), ['selection']],
    ['reaction land', () => H.reaction('land'), ['impact:soft']],
    ['destructive', () => H.destructive(), ['impact:rigid']],
    ['detent', () => H.detent(), ['impact:light']],
    ['arrive', () => H.arrive(), ['impact:light']],
  ])('%s', (_, fire, expected) => {
    fire()
    expect(played()).toEqual(expected)
  })

  it('ramps the hold ticks: Soft, Light, Medium', () => {
    H.tick(1)
    H.tick(2)
    H.tick(3)
    expect(played()).toEqual(['impact:soft', 'impact:light', 'impact:medium'])
  })

  it('plays the match as a lub-dub: Medium, then Soft 180ms later', () => {
    jest.useFakeTimers()
    H.match()
    expect(played()).toEqual(['impact:medium'])
    jest.advanceTimersByTime(179)
    expect(played()).toEqual(['impact:medium'])
    jest.advanceTimersByTime(1)
    expect(played()).toEqual(['impact:medium', 'impact:soft'])
    jest.useRealTimers()
  })
})

describe('H on Android: system constants by API level', () => {
  it.each([
    ['select', 34, () => H.select(), ['android:segment-tick']],
    ['select', 33, () => H.select(), ['android:clock-tick']],
    ['toggle(false)', 34, () => H.toggle(false), ['android:toggle-off']],
    ['toggle(true)', 30, () => H.toggle(true), ['android:clock-tick']],
    ['threshold', 34, () => H.threshold(), ['android:segment-tick']],
    ['threshold({ swipeToReply: true })', 29, () => H.threshold({ swipeToReply: true }), ['android:clock-tick']],
    ['primary', 24, () => H.primary(), ['android:virtual-key']],
    ['longPress', 24, () => H.longPress(), ['android:long-press']],
    ['drag', 33, () => H.drag(), ['android:long-press']],
    ['like', 33, () => H.like(), ['android:virtual-key']],
    ['destructive', 30, () => H.destructive(), ['android:confirm']],
    ['destructive', 29, () => H.destructive(), ['android:virtual-key']],
    ['reaction("scrub")', 34, () => H.reaction('scrub'), ['android:segment-tick']],
    ['reaction("scrub")', 33, () => H.reaction('scrub'), ['android:keyboard-tap']],
    ['success', 30, () => H.success(), ['android:confirm']],
    ['error', 30, () => H.error(), ['android:reject']],
    ['match', 30, () => H.match(), ['android:confirm']],
  ])('%s at API %i', (_, api, fire, expected) => {
    on('android', api)
    fire()
    expect(played()).toEqual(expected)
  })

  it('plays nothing past the end of a chain: no raw vibration', () => {
    on('android', 33)
    H.detent()
    on('android', 29)
    H.success()
    H.error()
    expect(played()).toEqual([])
  })

  it('falls back to a notification below API 30 only where the vocabulary says so', () => {
    on('android', 29)
    H.success({ important: true })
    H.error({ blocking: true })
    H.match()
    expect(played()).toEqual(['notify:success', 'notify:error', 'notify:success'])
  })

  it('never uses impact or selection on Android: those are raw vibrations there', () => {
    on('android', 34)
    for (const fire of [H.primary, H.disc, H.select, H.longPress, H.like, H.commit, H.send, H.detent, H.arrive]) fire()
    H.tick(2)
    expect(mocked.impactAsync).not.toHaveBeenCalled()
    expect(mocked.selectionAsync).not.toHaveBeenCalled()
  })
})

/*
 * <Banner> and <VisibilityBanner> (guidelines/components/Banner.html): always
 * solid, told apart by icon and lead word with the two tints supporting, no
 * haptic, announced politely (the visibility banner is read, not announced),
 * and the action wrapping under the sentence past 1.3×.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import React from 'react'
import { AccessibilityInfo, Dimensions, Platform, StyleSheet } from 'react-native'

import { Banner, VisibilityBanner } from '../components/ds/Banner'
import { COLOR, FONT_FAMILY, MATERIAL, RADIUS } from '../lib/design/tokens'
import { H } from '../lib/haptics'
import { OPACITY } from '../lib/theme'

const flat = (id: string) => StyleSheet.flatten(screen.getByTestId(id).props.style)

let announce: jest.SpyInstance
beforeEach(() => {
  Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true })
  announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {})
})

describe('<Banner>', () => {
  it.each([
    ['offline', COLOR.destructiveTint],
    ['paused', COLOR.warningTint],
    ['info', COLOR.surface],
  ] as const)('%s is solid, 16 pt corners, its own fill', async (kind, fill) => {
    await render(<Banner kind={kind} text="Offline. Showing what loaded last." testID="b" />)
    expect(flat('b')).toMatchObject({ backgroundColor: fill, borderRadius: RADIUS.rowInCard })
  })

  it('draws a mono suffix after the sentence in Geist Mono, and announces both', async () => {
    await render(<Banner kind="offline" text="Offline. Showing what loaded last at" mono="9:41 PM" testID="b" />)
    expect(screen.getByText('9:41 PM', { exact: false }).props.style).toMatchObject({ fontFamily: FONT_FAMILY.mono[500] })
    expect(announce).toHaveBeenCalledWith('Offline. Showing what loaded last at 9:41 PM')
  })

  it('is announced politely when it arrives, and plays no haptic', async () => {
    const spies = Object.keys(H).map((k) => jest.spyOn(H, k as keyof typeof H).mockImplementation(() => {}))
    await render(<Banner kind="offline" text="Offline. Showing what loaded last." />)
    expect(announce).toHaveBeenCalledWith('Offline. Showing what loaded last.')
    for (const spy of spies) expect(spy).not.toHaveBeenCalled()
  })

  it('its action is a button; busy dims it and holds it', async () => {
    const onPress = jest.fn()
    await render(<Banner kind="info" text="Dating is on for this event." action={{ label: 'Change', onPress }} />)
    await fireEvent.press(screen.getByRole('button', { name: 'Change' }))
    expect(onPress).toHaveBeenCalledTimes(1)

    await render(<Banner kind="info" text="Dating is on for this event." action={{ label: 'Change', onPress }} busy />)
    const action = screen.getByRole('button', { name: 'Change' })
    expect(action.props.accessibilityState).toMatchObject({ disabled: true, busy: true })
    expect(StyleSheet.flatten(action.props.style).opacity).toBe(OPACITY.disabled)
  })

  it('Increase Contrast adds the 50% hairline', async () => {
    jest.spyOn(AccessibilityInfo, 'isDarkerSystemColorsEnabled').mockResolvedValue(true)
    await render(<Banner kind="offline" text="Offline." testID="b" />)
    await act(async () => {})
    expect(flat('b').borderColor).toBe(MATERIAL.hairlineIncreaseContrast)
  })

  it('past 1.3× text the action wraps under the sentence', async () => {
    // The React Native jest preset starts at fontScale 2.
    const window = Dimensions.get('window')
    Dimensions.set({ window: { ...window, fontScale: 1 } })
    await render(<Banner kind="info" text="Dating is on." action={{ label: 'Change', onPress: jest.fn() }} testID="b" />)
    expect(flat('b').flexWrap).toBeUndefined()
    await act(async () => Dimensions.set({ window: { ...window, fontScale: 2 } }))
    expect(flat('b').flexWrap).toBe('wrap')
    await act(async () => Dimensions.set({ window }))
  })
})

describe('<VisibilityBanner>', () => {
  it.each([
    ['named', 'You’re in this room as Sam, with your photo. People here can see you.', 'Go anonymous'],
    ['anon', 'You’re in this room as Sam. Nobody here sees your name or photo.', 'Show who I am'],
    ['hidden', 'You’re not listed here. Show online status is off.', 'Turn it on'],
    ['blocked', 'You’re in this room as Sam. Add a photo to your profile first; that’s what other people would see.', 'Add a photo'],
  ] as const)('%s: its own sentence and action', async (state, sentence, action) => {
    await render(<VisibilityBanner state={state} name="Sam" onAction={jest.fn()} />)
    expect(screen.getByText(sentence)).toBeTruthy()
    expect(screen.getByRole('button', { name: action })).toBeTruthy()
  })

  it('is read on entering the Room, not announced', async () => {
    await render(<VisibilityBanner state="anon" name="Night Cat" onAction={jest.fn()} />)
    expect(announce).not.toHaveBeenCalled()
  })
})

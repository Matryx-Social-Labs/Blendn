/*
 * <TextField> and <TextArea> (guidelines/components/TextField.html,
 * TextArea.html; ROUND3 "one field"): the solid surface capsule and its
 * multi-line sibling, every state the pages draw, the counter, the secure eye,
 * no haptic, and the accessibility matrix.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import React from 'react'
import { AccessibilityInfo, Platform, StyleSheet, TextInput } from 'react-native'

import { TextArea, TextField } from '../components/ds/TextField'
import { COLOR, FONT_FAMILY, MATERIAL, RADIUS, SIZE } from '../lib/design/tokens'
import { H } from '../lib/haptics'
import { OPACITY } from '../lib/theme'

const flat = (id: string) => StyleSheet.flatten(screen.getByTestId(id, { includeHiddenElements: true }).props.style)
const input = () => screen.getByTestId('f-input')

let haptics: jest.SpyInstance[]
beforeEach(() => {
  haptics = (['error', 'select', 'primary'] as const).map((k) => jest.spyOn(H, k).mockImplementation(() => {}))
})

const field = (props: Partial<React.ComponentProps<typeof TextField>> = {}) => (
  <TextField label="Email" value="" onChangeText={jest.fn()} placeholder="you@example.com" testID="f" {...props} />
)

describe('<TextField>', () => {
  it('is a 56 pt surface capsule under a Geist Mono label', async () => {
    await render(field())
    expect(flat('f-box')).toMatchObject({ height: SIZE.input, borderRadius: RADIUS.capsule, backgroundColor: COLOR.surface })
    const label = StyleSheet.flatten(screen.getByText('Email').props.style)
    expect(label).toMatchObject({ fontFamily: FONT_FAMILY.mono[500], color: COLOR.textSecondary })
  })

  it('rests on a 1 pt inputBorder; focus is a 2 pt white ring; blur returns it', async () => {
    await render(field())
    expect(flat('f-border')).toMatchObject({ borderWidth: 1, borderColor: COLOR.inputBorder })
    await fireEvent(input(), 'focus')
    expect(flat('f-border')).toMatchObject({ borderWidth: 2, borderColor: COLOR.focusRing })
    await fireEvent(input(), 'blur')
    expect(flat('f-border').borderWidth).toBe(1)
  })

  it('error: a destructive ring and one sentence, read as the hint', async () => {
    await render(field({ value: 'sam@blendn', error: 'That doesn’t look like an email.' }))
    expect(flat('f-border').borderColor).toBe(COLOR.destructive)
    expect(StyleSheet.flatten(screen.getByText('That doesn’t look like an email.').props.style).color).toBe(COLOR.destructive)
    expect(input().props.accessibilityHint).toBe('That doesn’t look like an email.')
    expect(input().props.accessibilityLabel).toBe('Email')
  })

  it('an error is announced when it arrives: iOS speaks it, Android’s line is an assertive live region', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibilityWithOptions').mockImplementation(() => {})
    await render(field({ value: 'sam@blendn' }))
    expect(announce).not.toHaveBeenCalled()
    await screen.rerender(field({ value: 'sam@blendn', error: 'That doesn’t look like an email.' }))
    expect(announce).toHaveBeenCalledWith('That doesn’t look like an email.', { queue: true })
    expect(screen.getByText('That doesn’t look like an email.').props.accessibilityLiveRegion).toBe('assertive')
    Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true })
    announce.mockClear()
    await render(field({ value: 'sam@blendn' }))
    await screen.rerender(field({ value: 'sam@blendn', error: 'That doesn’t look like an email.' }))
    expect(announce).not.toHaveBeenCalled()
    Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true })
  })

  it('a tap anywhere on the capsule focuses the field, not only on the text', async () => {
    const focus = jest.spyOn(TextInput.prototype, 'focus')
    await render(field())
    await fireEvent.press(screen.getByTestId('f-box'))
    expect(focus).toHaveBeenCalledTimes(1)
  })

  it('plays nothing on focus or typing (H.error is the submit button’s, once)', async () => {
    const onChangeText = jest.fn()
    await render(field({ onChangeText }))
    await fireEvent(input(), 'focus')
    await fireEvent.changeText(input(), 'sam@')
    expect(onChangeText).toHaveBeenCalledWith('sam@')
    for (const h of haptics) expect(h).not.toHaveBeenCalled()
  })

  it('disabled: 45%, not editable, announced', async () => {
    await render(field({ value: 'sam@blendn.app', disabled: true }))
    expect(flat('f').opacity).toBe(OPACITY.disabled)
    expect(input().props.editable).toBe(false)
    expect(input().props.accessibilityState).toMatchObject({ disabled: true })
  })

  it('a hint sits under the box in textTertiary', async () => {
    await render(field({ label: 'Age', hint: 'Blend’n is for people 18 and over.' }))
    expect(StyleSheet.flatten(screen.getByText('Blend’n is for people 18 and over.').props.style).color).toBe(COLOR.textTertiary)
    expect(input().props.accessibilityHint).toBe('Blend’n is for people 18 and over.')
  })

  it('secure: dots in Geist Mono, and an eye that is its own button', async () => {
    await render(field({ label: 'Password', value: 'hunter2hunter2', secure: true }))
    expect(input().props.secureTextEntry).toBe(true)
    expect(StyleSheet.flatten(input().props.style).fontFamily).toBe(FONT_FAMILY.mono[500])
    await fireEvent.press(screen.getByRole('button', { name: 'Show password' }))
    expect(input().props.secureTextEntry).toBe(false)
    expect(screen.getByRole('button', { name: 'Hide password' })).toBeTruthy()
  })

  it('a counter inside the box counts characters, not UTF-16 units, and reads as the hint', async () => {
    await render(field({ label: 'Crew name', value: 'Neb🌌', limit: 32 }))
    expect(screen.getByText('4/32', { includeHiddenElements: true })).toBeTruthy()
    expect(input().props.accessibilityHint).toBe('4 of 32 characters')
  })

  it('caps the value at 1.3× inside the fixed 56 pt; the label scales freely', async () => {
    await render(field())
    expect(input().props.maxFontSizeMultiplier).toBe(1.3)
    expect(screen.getByText('Email').props.maxFontSizeMultiplier).toBeUndefined()
  })

  it('previewState focused draws the focus ring with no keyboard', async () => {
    await render(field({ previewState: 'focused' }))
    expect(flat('f-border')).toMatchObject({ borderWidth: 2, borderColor: COLOR.focusRing })
  })

})

const BIO = 'Records, late trains, and arguing about B-sides. Usually at Toit on Fridays.'
const area = (props: Partial<React.ComponentProps<typeof TextArea>> = {}) => (
  <TextArea label="About me" value={BIO} onChangeText={jest.fn()} limit={500} testID="f" {...props} />
)

describe('<TextArea>', () => {
  it('is a 160 pt minimum box, radius 24, multi-line', async () => {
    await render(area())
    expect(flat('f-box')).toMatchObject({ minHeight: 160, borderRadius: RADIUS.sheet, backgroundColor: COLOR.surface })
    expect(input().props.multiline).toBe(true)
  })

  it('takes a shorter minimum (Make a crew’s line)', async () => {
    await render(area({ minHeight: 72 }))
    expect(flat('f-box').minHeight).toBe(72)
  })

  it('the counter sits in the label row, reads as the hint, and turns amber in the last 40', async () => {
    await render(area())
    const counter = screen.getByText(`${BIO.length}/500`, { includeHiddenElements: true })
    expect(StyleSheet.flatten(counter.props.style).color).toBe(COLOR.textTertiary)
    expect(input().props.accessibilityHint).toBe(`${BIO.length} of 500 characters`)
    await render(area({ value: 'x'.repeat(472) }))
    expect(StyleSheet.flatten(screen.getByText('472/500', { includeHiddenElements: true }).props.style).color).toBe(COLOR.warning)
  })

  it('never truncates at the cap: the Save button refuses instead', async () => {
    await render(area())
    expect(input().props.maxLength).toBeUndefined()
  })

  it('grows with its text (flex-grow from its content, never basis 0) and scales it freely', async () => {
    await render(area())
    expect(StyleSheet.flatten(input().props.style)).toMatchObject({ flexGrow: 1 })
    expect(StyleSheet.flatten(input().props.style).flexBasis).toBeUndefined()
    expect(StyleSheet.flatten(input().props.style).flex).toBeUndefined()
    expect(input().props.maxFontSizeMultiplier).toBeUndefined()
  })

  it('error: the ring and the sentence; focus: the 2 pt white ring', async () => {
    await render(area({ error: 'Keep contact details out of your bio.' }))
    expect(flat('f-border').borderColor).toBe(COLOR.destructive)
    expect(screen.getByText('Keep contact details out of your bio.')).toBeTruthy()
    await render(area({ previewState: 'focused' }))
    expect(flat('f-border')).toMatchObject({ borderWidth: 2, borderColor: COLOR.focusRing })
  })
})

// Last: the settings are remembered for every component mounted after (shared.ts).
describe('the accessibility settings', () => {
  it('Increase Contrast: the resting border at 50% and the label white', async () => {
    jest.spyOn(AccessibilityInfo, 'isDarkerSystemColorsEnabled').mockResolvedValue(true)
    await render(field())
    await act(async () => {})
    expect(flat('f-border').borderColor).toBe(MATERIAL.hairlineIncreaseContrast)
    expect(StyleSheet.flatten(screen.getByText('Email').props.style).color).toBe(COLOR.textPrimary)
  })

  it('Bold Text steps the value up a weight', async () => {
    jest.spyOn(AccessibilityInfo, 'isBoldTextEnabled').mockResolvedValue(true)
    await render(field({ value: 'sam@blendn.app' }))
    await act(async () => {})
    expect(StyleSheet.flatten(input().props.style).fontFamily).toBe(FONT_FAMILY.brand[700])
  })
})

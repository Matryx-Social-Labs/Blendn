/*
 * <SearchField> (guidelines/components/SearchField.html; ROUND3 "off glass"):
 * the 48 pt 8% capsule with a 38% hairline, the 2 pt ring while active, the
 * spinner while results load, × that clears and keeps focus, surfaceSunken in
 * an Android sheet, silent throughout.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import React from 'react'
import { AccessibilityInfo, Platform, StyleSheet, TextInput } from 'react-native'

import { SearchField } from '../components/ds/SearchField'
import { COLOR, MATERIAL, RADIUS, SIZE } from '../lib/design/tokens'
import { H } from '../lib/haptics'
import { OPACITY } from '../lib/theme'

const flat = (id: string) => StyleSheet.flatten(screen.getByTestId(id, { includeHiddenElements: true }).props.style)
const input = () => screen.getByTestId('s-input')
const on = (os: 'ios' | 'android') => Object.defineProperty(Platform, 'OS', { value: os, configurable: true })

beforeEach(() => on('ios'))

const draw = (props: Partial<React.ComponentProps<typeof SearchField>> = {}) =>
  render(<SearchField value="" onChangeText={jest.fn()} placeholder="Search events…" testID="s" {...props} />)

describe('<SearchField>', () => {
  it('is a 48 pt capsule of 8% white with a 38% hairline, never a field’s solid surface', async () => {
    await draw()
    expect(flat('s')).toMatchObject({ height: SIZE.control, borderRadius: RADIUS.capsule, backgroundColor: MATERIAL.fillOnGlass })
    expect(flat('s-border')).toMatchObject({ borderWidth: 1, borderColor: COLOR.inputBorder })
    expect(input().props.placeholderTextColor).toBe(COLOR.textPlaceholder)
  })

  it('is a search field named by its scope', async () => {
    await draw()
    expect(input().props.accessibilityRole).toBe('search')
    expect(input().props.accessibilityLabel).toBe('Search events')
  })

  it('focus or a value takes the 2 pt white ring', async () => {
    await draw()
    await fireEvent(input(), 'focus')
    expect(flat('s-border')).toMatchObject({ borderWidth: 2, borderColor: COLOR.focusRing })
    await fireEvent(input(), 'blur')
    expect(flat('s-border').borderWidth).toBe(1)
    await draw({ value: 'jazz' })
    expect(flat('s-border').borderWidth).toBe(2)
  })

  it('previewState focused draws the ring with no keyboard', async () => {
    await draw({ previewState: 'focused' })
    expect(flat('s-border')).toMatchObject({ borderWidth: 2, borderColor: COLOR.focusRing })
  })

  it('busy: the glass glyph becomes the spinner', async () => {
    await draw({ value: 'jazz', busy: true })
    expect(screen.getByTestId('s-spinner', { includeHiddenElements: true })).toBeTruthy()
  })

  it('× clears, keeps focus, and is silent', async () => {
    const select = jest.spyOn(H, 'select').mockImplementation(() => {})
    const focus = jest.spyOn(TextInput.prototype, 'focus')
    const onChangeText = jest.fn()
    await draw({ value: 'jazz', onChangeText })
    await fireEvent.press(screen.getByRole('button', { name: 'Clear search' }))
    expect(onChangeText).toHaveBeenCalledWith('')
    expect(focus).toHaveBeenCalled()
    expect(select).not.toHaveBeenCalled()
  })

  it('no × with nothing to clear', async () => {
    await draw()
    expect(screen.queryByRole('button', { name: 'Clear search' })).toBeNull()
  })

  it('in a sheet: 8% white on iOS glass, surfaceSunken on Android’s solid sheet', async () => {
    await draw({ inSheet: true })
    expect(flat('s').backgroundColor).toBe(MATERIAL.fillOnGlass)
    on('android')
    await draw({ inSheet: true })
    expect(flat('s').backgroundColor).toBe(COLOR.surfaceSunken)
  })

  it('announces the result count once results settle, not while busy', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {})
    await draw({ value: 'jazz', busy: true, resultsLabel: '12 events' })
    expect(announce).not.toHaveBeenCalled()
    await screen.rerender(<SearchField value="jazz" onChangeText={jest.fn()} placeholder="Search events…" resultsLabel="12 events" />)
    expect(announce).toHaveBeenCalledWith('12 events')
  })

  it('disabled: 45%, not editable', async () => {
    await draw({ disabled: true })
    expect(flat('s').opacity).toBe(OPACITY.disabled)
    expect(input().props.editable).toBe(false)
  })

  it('caps the value at 1.3× inside 48 pt', async () => {
    await draw()
    expect(input().props.maxFontSizeMultiplier).toBe(1.3)
  })

  it('Increase Contrast: the hairline at 50%, the placeholder textSecondary', async () => {
    jest.spyOn(AccessibilityInfo, 'isDarkerSystemColorsEnabled').mockResolvedValue(true)
    await draw()
    await act(async () => {})
    expect(flat('s-border').borderColor).toBe(MATERIAL.hairlineIncreaseContrast)
    expect(input().props.placeholderTextColor).toBe(COLOR.textSecondary)
  })
})

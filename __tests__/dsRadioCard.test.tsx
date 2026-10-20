/*
 * <RadioCard> and <LookingForCard> (guidelines/components/RadioCard.html,
 * LookingForCard.html): a choice that deserves a picture. Selected is the 2 pt
 * white ring and the check disc; H.select on a change, never on the selected
 * card or a disabled one; Android has no ripple (the ring is the feedback).
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import React from 'react'
import { AccessibilityInfo, Platform, StyleSheet } from 'react-native'

import { LookingForCard } from '../components/ds/LookingForCard'
import { RadioCard } from '../components/ds/RadioCard'
import { COLOR, MATERIAL, RADIUS } from '../lib/design/tokens'
import { H } from '../lib/haptics'
import { OPACITY } from '../lib/theme'

const flat = (id: string) => StyleSheet.flatten(screen.getByTestId(id, { includeHiddenElements: true }).props.style)
const on = (os: 'ios' | 'android') => Object.defineProperty(Platform, 'OS', { value: os, configurable: true })

let select: jest.SpyInstance
beforeEach(() => {
  on('ios')
  select = jest.spyOn(H, 'select').mockImplementation(() => {})
})

const card = (props: Partial<React.ComponentProps<typeof RadioCard>> = {}) => (
  <RadioCard title="Anonymous" hint="Nobody here sees your name or photo." icon="user" onPress={jest.fn()} testID="r" {...props} />
)

describe('<RadioCard>', () => {
  it('is a surface card, radius 24, with the consequence under the title', async () => {
    await render(card())
    expect(flat('r')).toMatchObject({ borderRadius: RADIUS.sheet, backgroundColor: COLOR.surface })
    expect(StyleSheet.flatten(screen.getByText('Nobody here sees your name or photo.').props.style).color).toBe(COLOR.textSecondary)
  })

  it('selected: the 2 pt white ring and the check disc', async () => {
    await render(card({ selected: true }))
    expect(flat('r-ring')).toMatchObject({ borderWidth: 2, borderColor: COLOR.selectionFill })
    expect(flat('r-check').backgroundColor).toBe(COLOR.selectionFill)
  })

  it('is a radio button that reads its title and consequence', async () => {
    await render(card({ selected: true }))
    const radio = screen.getByRole('radio', { name: 'Anonymous, Nobody here sees your name or photo.' })
    expect(radio.props.accessibilityState).toMatchObject({ checked: true })
  })

  it('plays H.select on a change, and nothing on the selected card', async () => {
    const onPress = jest.fn()
    await render(card({ onPress }))
    await fireEvent.press(screen.getByTestId('r'))
    expect(onPress).toHaveBeenCalledTimes(1)
    expect(select).toHaveBeenCalledTimes(1)
    await render(card({ selected: true, onPress }))
    await fireEvent.press(screen.getByTestId('r'))
    expect(select).toHaveBeenCalledTimes(1)
  })

  it('deselectable: a tap on the selected card clears it, plays H.select, and it reads as a checkbox', async () => {
    const onPress = jest.fn()
    await render(card({ selected: true, deselectable: true, onPress }))
    await fireEvent.press(screen.getByTestId('r'))
    expect(onPress).toHaveBeenCalledTimes(1)
    expect(select).toHaveBeenCalledTimes(1)
    const box = screen.getByRole('checkbox', { name: 'Anonymous, Nobody here sees your name or photo.' })
    expect(box.props.accessibilityState).toMatchObject({ checked: true })
    expect(screen.queryByRole('radio')).toBeNull()
  })

  it('deselectable stays opt-in: the default selected card is still inert', async () => {
    const onPress = jest.fn()
    await render(card({ selected: true, onPress }))
    await fireEvent.press(screen.getByTestId('r'))
    expect(onPress).not.toHaveBeenCalled()
  })

  it('disabled (blocked) dims to 60% so the reason stays readable, and does nothing', async () => {
    const onPress = jest.fn()
    await render(card({ disabled: true, hint: 'Add a photo to your profile first.', onPress }))
    expect(flat('r').opacity).toBe(0.6)
    await fireEvent.press(screen.getByTestId('r'))
    expect(onPress).not.toHaveBeenCalled()
    expect(select).not.toHaveBeenCalled()
  })

  it('focused draws the ring', async () => {
    await render(card({ previewState: 'focused' }))
    expect(screen.getByTestId('r-focus')).toBeTruthy()
  })
})

const ART = { uri: 'looking-friendship' }
const tile = (props: Partial<React.ComponentProps<typeof LookingForCard>> = {}) => (
  <LookingForCard label="Friendship" image={ART} onPress={jest.fn()} testID="l" {...props} />
)

describe('<LookingForCard>', () => {
  it('is a 112 pt photo tile, radius 24, the word on a scrim', async () => {
    await render(tile())
    expect(flat('l-tile')).toMatchObject({ height: 112, borderRadius: RADIUS.sheet, overflow: 'hidden' })
    expect(flat('l-scrim').experimental_backgroundImage).toContain('linear-gradient')
    expect(screen.getByText('Friendship').props.maxFontSizeMultiplier).toBe(1.3)
  })

  it('on: the 2 pt white ring outside the tile, and the check disc', async () => {
    await render(tile({ selected: true }))
    expect(flat('l-ring')).toMatchObject({ borderWidth: 2, borderColor: COLOR.selectionFill })
    expect(screen.getByTestId('l-check', { includeHiddenElements: true })).toBeTruthy()
  })

  it('is a button named by its word, selected or not; the photo is decorative', async () => {
    await render(tile({ selected: true }))
    expect(screen.getByRole('button', { name: 'Friendship' }).props.accessibilityState).toMatchObject({ selected: true })
  })

  it('multi-select: H.select on every change, on and off', async () => {
    const onPress = jest.fn()
    await render(tile({ selected: true, onPress }))
    await fireEvent.press(screen.getByTestId('l'))
    expect(onPress).toHaveBeenCalledTimes(1)
    expect(select).toHaveBeenCalledTimes(1)
  })

  it('disabled: 45%, does nothing', async () => {
    const onPress = jest.fn()
    await render(tile({ disabled: true, onPress }))
    expect(flat('l').opacity).toBe(OPACITY.disabled)
    await fireEvent.press(screen.getByTestId('l'))
    expect(onPress).not.toHaveBeenCalled()
  })
})

describe('Increase Contrast', () => {
  it('unselected cards take the 50% hairline; the consequence goes white', async () => {
    jest.spyOn(AccessibilityInfo, 'isDarkerSystemColorsEnabled').mockResolvedValue(true)
    await render(card())
    await act(async () => {})
    expect(flat('r-ring')).toMatchObject({ borderWidth: 1, borderColor: MATERIAL.hairlineIncreaseContrast })
    expect(StyleSheet.flatten(screen.getByText('Nobody here sees your name or photo.').props.style).color).toBe(COLOR.textPrimary)
    await render(tile())
    expect(flat('l-ring')).toMatchObject({ borderWidth: 1, borderColor: MATERIAL.hairlineIncreaseContrast })
  })
})

describe('<RadioCard> in a row of two (the Board composer, A61)', () => {
  it('grows to its slot but never takes a zero basis: it is as tall as its well, title and consequence', async () => {
    await render(card())
    const style = StyleSheet.flatten(screen.getByTestId('r').props.style)
    // `flex: 1` collapsed it to its padding in an auto-height row; the well and the words spilled out.
    expect(style.flexGrow).toBe(1)
    expect(style.flex).toBeUndefined()
    expect(style.flexBasis).toBeUndefined()
  })
})

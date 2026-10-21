/*
 * <RadioCard> and <LookingForCard> (guidelines/components/RadioCard.html,
 * LookingForCard.html): a choice that deserves a picture. Selected is the 2 pt
 * ring in the screen's hue, the card's fill stepping to the hue's, and the check disc; H.select on a change, never on the selected
 * card or a disabled one; Android has no ripple (the ring is the feedback).
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import React from 'react'
import { AccessibilityInfo, Platform, StyleSheet } from 'react-native'
import * as Reanimated from 'react-native-reanimated'

import { LookingForCard } from '../components/ds/LookingForCard'
import { RadioCard } from '../components/ds/RadioCard'
import { HueProvider, SELECTION } from '../components/ds/shared'
import { COLOR, MATERIAL, RADIUS } from '../lib/design/tokens'
import { H } from '../lib/haptics'
import { OPACITY } from '../lib/theme'

jest.mock('react-native-reanimated', () => ({ ...jest.requireActual('react-native-reanimated'), __esModule: true, useReducedMotion: jest.fn(() => false) }))

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

  it('selected: the 2 pt ember ring, the card’s fill stepped to the hue, the check disc in the glyph colour', async () => {
    await render(card({ selected: true }))
    expect(flat('r-ring')).toMatchObject({ borderWidth: 2, borderColor: COLOR.brandOrange, opacity: 1 })
    expect(flat('r').backgroundColor).toBe(COLOR.selectionEmberFill)
    expect(flat('r-check')).toMatchObject({ backgroundColor: COLOR.selectionEmberGlyph, opacity: 1 })
  })

  it('off: the ring and the check are drawn at 0 opacity, so they fade rather than appear', async () => {
    await render(card())
    expect(flat('r-ring').opacity).toBe(0)
    expect(flat('r-check').opacity).toBe(0)
    expect(flat('r').backgroundColor).toBe(COLOR.surface)
    expect(String(StyleSheet.flatten(screen.getByTestId('r', { includeHiddenElements: true }).props.jestInlineStyle).transition)).toContain('background-color 160ms')
  })

  it.each(['ember', 'rose', 'violet'] as const)('under the %s hue the ring, the fill and the disc follow it', async (hue) => {
    await render(
      <HueProvider value={hue}>
        <RadioCard title="A" selected onPress={jest.fn()} testID="r" />
      </HueProvider>
    )
    expect(flat('r-ring').borderColor).toBe(SELECTION[hue].edge)
    expect(flat('r').backgroundColor).toBe(SELECTION[hue].fill)
    expect(flat('r-check').backgroundColor).toBe(SELECTION[hue].glyph)
  })

  it('the ✓ is ink on the disc, and draws once when the card is picked (never on mount)', async () => {
    const timing = jest.spyOn(Reanimated, 'withTiming')
    await render(card({ selected: true }))
    expect(screen.getByTestId('r-check-glyph', { includeHiddenElements: true })).toBeTruthy()
    expect(timing).not.toHaveBeenCalled()
    await screen.rerender(card({ selected: false }))
    expect(timing).not.toHaveBeenCalled()
    await screen.rerender(card({ selected: true }))
    expect(timing).toHaveBeenCalled()
    timing.mockRestore()
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

  it('on: the 2 pt hue ring outside the tile, and the check disc', async () => {
    await render(tile({ selected: true }))
    expect(flat('l-ring')).toMatchObject({ borderWidth: 2, borderColor: COLOR.brandOrange })
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

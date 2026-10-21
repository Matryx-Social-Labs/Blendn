/*
 * <Chip> and <InterestChip> (guidelines/components/Chip.html): one 32 pt
 * capsule for every pick-from-a-set; lit in the screen's hue when on; dimmed at a cap,
 * never hidden; × on a filter; H.select on every change and nothing else.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import React from 'react'
import { AccessibilityInfo, Platform, StyleSheet } from 'react-native'
import * as Reanimated from 'react-native-reanimated'

import { Chip, InterestChip } from '../components/ds/Chip'
import { GroundProvider, HueProvider, SELECTION } from '../components/ds/shared'
import { COLOR, FONT_FAMILY, ICON, MATERIAL, RADIUS, SIZE } from '../lib/design/tokens'
import { H } from '../lib/haptics'
import { OPACITY } from '../lib/theme'

jest.mock('react-native-reanimated', () => ({ ...jest.requireActual('react-native-reanimated'), __esModule: true, useReducedMotion: jest.fn(() => false) }))
const reduceMotion = Reanimated.useReducedMotion as jest.Mock

const flat = (id: string) => StyleSheet.flatten(screen.getByTestId(id, { includeHiddenElements: true }).props.style)
const on = (os: 'ios' | 'android') => Object.defineProperty(Platform, 'OS', { value: os, configurable: true })

let select: jest.SpyInstance
beforeEach(() => {
  on('ios')
  select = jest.spyOn(H, 'select').mockImplementation(() => {})
  reduceMotion.mockReturnValue(false)
})

const draw = (props: Partial<React.ComponentProps<typeof Chip>> = {}) =>
  render(<Chip label="Live music" onPress={jest.fn()} testID="c" {...props} />)

describe('<Chip>', () => {
  it('off: a 32 pt surface capsule with a 0.5 pt hairline and white type', async () => {
    await draw()
    expect(flat('c')).toMatchObject({ height: SIZE.tag, borderRadius: RADIUS.capsule, backgroundColor: COLOR.surface })
    expect(flat('c-edge')).toMatchObject({ borderWidth: 0.5, borderColor: COLOR.hairline })
    expect(StyleSheet.flatten(screen.getByText('Live music').props.style).color).toBe(COLOR.textPrimary)
  })

  it('on: the chip keeps its resting fill and the light is the hue; the label stays white', async () => {
    await draw({ selected: true })
    expect(flat('c').backgroundColor).toBe(COLOR.surface)
    expect(flat('c-light').backgroundColor).toBe(COLOR.selectionEmberFill)
    expect(StyleSheet.flatten(screen.getByText('Live music').props.style).color).toBe(COLOR.textPrimary)
  })

  it('reads “Live music, selected, button”', async () => {
    await draw({ selected: true })
    const chip = screen.getByRole('button', { name: 'Live music' })
    expect(chip.props.accessibilityState).toMatchObject({ selected: true })
  })

  it('plays H.select on a change and calls back', async () => {
    const onPress = jest.fn()
    await draw({ onPress })
    await fireEvent.press(screen.getByTestId('c'))
    expect(onPress).toHaveBeenCalledTimes(1)
    expect(select).toHaveBeenCalledTimes(1)
  })

  it('dimmed at the cap: 45%, does nothing, plays nothing, and says why', async () => {
    const onPress = jest.fn()
    await draw({ dimmed: true, capHint: 'Up to 10', onPress })
    expect(flat('c').opacity).toBe(OPACITY.disabled)
    const chip = screen.getByTestId('c')
    expect(chip.props.accessibilityHint).toBe('Up to 10')
    await fireEvent.press(chip)
    expect(onPress).not.toHaveBeenCalled()
    expect(select).not.toHaveBeenCalled()
  })

  it('a filter carries × and removes itself, with H.select', async () => {
    const onRemove = jest.fn()
    await render(<Chip label="This weekend" selected onRemove={onRemove} testID="c" />)
    await fireEvent.press(screen.getByRole('button', { name: 'This weekend, remove filter' }))
    expect(onRemove).toHaveBeenCalledTimes(1)
    expect(select).toHaveBeenCalledTimes(1)
  })

  it('reaches the 44 pt target around a 32 pt chip', async () => {
    await draw()
    expect(screen.getByTestId('c').props.hitSlop).toMatchObject({ top: 6, bottom: 6 })
    on('android')
    await draw()
    expect(screen.getByTestId('c').props.hitSlop).toMatchObject({ top: 8, bottom: 8 })
  })

  it('Android pressed: the corner squares to 8 dp, and back on release', async () => {
    on('android')
    await draw()
    await fireEvent(screen.getByTestId('c'), 'pressIn')
    expect(flat('c').borderRadius).toBe(RADIUS.thumb)
    await fireEvent(screen.getByTestId('c'), 'pressOut')
    expect(flat('c').borderRadius).toBe(RADIUS.capsule)
  })

  it('caps the label at 1.3× inside 32 pt', async () => {
    await draw()
    expect(screen.getByText('Live music').props.maxFontSizeMultiplier).toBe(1.3)
  })

  it('focused draws the ring', async () => {
    await draw({ previewState: 'focused' })
    expect(screen.getByTestId('c-focus')).toBeTruthy()
  })
})

describe('<InterestChip>', () => {
  it('is read-only; a shared interest takes a 1 pt white outline and says so', async () => {
    await render(<InterestChip label="Vinyl" shared testID="c" />)
    expect(screen.queryByRole('button')).toBeNull()
    expect(flat('c-edge')).toMatchObject({ borderWidth: 1, borderColor: COLOR.textPrimary })
    expect(screen.getByLabelText('Vinyl, shared')).toBeTruthy()
  })
})

describe('Increase Contrast', () => {
  it('the off hairline goes to 1 pt at 50%', async () => {
    jest.spyOn(AccessibilityInfo, 'isDarkerSystemColorsEnabled').mockResolvedValue(true)
    await draw()
    await act(async () => {})
    expect(flat('c-edge')).toMatchObject({ borderWidth: 1, borderColor: MATERIAL.hairlineIncreaseContrast })
  })
})

describe('the fill crosses over quick (DS Flow 10, 10.2: "fill 0 → 1 on quick")', () => {
  /** Reanimated's jest build keeps a CSS transition only in the inline style it was given (as CountTicks' test reads it). */
  const transition = (id: string) => String(StyleSheet.flatten(screen.getByTestId(id, { includeHiddenElements: true }).props.jestInlineStyle).transition)

  it('the pressable carries a CSS transition on its fill: 160 ms on the gentle curve', async () => {
    await draw()
    expect(transition('c')).toBe('background-color 160ms cubic-bezier(0.33, 1, 0.68, 1), opacity 160ms cubic-bezier(0.33, 1, 0.68, 1)')
  })

  it('the hairline fades out as the fill comes in: always drawn, at 0 opacity once selected', async () => {
    await draw({ selected: true })
    expect(flat('c-edge')).toMatchObject({ opacity: 0 })
    expect(transition('c-edge')).toBe('opacity 160ms cubic-bezier(0.33, 1, 0.68, 1)')
    await screen.rerender(<Chip label="Live music" onPress={jest.fn()} testID="c" selected={false} />)
    // Back on: the edge it had (whichever the system’s contrast setting makes it).
    expect(flat('c-edge').opacity).toBe(1)
    expect(flat('c-edge').borderWidth).toBeGreaterThan(0)
  })

  it('a shared (outlined) interest keeps its edge whatever', async () => {
    await render(<Chip label="Jazz" shared testID="c" />)
    expect(flat('c-edge')).toMatchObject({ borderWidth: 1, borderColor: COLOR.textPrimary, opacity: 1 })
  })

  it('the dim at a cap is in the same transition, so it crosses rather than snaps', async () => {
    await draw({ dimmed: true })
    expect(transition('c')).toContain('opacity 160ms')
  })

})

describe('the light (direction C: lit from behind)', () => {
  const transition = (id: string) => String(StyleSheet.flatten(screen.getByTestId(id, { includeHiddenElements: true }).props.jestInlineStyle).transition)

  it('off: the light waits out of the chip, at 0 opacity; on: it is in, at 1', async () => {
    await draw()
    expect(flat('c-light')).toMatchObject({ opacity: 0, transform: [{ translateX: '-101%' }] })
    await screen.rerender(<Chip label="Live music" selected onPress={jest.fn()} testID="c" />)
    expect(flat('c-light')).toMatchObject({ opacity: 1, transform: [{ translateX: '0%' }] })
  })

  it('pours in over base on the entrance curve, drains over quick on the standard curve', async () => {
    await draw({ selected: true })
    expect(transition('c-light')).toBe(
      'transform 220ms cubic-bezier(0.16, 1, 0.3, 1), opacity 160ms cubic-bezier(0.33, 1, 0.68, 1)'
    )
    await screen.rerender(<Chip label="Live music" onPress={jest.fn()} testID="c" />)
    expect(transition('c-light')).toBe('transform 160ms cubic-bezier(0.2, 0, 0, 1), opacity 160ms cubic-bezier(0.33, 1, 0.68, 1)')
  })

  it('the light fills the chip behind the content and takes no touch', async () => {
    await draw({ selected: true })
    expect(flat('c-light')).toMatchObject({ position: 'absolute', borderRadius: RADIUS.capsule })
    expect(screen.getByTestId('c-light').props.pointerEvents).toBe('none')
  })

  it('a 1 pt rim in the hue’s edge colour fades in as the hairline fades out', async () => {
    await draw()
    expect(flat('c-rim')).toMatchObject({ borderWidth: 1, borderColor: COLOR.brandOrange, opacity: 0 })
    await screen.rerender(<Chip label="Live music" selected onPress={jest.fn()} testID="c" />)
    expect(flat('c-rim').opacity).toBe(1)
    expect(flat('c-edge').opacity).toBe(0)
    expect(transition('c-rim')).toBe('opacity 160ms cubic-bezier(0.33, 1, 0.68, 1)')
  })

  it.each(['ember', 'rose', 'violet'] as const)('under the %s hue the light, the rim and the glyph are that hue’s', async (hue) => {
    await render(
      <HueProvider value={hue}>
        <Chip label="Live music" icon="music-2" selected onPress={jest.fn()} testID="c" />
      </HueProvider>
    )
    expect(flat('c-light').backgroundColor).toBe(SELECTION[hue].fill)
    expect(flat('c-rim').borderColor).toBe(SELECTION[hue].edge)
    expect(JSON.stringify(screen.toJSON())).toContain(SELECTION[hue].glyph)
  })

  it('the violet hue lights with selectionVioletFill and selectionVioletGlyph', async () => {
    await render(
      <HueProvider value="violet">
        <Chip label="Jazz" selection="multi" selected onPress={jest.fn()} testID="c" />
      </HueProvider>
    )
    expect(flat('c-light').backgroundColor).toBe(COLOR.selectionVioletFill)
    expect(JSON.stringify(screen.toJSON())).toContain(COLOR.selectionVioletGlyph)
  })

  it('the label is textPrimary and the same family on and off, so selecting never re-wraps', async () => {
    await draw()
    const off = StyleSheet.flatten(screen.getByText('Live music').props.style)
    await screen.rerender(<Chip label="Live music" selected onPress={jest.fn()} testID="c" />)
    const on = StyleSheet.flatten(screen.getByText('Live music').props.style)
    expect(on.color).toBe(COLOR.textPrimary)
    expect(on.fontFamily).toBe(off.fontFamily)
  })

  it('Reduce Motion: no translateX anywhere, the fill crosses over the Reduce Motion quick', async () => {
    reduceMotion.mockReturnValue(true)
    await draw({ selected: true })
    expect(JSON.stringify(StyleSheet.flatten(screen.getByTestId('c-light').props.style))).not.toContain('translateX')
    expect(flat('c-light').opacity).toBe(1)
    expect(transition('c-light')).toBe('opacity 160ms cubic-bezier(0.33, 1, 0.68, 1)')
    await screen.rerender(<Chip label="Live music" onPress={jest.fn()} testID="c" />)
    expect(JSON.stringify(StyleSheet.flatten(screen.getByTestId('c-light').props.style))).not.toContain('translateX')
    expect(flat('c-light').opacity).toBe(0)
  })

  it('the fold chip and a shared interest have no light', async () => {
    await draw({ kind: 'more', label: '+3 more' })
    expect(screen.queryByTestId('c-light')).toBeNull()
    await render(<Chip label="Jazz" shared testID="s" />)
    expect(screen.queryByTestId('s-light')).toBeNull()
  })

  it('H.select once per press, and the light adds none', async () => {
    await draw()
    await fireEvent.press(screen.getByTestId('c'))
    expect(select).toHaveBeenCalledTimes(1)
  })
})

describe('pick-any: the + / ✓ slot (the sweep, chips.html)', () => {
  const transition = (id: string) => String(StyleSheet.flatten(screen.getByTestId(id, { includeHiddenElements: true }).props.jestInlineStyle).transition)
  const multi = (props: Partial<React.ComponentProps<typeof Chip>> = {}) => draw({ selection: 'multi', ...props })

  it('off draws the plus, on draws the check, in a slot of the same 16 pt either way', async () => {
    await multi()
    expect(flat('c-slot')).toMatchObject({ width: ICON.inline, height: ICON.inline })
    expect(flat('c-check').opacity).toBe(0)
    await screen.rerender(<Chip label="Live music" selection="multi" selected onPress={jest.fn()} testID="c" />)
    expect(flat('c-slot')).toMatchObject({ width: ICON.inline, height: ICON.inline })
    expect(flat('c-check').opacity).toBe(1)
    expect(flat('c-check').transform).toEqual([{ scale: 1 }])
  })

  it('the check starts at .85 and settles on the snap-out curve; the plus fades on the gentle one', async () => {
    await multi()
    expect(flat('c-check').transform).toEqual([{ scale: 0.85 }])
    expect(transition('c-check')).toBe('opacity 160ms cubic-bezier(0.33, 1, 0.68, 1), transform 160ms cubic-bezier(0.23, 1, 0.32, 1)')
  })

  it('Reduce Motion: the check only fades, with no scale', async () => {
    reduceMotion.mockReturnValue(true)
    await multi()
    expect(flat('c-check').transform).toEqual([])
    expect(transition('c-check')).toBe('opacity 160ms cubic-bezier(0.33, 1, 0.68, 1)')
  })

  it('a chip with its own glyph shows it in place of the plus', async () => {
    await multi({ icon: 'music' })
    expect(screen.getByTestId('c-slot')).toBeTruthy()
  })

  it('a single chip has no slot, so nothing about it changes', async () => {
    await draw()
    expect(screen.queryByTestId('c-slot')).toBeNull()
  })
})

describe('count, the fold chip, the caller’s label', () => {
  it('a count is Geist Mono and secondary white, off and on', async () => {
    await draw({ count: 12 })
    expect(StyleSheet.flatten(screen.getByTestId('c-count').props.style)).toMatchObject({ fontFamily: FONT_FAMILY.mono[500], color: COLOR.textSecondary })
    await screen.rerender(<Chip label="Live music" selected count={12} onPress={jest.fn()} testID="c" />)
    expect(StyleSheet.flatten(screen.getByTestId('c-count').props.style).color).toBe(COLOR.textSecondary)
  })

  it('reads the caller’s label, else “label, count”, else the label', async () => {
    await draw({ label: 'Nightlife', count: 4, accessibilityLabel: 'Nightlife, 4 events' })
    expect(screen.getByRole('button', { name: 'Nightlife, 4 events' })).toBeTruthy()
    await draw({ label: 'Food', count: 7, testID: 'd' })
    expect(screen.getByRole('button', { name: 'Food, 7' })).toBeTruthy()
  })

  it('the fold chip is never selected, and carries a chevron that turns with it', async () => {
    await draw({ kind: 'more', selected: true, label: '+18 more' })
    expect(screen.getByTestId('c').props.accessibilityState.selected).toBeUndefined()
    expect(flat('c').backgroundColor).toBe(COLOR.surface)
    await draw({ kind: 'more', expanded: true, label: 'Show fewer', testID: 'e' })
    expect(screen.getByTestId('e').props.accessibilityState.expanded).toBe(true)
  })

  it('never outgrows its row: max width 100% and a shrinking label', async () => {
    await draw({ label: 'A very long label that would not fit on one line of a phone' })
    expect(flat('c').maxWidth).toBe('100%')
    expect(StyleSheet.flatten(screen.getByText(/A very long/).props.style).flexShrink).toBe(1)
  })
})

describe('the ground the chip sits on', () => {
  it.each([
    ['ink', COLOR.surface],
    ['surface', COLOR.surfaceSunken],
    ['glass', COLOR.chipFillOnGlass],
  ] as const)('on %s: the off fill is %s', async (ground, fill) => {
    await render(
      <GroundProvider value={ground}>
        <Chip label="Live music" onPress={jest.fn()} testID="c" />
      </GroundProvider>
    )
    expect(flat('c').backgroundColor).toBe(fill)
  })

  it('on a surface card, the chip keeps the sunken fill and the light is the hue', async () => {
    await render(
      <GroundProvider value="surface">
        <Chip label="Live music" selected onPress={jest.fn()} testID="c" />
      </GroundProvider>
    )
    expect(flat('c').backgroundColor).toBe(COLOR.surfaceSunken)
    expect(flat('c-light').backgroundColor).toBe(COLOR.selectionEmberFill)
  })
})

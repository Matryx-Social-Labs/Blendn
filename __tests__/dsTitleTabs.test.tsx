/*
 * <TitleTabs> (switch-v2 (c), amended by foundations C): the pane's title is the switch. The chosen word is white, the others
 * tertiary; the underline is the hue's edge, flat, and stretches into place on two springs; H.select once on a change.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import React from 'react'
import { Dimensions, StyleSheet, Text } from 'react-native'
import * as Reanimated from 'react-native-reanimated'

import { HueProvider } from '../components/ds/shared'
import { TitleTabs } from '../components/ds/TitleTabs'
import { COLOR, SIZE, SPACE, SPRING } from '../lib/design/tokens'
import { H } from '../lib/haptics'

jest.mock('react-native-reanimated', () => ({ ...jest.requireActual('react-native-reanimated'), __esModule: true, useReducedMotion: jest.fn(() => false) }))
const reduceMotion = Reanimated.useReducedMotion as jest.Mock

const flat = (id: string) => StyleSheet.flatten(screen.getByTestId(id, { includeHiddenElements: true }).props.style)
const layout = (id: string, x: number, width: number) =>
  act(async () => fireEvent(screen.getByTestId(id), 'layout', { nativeEvent: { layout: { x, y: 0, width, height: SIZE.control } } }))
/** Events at 0 (86 wide), Places at 110 (88 wide). */
const measured = async () => {
  await layout('t-0-place', 0, 86)
  await layout('t-1-place', 110, 88)
}

let select: jest.SpyInstance
let spring: jest.SpyInstance
beforeEach(() => {
  reduceMotion.mockReturnValue(false)
  select = jest.spyOn(H, 'select').mockImplementation(() => {})
  spring = jest.spyOn(Reanimated, 'withSpring')
})
afterEach(() => jest.restoreAllMocks())

const tabs = (props: Partial<React.ComponentProps<typeof TitleTabs>> = {}) => (
  <TitleTabs items={['Events', 'Places']} selected={0} onChange={jest.fn()} testID="t" {...props} />
)
const draw = (props: Partial<React.ComponentProps<typeof TitleTabs>> = {}) => render(tabs(props))

describe('<TitleTabs>', () => {
  it('is a tab list of tabs, the chosen one selected', async () => {
    await draw()
    expect(screen.getByTestId('t').props.accessibilityRole).toBe('tablist')
    expect(screen.getByRole('tab', { name: 'Events' }).props.accessibilityState).toMatchObject({ selected: true })
    expect(screen.getByRole('tab', { name: 'Places' }).props.accessibilityState).toMatchObject({ selected: false })
  })

  it('pressing the other word calls onChange(1) and plays H.select once', async () => {
    const onChange = jest.fn()
    await draw({ onChange })
    await fireEvent.press(screen.getByTestId('t-1'))
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith(1)
    expect(select).toHaveBeenCalledTimes(1)
  })

  it('pressing the current word calls neither', async () => {
    const onChange = jest.fn()
    await draw({ onChange })
    await fireEvent.press(screen.getByTestId('t-0'))
    expect(onChange).not.toHaveBeenCalled()
    expect(select).not.toHaveBeenCalled()
  })

  it('the chosen word is textPrimary and the other textTertiary, in one size and weight so nothing reflows', async () => {
    await draw()
    const on = StyleSheet.flatten(screen.getByText('Events').props.style)
    const off = StyleSheet.flatten(screen.getByText('Places').props.style)
    expect(on.color).toBe(COLOR.textPrimary)
    expect(off.color).toBe(COLOR.textTertiary)
    expect(on.fontFamily).toBe(off.fontFamily)
    expect(on.fontSize).toBe(off.fontSize)
    expect(screen.getByText('Events').props.maxFontSizeMultiplier).toBe(1.3)
  })

  it('each word is a 48 pt target, with slop either side', async () => {
    await draw()
    expect(flat('t-1')).toMatchObject({ height: SIZE.control })
    expect(screen.getByTestId('t-1').props.hitSlop).toMatchObject({ left: 12, right: 12 })
  })

  it('with a live dot, the label reads “Places, someone’s live” and a PresenceDot renders', async () => {
    await draw({ badges: [null, 'dot'] })
    expect(screen.getByRole('tab', { name: 'Places, someone’s live' })).toBeTruthy()
    expect(screen.getByTestId('t-1-dot', { includeHiddenElements: true })).toBeTruthy()
    expect(screen.queryByTestId('t-0-dot', { includeHiddenElements: true })).toBeNull()
  })

  it('trailing renders at the right end of the row', async () => {
    await draw({ trailing: <Text>Bengaluru</Text> })
    expect(screen.getByText('Bengaluru')).toBeTruthy()
  })

  it('focus draws a ring around the word', async () => {
    await draw()
    await fireEvent(screen.getByTestId('t-1'), 'focus')
    expect(screen.getByTestId('t-1-focus')).toBeTruthy()
    await fireEvent(screen.getByTestId('t-1'), 'blur')
    expect(screen.queryByTestId('t-1-focus')).toBeNull()
  })
})

describe('the underline', () => {
  it('is hidden from a screen reader, childless, and invisible until the chosen word is measured', async () => {
    await draw()
    const line = screen.getByTestId('t-underline', { includeHiddenElements: true })
    expect(line.props.accessibilityElementsHidden).toBe(true)
    expect(line.props.importantForAccessibility).toBe('no-hide-descendants')
    expect(line.props.children).toBeUndefined()
    expect(flat('t-underline').opacity).toBe(0)
    await measured()
    expect(flat('t-underline').opacity).toBe(1)
  })

  it('is the hue’s edge: brandOrange on ember, flat, with no glow', async () => {
    await draw()
    await measured()
    const style = flat('t-underline')
    expect(style.backgroundColor).toBe(COLOR.brandOrange)
    expect(style.boxShadow).toBeUndefined()
    expect(style).toMatchObject({ position: 'absolute' })
  })

  it('follows the hue of the screen it is on', async () => {
    await render(<HueProvider value="rose">{tabs()}</HueProvider>)
    expect(flat('t-underline').backgroundColor).toBe(COLOR.brandRose)
  })

  it('is placed under the first measurement without a spring', async () => {
    await draw()
    await measured()
    expect(spring).not.toHaveBeenCalled()
  })

  it('moving right: the right edge springs on snap, the left follows on settle', async () => {
    await draw()
    await measured()
    await screen.rerender(tabs({ selected: 1 }))
    expect(spring).toHaveBeenCalledWith(110, SPRING.settle)
    expect(spring).toHaveBeenCalledWith(198, SPRING.snap)
    expect(spring).toHaveBeenCalledTimes(2)
  })

  it('moving left: the left edge springs on snap, the right follows on settle', async () => {
    await draw({ selected: 1 })
    await measured()
    await screen.rerender(tabs({ selected: 0 }))
    expect(spring).toHaveBeenCalledWith(0, SPRING.snap)
    expect(spring).toHaveBeenCalledWith(86, SPRING.settle)
  })

  it('Reduce Motion: it jumps, no spring at all', async () => {
    reduceMotion.mockReturnValue(true)
    await draw()
    await measured()
    await screen.rerender(tabs({ selected: 1 }))
    expect(spring).not.toHaveBeenCalled()
  })

  it('a relayout (a larger text size, a longer city) re-places it without a spring', async () => {
    await draw()
    await measured()
    await layout('t-0-place', 0, 120)
    expect(spring).not.toHaveBeenCalled()
  })
})

describe('a narrow phone or a large size (A15: the city pill cut to "Bengal…" on every 360 dp Pulse)', () => {
  const window = Dimensions.get('window')
  const at = (width: number, fontScale: number) => act(async () => Dimensions.set({ window: { ...window, width, fontScale }, screen: { ...window, width, fontScale } }))
  afterEach(() => Dimensions.set({ window, screen: window }))

  it('at 360 dp and 1.3 the tab gap drops to SPACE.lg, the pill keeps ten characters’ room, and the words give way first', async () => {
    await at(360, 1.3)
    await draw({ trailing: <Text>Bengaluru</Text> })
    expect(flat('t-words')).toMatchObject({ gap: SPACE.lg, flexShrink: 1 })
    const trailing = flat('t-trailing')
    expect(trailing.minWidth).toBeGreaterThan(0)
    expect(trailing.alignItems).toBe('flex-end')
    // The words shrink to fit (never below 75%) before the pill truncates.
    expect(screen.getByText('Events').props).toMatchObject({ numberOfLines: 1, adjustsFontSizeToFit: true, minimumFontScale: 0.75 })
  })

  it('a roomy phone at the default size is laid out as before', async () => {
    await at(402, 1)
    await draw({ trailing: <Text>Bengaluru</Text> })
    expect(flat('t-words').gap).toBe(SPACE.xl)
    expect(flat('t-trailing').minWidth).toBe(0)
  })
})

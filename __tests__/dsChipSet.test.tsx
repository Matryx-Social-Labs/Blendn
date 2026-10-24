/*
 * <ChipSet> (the sweep's chips.html): a labelled set of chips with its counter, a cap that dims the rest, a fold behind
 * "+n more" that never hides a pick, and one assertive error under it.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import React from 'react'
import { AccessibilityInfo, Dimensions, Platform, StyleSheet } from 'react-native'
import * as Reanimated from 'react-native-reanimated'

import * as ChipModule from '../components/ds/Chip'
import { ChipSet, foldedItems, type ChipItem } from '../components/ds/ChipSet'
import { CONTROL_FONT_CAP } from '../components/ds/shared'
import { SPACE, SPRING } from '../lib/design/tokens'
import { OPACITY } from '../lib/theme'
import { H } from '../lib/haptics'
import { AX_XXXL, uncapped } from './helpers/ax'

jest.mock('react-native-reanimated', () => ({ ...jest.requireActual('react-native-reanimated'), __esModule: true, useReducedMotion: jest.fn(() => false) }))
const reduceMotion = Reanimated.useReducedMotion as jest.Mock

const ITEMS: ChipItem[] = ['a', 'b', 'c', 'd', 'e', 'f'].map((key) => ({ key, label: key.toUpperCase() }))
const flat = (id: string) => StyleSheet.flatten(screen.getByTestId(id, { includeHiddenElements: true }).props.style)

let select: jest.SpyInstance
beforeEach(() => {
  Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true })
  select = jest.spyOn(H, 'select').mockImplementation(() => {})
  reduceMotion.mockReturnValue(false)
})

const draw = (props: Partial<React.ComponentProps<typeof ChipSet>> = {}) =>
  render(<ChipSet label="Languages" items={ITEMS} selection="multi" selected={[]} onToggle={jest.fn()} testID="s" {...props} />)

describe('foldedItems', () => {
  it('shows the first n, and hides the rest', () => {
    const { shown, hidden } = foldedItems(ITEMS, [], 4)
    expect(shown.map((i) => i.key)).toEqual(['a', 'b', 'c', 'd'])
    expect(hidden.map((i) => i.key)).toEqual(['e', 'f'])
  })

  it('pins a chosen one beyond n, in its place, so a pick is never hidden', () => {
    const { shown, hidden } = foldedItems(ITEMS, ['f'], 4)
    expect(shown.map((i) => i.key)).toEqual(['a', 'b', 'c', 'd', 'f'])
    expect(hidden.map((i) => i.key)).toEqual(['e'])
  })

  it('hides nothing when everything fits', () => {
    expect(foldedItems(ITEMS, [], 9).hidden).toEqual([])
  })
})

describe('<ChipSet>', () => {
  it('draws the label and a counter "3 of 5" for a capped multi set', async () => {
    await draw({ selected: ['a', 'b', 'c'], max: 5 })
    expect(screen.getByText('Languages')).toBeTruthy()
    expect(screen.getByLabelText('3 of 5')).toBeTruthy()
  })

  it('a given counter replaces it ("Any")', async () => {
    await draw({ counter: 'Any', max: 5 })
    expect(screen.getByText('Any')).toBeTruthy()
    expect(screen.queryByLabelText('0 of 5')).toBeNull()
  })

  it('at the cap the unchosen dim and say why; the chosen stay lit and can be undone', async () => {
    const onToggle = jest.fn()
    await draw({ selected: ['a', 'b'], max: 2, capHint: 'Up to two', onToggle })
    expect(flat('s-c').opacity).toBe(OPACITY.disabled)
    expect(screen.getByTestId('s-c').props.accessibilityHint).toBe('Up to two')
    expect(flat('s-a').opacity).not.toBe(OPACITY.disabled)
    await fireEvent.press(screen.getByTestId('s-c'))
    expect(onToggle).not.toHaveBeenCalled()
    await fireEvent.press(screen.getByTestId('s-a'))
    expect(onToggle).toHaveBeenCalledWith('a')
  })

  it('a single set has no cap, no slot, and marks the one chosen', async () => {
    await draw({ selection: 'single', selected: ['b'], label: undefined })
    expect(screen.queryByTestId('s-b-slot')).toBeNull()
    expect(screen.getByTestId('s-b').props.accessibilityState.selected).toBe(true)
    expect(screen.queryByText(/ of /)).toBeNull()
  })

  it('draws the error assertively, under the chips', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibilityWithOptions').mockImplementation(() => {})
    await draw({ error: 'Not saved: try again.' })
    expect(screen.getByText('Not saved: try again.').props.accessibilityLiveRegion).toBe('assertive')
    expect(announce).toHaveBeenCalledWith('Not saved: try again.', { queue: true })
  })

  it('an item’s accessibility label and count reach its chip', async () => {
    await draw({ items: [{ key: 'a', label: 'Nightlife', count: 4, accessibilityLabel: 'Nightlife, 4 events' }] })
    expect(screen.getByRole('button', { name: 'Nightlife, 4 events' })).toBeTruthy()
  })
})

describe('the fold', () => {
  it('folds the rest into "+2 more", read as "2 more home states"', async () => {
    await draw({ foldAfter: 4, foldNoun: 'home states' })
    expect(screen.queryByText('E')).toBeNull()
    expect(screen.getByText('+2 more')).toBeTruthy()
    expect(screen.getByRole('button', { name: '2 more home states' })).toBeTruthy()
  })

  it('opening plays H.select once, reveals the rest with a stagger and offers "Show fewer"', async () => {
    await draw({ foldAfter: 4 })
    await fireEvent.press(screen.getByTestId('s-more'))
    expect(select).toHaveBeenCalledTimes(1)
    expect(screen.getByText('E')).toBeTruthy()
    expect(screen.getByText('F')).toBeTruthy()
    expect(screen.getByText('Show fewer')).toBeTruthy()
    await fireEvent.press(screen.getByTestId('s-more'))
    expect(screen.queryByText('E')).toBeNull()
  })

  it('a chosen chip beyond the fold stays drawn, and only the rest is counted as hidden', async () => {
    await draw({ foldAfter: 4, selected: ['f'], selection: 'single' })
    expect(screen.getByText('F')).toBeTruthy()
    expect(screen.getByText('+1 more')).toBeTruthy()
  })

  it('no fold chip when everything fits', async () => {
    await draw({ foldAfter: 9 })
    expect(screen.queryByTestId('s-more')).toBeNull()
  })

  it('the revealed chips fade on the quick beat, staggered; Reduce Motion fades on base with no stagger or glide', async () => {
    await draw({ foldAfter: 4 })
    await fireEvent.press(screen.getByTestId('s-more'))
    const fade = (key: string) => screen.getByTestId(`s-${key}`, { includeHiddenElements: true }).parent?.parent?.props.entering
    expect(fade('e')).toBeDefined()
    expect(fade('a')).toBeUndefined()
    await act(async () => {})
    reduceMotion.mockReturnValue(true)
    await draw({ foldAfter: 4, testID: 'r' })
    await fireEvent.press(screen.getByTestId('r-more'))
    expect(screen.getByTestId('r-e', { includeHiddenElements: true })).toBeTruthy()
  })
})

describe('touch targets never overlap (audit U-M13)', () => {
  const rowGap = () => (StyleSheet.flatten(screen.getByTestId('s-wrap', { includeHiddenElements: true }).props.style) as { rowGap?: number }).rowGap

  it('the row gap is the slop a chip is given: 12 on iOS (44 − 32), 16 on Android (48 − 32), so a wrapped row’s targets only touch', async () => {
    await draw()
    expect(rowGap()).toBe(44 - 32)
    await screen.unmount()
    Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true })
    await draw()
    expect(rowGap()).toBe(48 - 32)
  })
})

describe('the fold glides (review L10)', () => {
  const layoutOf = (id: string) => {
    let node = screen.getByTestId(id, { includeHiddenElements: true }) as unknown as { props?: Record<string, unknown>; parent: unknown } | null
    while (node && !node.props?.layout) node = node.parent as typeof node
    return node?.props?.layout
  }

  it('every chip, the fold chip included, has a layout transition, so the rest glide as it opens', async () => {
    await draw({ foldAfter: 4 })
    expect(layoutOf('s-a')).toBeDefined()
    expect(layoutOf('s-more')).toBeDefined()
    await fireEvent.press(screen.getByTestId('s-more'))
    expect(layoutOf('s-e')).toBeDefined()
  })

  it('Reduce Motion: nothing glides', async () => {
    reduceMotion.mockReturnValue(true)
    await draw({ foldAfter: 4 })
    expect(layoutOf('s-a')).toBeUndefined()
    expect(layoutOf('s-more')).toBeUndefined()
  })
})

describe('the counter rolls and the fold chevron turns (DS #26)', () => {
  it('“n of max”: n is a RollingNumber, the rest is text, and it reads as one phrase', async () => {
    await draw({ selected: ['a', 'b', 'c'], max: 5 })
    expect(screen.getByTestId('s-counter-n', { includeHiddenElements: true })).toBeTruthy()
    expect(screen.getByLabelText('3 of 5')).toBeTruthy()
  })

  it('only the digit that changes rolls: choosing one more runs one roll, not the label', async () => {
    const spring = jest.spyOn(Reanimated, 'withSpring')
    await draw({ selected: ['a', 'b'], max: 5 })
    spring.mockClear()
    await screen.rerender(<ChipSet label="Languages" items={ITEMS} selection="multi" selected={['a', 'b', 'c']} max={5} onToggle={jest.fn()} testID="s" />)
    // The one digit's column rolls on the snap spring; the chip's check strokes in (a timing), and nothing else springs.
    expect(spring).toHaveBeenCalledTimes(1)
    expect(spring).toHaveBeenCalledWith(1, SPRING.snap)
    spring.mockRestore()
  })

  it('a caller’s own counter (“Any”) stays a word and never rolls', async () => {
    await draw({ counter: 'Any', max: 5 })
    expect(screen.queryByTestId('s-counter-n', { includeHiddenElements: true })).toBeNull()
  })

  it('the fold chip has one chevron, which turns over on SPRING.snap as it opens', async () => {
    const spring = jest.spyOn(Reanimated, 'withSpring')
    await draw({ foldAfter: 2 })
    expect(screen.getAllByTestId('s-more-chevron', { includeHiddenElements: true })).toHaveLength(1)
    spring.mockClear()
    await act(async () => fireEvent.press(screen.getByTestId('s-more')))
    expect(screen.getAllByTestId('s-more-chevron', { includeHiddenElements: true })).toHaveLength(1)
    expect(spring).toHaveBeenCalledWith(180, SPRING.snap)
    spring.mockRestore()
  })

  it('Reduce Motion: the chevron turns at once, no spring', async () => {
    reduceMotion.mockReturnValue(true)
    const spring = jest.spyOn(Reanimated, 'withSpring')
    await draw({ foldAfter: 2 })
    spring.mockClear()
    await act(async () => fireEvent.press(screen.getByTestId('s-more')))
    expect(spring).not.toHaveBeenCalledWith(180, SPRING.snap)
    spring.mockRestore()
  })
})

describe('only the changed chip moves', () => {
  const MANY: ChipItem[] = Array.from({ length: 30 }, (_, i) => ({ key: `k${i}`, label: `Kind ${i}`, icon: 'sparkles' as const }))
  // Callers pass fresh items and a fresh arrow every render, as the screens do.
  const Set = ({ selected }: { selected: string[] }) => (
    <ChipSet items={MANY.map((item) => ({ ...item }))} selection="single" selected={selected} onToggle={() => {}} testID="s" />
  )

  it('a pick re-renders the chip lit and the chip let go, not the other 28; and one verb plays', async () => {
    const chip = jest.spyOn(ChipModule, 'Chip')
    const spring = jest.spyOn(Reanimated, 'withSpring')
    await render(<Set selected={['k3']} />)
    chip.mockClear()
    await screen.rerender(<Set selected={['k7']} />)
    expect(chip).toHaveBeenCalledTimes(2)
    expect(spring).toHaveBeenCalledTimes(1)
    chip.mockRestore()
    spring.mockRestore()
  })

  it('a tap calls the latest onToggle with the chip’s key, once', async () => {
    const first = jest.fn()
    const second = jest.fn()
    await render(<ChipSet items={MANY} selection="single" selected={[]} onToggle={first} testID="s" />)
    await screen.rerender(<ChipSet items={MANY} selection="single" selected={[]} onToggle={second} testID="s" />)
    await fireEvent.press(screen.getByTestId('s-k4'))
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
    expect(second).toHaveBeenCalledWith('k4')
    expect(select).toHaveBeenCalledTimes(1)
  })
})

describe('the label and its counter (D-M6: "LANGUAGES YOU SPEAK0 of 5", the 5 past the card)', () => {
  const window = Dimensions.get('window')
  const at = (width: number, fontScale: number) => act(async () => Dimensions.set({ window: { ...window, width, fontScale }, screen: { ...window, width, fontScale } }))
  afterEach(() => Dimensions.set({ window, screen: window }))
  const header = () => StyleSheet.flatten(screen.getByTestId('s-header', { includeHiddenElements: true }).props.style)

  it('at AX XXXL the counter stacks under the label', async () => {
    await at(402, AX_XXXL)
    await draw({ label: 'Languages you speak', max: 5 })
    expect(header().flexDirection).not.toBe('row')
    // The label keeps the start; only the counter goes to the end (rc7 D6: labels sat flush right at AX).
    expect(header().alignItems).toBeUndefined()
    const counter = screen.getByTestId('s-header', { includeHiddenElements: true }).children[1] as unknown as { props: { style: object } }
    expect(StyleSheet.flatten(counter.props.style)).toMatchObject({ alignSelf: 'flex-end' })
    expect(uncapped(screen.toJSON())).toEqual([])
  })

  it('at 360 dp and 1.3 the two never touch: a gap, the row wraps, the label shrinks', async () => {
    await at(360, 1.3)
    await draw({ label: 'Languages you speak', max: 5 })
    expect(header()).toMatchObject({ flexDirection: 'row', gap: SPACE.sm, flexWrap: 'wrap' })
    expect(StyleSheet.flatten(screen.getByText('Languages you speak').props.style).flexShrink).toBe(1)
  })

  it('a picked-things counter reads "n of max"', async () => {
    await draw({ max: 5, selected: ['a', 'b'] })
    expect(screen.getByTestId('s-counter').props.accessibilityLabel).toMatch(/^\d+ of \d+$/)
  })

  it('a caller’s own counter word stops at the control cap', async () => {
    await at(402, AX_XXXL)
    await draw({ selection: 'single', counter: '2 chosen' })
    expect(screen.getByText('2 chosen').props.maxFontSizeMultiplier).toBe(CONTROL_FONT_CAP)
  })
})

it('a set’s chips may take two lines (You hand-off 3)', async () => {
  await draw({ items: [{ key: 's', label: 'Sales & Business Development' }] })
  expect(screen.getByText('Sales & Business Development').props.numberOfLines).toBe(2)
})

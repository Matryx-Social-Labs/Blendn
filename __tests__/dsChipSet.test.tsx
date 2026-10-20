/*
 * <ChipSet> (the sweep's chips.html): a labelled set of chips with its counter, a cap that dims the rest, a fold behind
 * "+n more" that never hides a pick, and one assertive error under it.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import React from 'react'
import { AccessibilityInfo, Platform, StyleSheet } from 'react-native'
import * as Reanimated from 'react-native-reanimated'

import { ChipSet, foldedItems, type ChipItem } from '../components/ds/ChipSet'
import { OPACITY } from '../lib/theme'
import { H } from '../lib/haptics'

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
    expect(screen.getByText('3 of 5')).toBeTruthy()
  })

  it('a given counter replaces it ("Any")', async () => {
    await draw({ counter: 'Any', max: 5 })
    expect(screen.getByText('Any')).toBeTruthy()
    expect(screen.queryByText('0 of 5')).toBeNull()
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

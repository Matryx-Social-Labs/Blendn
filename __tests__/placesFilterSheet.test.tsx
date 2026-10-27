/*
 * The Places filter sheet (the sweep's filters.html): sized to its content, Kind as a ChipSet with no "All" chip (empty is
 * "Any"), What's on as a single ChipSet with a glyph each, Within as chips, and a primary that carries the server's count.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import React from 'react'

import { PlacesFilterSheet } from '../components/places/PlacesFilterSheet'
import { COUNT_DEBOUNCE_MS } from '../lib/filterCount'
import { HOW_FAR, NO_FILTERS, WHATS_ON, type PlaceFilters } from '../lib/placesPane'

jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default)
jest.mock('expo-glass-effect', () => {
  const { View } = jest.requireActual('react-native')
  return { GlassView: View, isLiquidGlassAvailable: () => false, isGlassEffectAPIAvailable: () => false }
})
jest.mock('expo-linear-gradient', () => {
  const { View } = jest.requireActual('react-native')
  return { LinearGradient: View }
})

const draw = async (props: Partial<React.ComponentProps<typeof PlacesFilterSheet>> = {}) => {
  const onApply = jest.fn()
  const countFor = jest.fn(async (_: PlaceFilters) => 212 as number | null)
  await render(<PlacesFilterSheet visible onClose={jest.fn()} filters={NO_FILTERS} hasFix onApply={onApply} countFor={countFor} {...props} />)
  return { onApply, countFor }
}
const settle = () => act(async () => {
  jest.advanceTimersByTime(COUNT_DEBOUNCE_MS + 400)
  await Promise.resolve()
})

beforeEach(() => jest.useFakeTimers())
afterEach(() => jest.useRealTimers())

describe('the sheet', () => {
  it('is sized to its content: no detents', () => {
    const src = require('fs').readFileSync(require('path').join(__dirname, '../components/places/PlacesFilterSheet.tsx'), 'utf8')
    expect(src).not.toMatch(/detents/)
  })

  it('Kind has no "All" chip, and an empty selection reads "Any"; choosing one reads "1 chosen"', async () => {
    await draw()
    expect(screen.queryByText('All')).toBeNull()
    expect(screen.getByTestId('places-filter-kind-counter').props.children).toBe('Any')
    await act(async () => fireEvent.press(screen.getByTestId('places-filter-kind-cafe')))
    expect(screen.getByTestId('places-filter-kind-counter').props.children).toBe('1 chosen')
    // Tapping the chosen one clears it.
    await act(async () => fireEvent.press(screen.getByTestId('places-filter-kind-cafe')))
    expect(screen.getByTestId('places-filter-kind-cafe').props.accessibilityState).toMatchObject({ selected: false })
  })

  it('What’s on is a single ChipSet of three with a glyph each, Everything first and chosen', async () => {
    await draw()
    expect(WHATS_ON.map((w) => [w.label, w.icon])).toEqual([
      ['Everything', 'sparkles'],
      ['Live now', 'radio'],
      ['Open tonight', 'moon'],
    ])
    expect(screen.getByText('What’s on')).toBeTruthy()
    for (const key of ['all', 'live', 'open']) expect(screen.getByTestId(`places-filter-on-${key}`)).toBeTruthy()
    expect(screen.getByTestId('places-filter-on-all').props.accessibilityState).toMatchObject({ selected: true })
    expect(screen.getByTestId('places-filter-on-live').props.accessibilityState).toMatchObject({ selected: false })
    expect(screen.queryByTestId('places-filter-on-counter')).toBeNull()
  })

  it('choosing one lights it alone, and tapping the chosen one returns it to everything', async () => {
    const { onApply } = await draw()
    await act(async () => fireEvent.press(screen.getByTestId('places-filter-on-live')))
    expect(screen.getByTestId('places-filter-on-live').props.accessibilityState).toMatchObject({ selected: true })
    expect(screen.getByTestId('places-filter-on-all').props.accessibilityState).toMatchObject({ selected: false })
    await act(async () => fireEvent.press(screen.getByTestId('places-filter-on-live')))
    expect(screen.getByTestId('places-filter-on-all').props.accessibilityState).toMatchObject({ selected: true })
    await settle()
    await act(async () => fireEvent.press(screen.getByTestId('places-filter-apply')))
    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ whatsOn: 'all' }))
  })

  it('tapping Everything while it is chosen leaves it chosen', async () => {
    await draw()
    await act(async () => fireEvent.press(screen.getByTestId('places-filter-on-all')))
    expect(screen.getByTestId('places-filter-on-all').props.accessibilityState).toMatchObject({ selected: true })
  })

  it('Within reads Any, 2 km, 5 km, 10 km, and tapping the chosen distance clears it', async () => {
    expect(HOW_FAR.map((h) => h.label)).toEqual(['Any', '2 km', '5 km', '10 km'])
    const { onApply } = await draw()
    await act(async () => fireEvent.press(screen.getByTestId('places-filter-far-5')))
    await act(async () => fireEvent.press(screen.getByTestId('places-filter-far-5')))
    await settle()
    await act(async () => fireEvent.press(screen.getByTestId('places-filter-apply')))
    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ radiusKm: null }))
  })

  it('without a fix there is no Within', async () => {
    await draw({ hasFix: false })
    expect(screen.queryByTestId('places-filter-far-5')).toBeNull()
  })
})

describe('the primary', () => {
  it('is "Show places" until the count is known, then "Show 212 places" with the number rolling in it', async () => {
    await draw()
    expect(screen.getByRole('button', { name: 'Show places' })).toBeTruthy()
    await settle()
    expect(screen.getByTestId('places-filter-apply-count')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Show 212 places' })).toBeTruthy()
  })

  it('a count of one is singular', async () => {
    await draw({ countFor: async () => 1 })
    await settle()
    expect(screen.getByRole('button', { name: 'Show 1 place' })).toBeTruthy()
  })

  it('without a fix the copy offers no distance: there is no Within to widen (GO-09)', async () => {
    await draw({ countFor: async () => 0, hasFix: false })
    await settle()
    expect(screen.getByText('Nothing matches. Try another kind.')).toBeTruthy()
  })

  it('zero disables it and says what to try, politely', async () => {
    const { onApply } = await draw({ countFor: async () => 0 })
    await settle()
    expect(screen.getByText('Nothing matches. Try a wider distance or another kind.').props.accessibilityLiveRegion).toBe('polite')
    const button = screen.getByRole('button', { name: 'Show 0 places' })
    expect(button.props.accessibilityState).toMatchObject({ disabled: true })
    await act(async () => fireEvent.press(button))
    expect(onApply).not.toHaveBeenCalled()
  })

  it('with What’s on set the button carries no number it cannot vouch for', async () => {
    await draw()
    await act(async () => fireEvent.press(screen.getByTestId('places-filter-on-live')))
    await settle()
    expect(screen.getByRole('button', { name: 'Show places' })).toBeTruthy()
    expect(screen.queryByTestId('places-filter-apply-count')).toBeNull()
  })

  it('reads the count once, 250 ms after the last tap', async () => {
    const { countFor } = await draw()
    await act(async () => fireEvent.press(screen.getByTestId('places-filter-kind-cafe')))
    await act(async () => jest.advanceTimersByTime(COUNT_DEBOUNCE_MS - 1))
    expect(countFor).not.toHaveBeenCalled()
    await act(async () => jest.advanceTimersByTime(1))
    expect(countFor).toHaveBeenCalledTimes(1)
    expect(countFor).toHaveBeenCalledWith(expect.objectContaining({ venueType: 'cafe' }))
  })
})

describe('the count survives the next read (review M3)', () => {
  it('keeps the last number while the next loads, in the same Button, and rolls to the new one', async () => {
    let answer = 212
    const countFor = jest.fn(async () => answer as number | null)
    await draw({ countFor })
    await settle()
    const before = screen.getByTestId('places-filter-apply')
    expect(screen.getByRole('button', { name: 'Show 212 places' })).toBeTruthy()
    // A new draft: the old number stays until the new answer lands (no "Show places" flash).
    answer = 40
    await act(async () => fireEvent.press(screen.getByTestId('places-filter-kind-cafe')))
    expect(screen.getByTestId('places-filter-apply-count')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Show places' })).toBeNull()
    await settle()
    await settle()
    expect(screen.getByRole('button', { name: 'Show 40 places' })).toBeTruthy()
    // Not remounted: the rolling number is the same instance, so it rolls.
    expect(screen.getByTestId('places-filter-apply')).toBe(before)
  })

  it('a stale zero does not block the next draft: Apply is live while its read is pending, and stays live if it fails', async () => {
    let fail = false
    const { onApply } = await draw({ countFor: async () => (fail ? Promise.reject(new Error('offline')) : 0) })
    await settle()
    expect(screen.getByRole('button', { name: 'Show 0 places' }).props.accessibilityState).toMatchObject({ disabled: true })
    // The next draft's read fails: the kept 0 is no longer this draft's, so it must not disable Apply.
    fail = true
    await act(async () => fireEvent.press(screen.getByTestId('places-filter-kind-cafe')))
    await settle()
    const button = screen.getByTestId('places-filter-apply')
    expect(button.props.accessibilityState?.disabled).toBeFalsy()
    expect(screen.queryByText('Nothing matches. Try a wider distance or another kind.')).toBeNull()
    await act(async () => fireEvent.press(button))
    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ venueType: 'cafe' }))
  })

  it('1 → many changes the label in place, without remounting the Button', async () => {
    let answer = 1
    await draw({ countFor: async () => answer })
    await settle()
    const before = screen.getByTestId('places-filter-apply')
    answer = 9
    await act(async () => fireEvent.press(screen.getByTestId('places-filter-kind-cafe')))
    await settle()
    await settle()
    expect(screen.getByRole('button', { name: 'Show 9 places' })).toBeTruthy()
    expect(screen.getByTestId('places-filter-apply')).toBe(before)
  })
})

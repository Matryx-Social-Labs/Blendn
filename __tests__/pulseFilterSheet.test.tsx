/*
 * The Pulse's filter sheet: the design system's Sheet (not the old RisingSheet), a ChipSet per group, the draft/apply
 * contract, "tapping the chosen one clears it", and "Show n events" from the server's count of the draft.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import React from 'react'

import { FilterSheet } from '../components/pulse/FilterControl'
import { NO_FILTERS, type EventFilters } from '../lib/eventFilters'
import { COUNT_DEBOUNCE_MS } from '../lib/filterCount'

jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default)
jest.mock('expo-glass-effect', () => {
  const { View } = jest.requireActual('react-native')
  return { GlassView: View, isLiquidGlassAvailable: () => false, isGlassEffectAPIAvailable: () => false }
})
jest.mock('expo-linear-gradient', () => {
  const { View } = jest.requireActual('react-native')
  return { LinearGradient: View }
})

const CATEGORIES = [
  { slug: 'music', name: 'Music' },
  { slug: 'sports', name: 'Sports' },
]

async function draw(props: Partial<React.ComponentProps<typeof FilterSheet>> = {}) {
  const onChange = jest.fn()
  const onApply = jest.fn()
  const countFor = jest.fn(async (_: EventFilters) => 42 as number | null)
  await render(
    <FilterSheet visible draft={NO_FILTERS} categories={CATEGORIES} hasLocation onChange={onChange} onApply={onApply} onClose={jest.fn()} countFor={countFor} {...props} />
  )
  return { onChange, onApply, countFor }
}
const settle = () =>
  act(async () => {
    jest.advanceTimersByTime(COUNT_DEBOUNCE_MS + 400)
    await Promise.resolve()
  })

beforeEach(() => jest.useFakeTimers())
afterEach(() => jest.useRealTimers())

describe('the Pulse filter sheet', () => {
  it('is the DS Sheet, not the old rising sheet', () => {
    const src = require('fs').readFileSync(require('path').join(__dirname, '../components/pulse/FilterControl.tsx'), 'utf8')
    expect(src).toMatch(/<Sheet/)
    expect(src).not.toMatch(/RisingSheet|SheetModal|EMBER/)
  })

  it('draws What, When and Within as chips; Within only with a fix; What only with categories', async () => {
    await draw()
    expect(screen.getByTestId('pulse-filter-what-music')).toBeTruthy()
    expect(screen.getByTestId('pulse-filter-when-weekend')).toBeTruthy()
    expect(screen.getByTestId('pulse-filter-within-5')).toBeTruthy()
    await screen.unmount()
    await draw({ hasLocation: false, categories: [] })
    expect(screen.queryByTestId('pulse-filter-within-5')).toBeNull()
    expect(screen.queryByTestId('pulse-filter-what-music')).toBeNull()
    expect(screen.getByTestId('pulse-filter-when-weekend')).toBeTruthy()
  })

  it('uses the frame’s words: How far · Any distance · Under N km, and Tonight (BAR-13)', async () => {
    await draw()
    expect(screen.getByText('How far')).toBeTruthy()
    expect(screen.getByText('Any distance')).toBeTruthy()
    for (const km of [2, 5, 10]) expect(screen.getByText(`Under ${km} km`)).toBeTruthy()
    expect(screen.queryByText('25 km')).toBeNull()
    expect(screen.queryByText('Within')).toBeNull()
    expect(screen.getByText('Tonight')).toBeTruthy()
    expect(screen.queryByText('Today')).toBeNull()
    expect(screen.getByText('This week')).toBeTruthy()
  })

  it('a choice changes the draft only; the chosen category, tapped again, clears it', async () => {
    const { onChange, onApply } = await draw({ draft: { when: 'any', categorySlug: 'music' } })
    await act(async () => fireEvent.press(screen.getByTestId('pulse-filter-what-music')))
    expect(onChange).toHaveBeenLastCalledWith({ when: 'any', categorySlug: undefined })
    await act(async () => fireEvent.press(screen.getByTestId('pulse-filter-when-weekend')))
    expect(onChange).toHaveBeenLastCalledWith({ when: 'weekend', categorySlug: 'music' })
    expect(onApply).not.toHaveBeenCalled()
  })

  it('"Any" removes the distance (it never widens it), and the chosen distance clears the same way', async () => {
    const { onChange } = await draw({ draft: { when: 'any', radiusKm: 5 } })
    await act(async () => fireEvent.press(screen.getByTestId('pulse-filter-within-5')))
    expect(onChange).toHaveBeenLastCalledWith({ when: 'any', radiusKm: undefined })
    await act(async () => fireEvent.press(screen.getByTestId('pulse-filter-within-any')))
    expect(onChange).toHaveBeenLastCalledWith({ when: 'any', radiusKm: undefined })
  })

  it('Clear all restores the filters, and is off when there are none', async () => {
    const { onChange } = await draw({ draft: { when: 'today' } })
    await act(async () => fireEvent.press(screen.getByTestId('pulse-filter-sheet-header-action')))
    expect(onChange).toHaveBeenCalledWith(NO_FILTERS)
    // One sheet on screen at a time (lib/modalTurn): the first goes before the second is drawn.
    await screen.unmount()
    await draw()
    expect(screen.getByTestId('pulse-filter-sheet-header-action').props.accessibilityState).toMatchObject({ disabled: true })
  })
})

describe('Show n events', () => {
  it('asks the server for the draft 250 ms after the last tap, and says "Show 42 events"', async () => {
    const { countFor } = await draw({ draft: { when: 'weekend' } })
    expect(countFor).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Show results' })).toBeTruthy()
    await settle()
    expect(countFor).toHaveBeenCalledWith({ when: 'weekend' })
    expect(screen.getByRole('button', { name: 'Show 42 events' })).toBeTruthy()
    expect(screen.getByTestId('pulse-filter-apply-count')).toBeTruthy()
  })

  it('applies on the button, once', async () => {
    const { onApply } = await draw()
    await settle()
    await act(async () => fireEvent.press(screen.getByTestId('pulse-filter-apply')))
    expect(onApply).toHaveBeenCalledTimes(1)
  })

  it('zero disables it and says what to try', async () => {
    const { onApply } = await draw({ countFor: async () => 0 })
    await settle()
    expect(screen.getByText('Nothing matches. Try another day or a wider distance.')).toBeTruthy()
    await act(async () => fireEvent.press(screen.getByTestId('pulse-filter-apply')))
    expect(onApply).not.toHaveBeenCalled()
  })

  it('without a fix the copy offers no distance: the sheet has no distance control (GO-09, A19)', async () => {
    await draw({ countFor: async () => 0, hasLocation: false })
    await settle()
    expect(screen.getByText('Nothing matches. Try another day or category.')).toBeTruthy()
    expect(screen.queryByText(/distance/)).toBeNull()
  })

  it('without a counting function the button just says "Show results"', async () => {
    await draw({ countFor: undefined })
    await settle()
    expect(screen.getByRole('button', { name: 'Show results' })).toBeTruthy()
  })
})

describe('the count survives the next read (review M3)', () => {
  it('"Show results" only before the first answer; then the last number stays while the next loads', async () => {
    let answer = 42
    const countFor = jest.fn(async (_: EventFilters) => answer as number | null)
    const { onChange } = await draw({ countFor })
    expect(screen.getByRole('button', { name: 'Show results' })).toBeTruthy()
    await settle()
    expect(screen.getByRole('button', { name: 'Show 42 events' })).toBeTruthy()
    const before = screen.getByTestId('pulse-filter-apply')
    answer = 7
    await screen.rerender(
      <FilterSheet visible draft={{ when: 'today' }} categories={CATEGORIES} hasLocation onChange={onChange} onApply={jest.fn()} onClose={jest.fn()} countFor={countFor} />
    )
    expect(screen.queryByRole('button', { name: 'Show results' })).toBeNull()
    expect(screen.getByTestId('pulse-filter-apply-count')).toBeTruthy()
    await settle()
    await settle()
    expect(screen.getByRole('button', { name: 'Show 7 events' })).toBeTruthy()
    expect(screen.getByTestId('pulse-filter-apply')).toBe(before)
  })
})

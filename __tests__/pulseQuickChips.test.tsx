/**
 * The chip row under Events | Places (Flow 3 · Pulse, Option C): filters in place, Filters opens the sheet, and a filter
 * the chips do not stand for sits at the row's start as a removable chip.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import React from 'react'

/* eslint-disable import/first */
import { QuickChips } from '../components/pulse/QuickChips'
import { NO_FILTERS } from '../lib/eventFilters'
/* eslint-enable import/first */

const CATS = [{ slug: 'music', name: 'Live music' }, { slug: 'food', name: 'Food & drink' }]
const base = { counts: { tonight: 214, weekend: 1038 }, nearOn: false, vibe: CATS[0], categories: CATS, onOpenFilters: jest.fn() }

it('a chip applies its filter, and its count is read with it', async () => {
  const onChange = jest.fn()
  await render(<QuickChips {...base} filters={NO_FILTERS} onChange={onChange} />)
  const tonight = screen.getByLabelText('Tonight, 214 events')
  expect(tonight.props.accessibilityState.selected).toBe(false)
  await act(async () => fireEvent.press(tonight))
  expect(onChange).toHaveBeenCalledWith({ when: 'today' })
})

it('the selected chip says so', async () => {
  await render(<QuickChips {...base} filters={{ when: 'weekend' }} onChange={jest.fn()} />)
  expect(screen.getByLabelText('This weekend, 1,038 events').props.accessibilityState.selected).toBe(true)
  expect(screen.getByLabelText('Tonight, 214 events').props.accessibilityState.selected).toBe(false)
})

it('Filters opens the sheet', async () => {
  const onOpenFilters = jest.fn()
  await render(<QuickChips {...base} onOpenFilters={onOpenFilters} filters={NO_FILTERS} onChange={jest.fn()} />)
  await act(async () => fireEvent.press(screen.getByLabelText('Filters')))
  expect(onOpenFilters).toHaveBeenCalled()
})

it('a filter from the sheet sits first as a removable chip, and removing it keeps the others', async () => {
  const onChange = jest.fn()
  await render(<QuickChips {...base} filters={{ when: 'today', categorySlug: 'food' }} onChange={onChange} />)
  const food = screen.getByLabelText('Food & drink, remove filter')
  await act(async () => fireEvent.press(food))
  expect(onChange).toHaveBeenCalledWith({ when: 'today', categorySlug: undefined })
  // Filters says how many it holds that the row cannot show.
  expect(screen.getByLabelText('Filters, 1 applied')).toBeTruthy()
})

it('Near me: its arrow at rest, the ✓ once on, like every chip on the N1 board', async () => {
  const { StyleSheet } = jest.requireActual('react-native')
  const checkOpacity = () => StyleSheet.flatten(screen.getByTestId('pulse-chip-near-check', { includeHiddenElements: true }).props.style).opacity
  const view = await render(<QuickChips {...base} nearOn filters={NO_FILTERS} onChange={jest.fn()} />)
  expect(checkOpacity()).toBe(0)
  await view.rerender(<QuickChips {...base} nearOn filters={{ when: 'any', radiusKm: 8 }} onChange={jest.fn()} />)
  expect(checkOpacity()).toBe(1)
})

/**
 * The lead card (Flow 3 · Pulse, Option C): Featured as a pager of up to three, one element for a screen reader that
 * adjusts by page, `H.select` on a page change and nothing on a tap, "Promoted" always said.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import React from 'react'

const mockSelect = jest.fn()
jest.mock('../lib/haptics', () => ({ H: new Proxy({}, { get: (_t, k) => (k === 'select' ? mockSelect : jest.fn()) }) }))
jest.mock('expo-image', () => ({ Image: () => null }))

/* eslint-disable import/first */
import { LeadPager, leadLabel, type LeadCard } from '../components/pulse/LeadPager'
/* eslint-enable import/first */

const card = (id: string, extra: Partial<LeadCard> = {}): LeadCard => ({
  id,
  title: `Night ${id}`,
  time: 'Sat · 10:30 PM',
  venue: 'Pebble',
  overline: 'Featured · Club night',
  ...extra,
})

beforeEach(() => mockSelect.mockReset())

it('reads as one element: "Featured, 1 of 3", the card, and Promoted first when paid', async () => {
  expect(leadLabel(card('a', { promoted: true, going: 86, distance: '4.8 km' }), 0, 3)).toBe(
    'Featured, 1 of 3. Promoted. Night a, Sat · 10:30 PM, at Pebble, 4.8 km, 86 going'
  )
  // One card: no "1 of 1".
  expect(leadLabel(card('a'), 0, 1)).toBe('Featured. Night a, Sat · 10:30 PM, at Pebble')
})

it('a screen reader steps through the pages, each step a page change with its haptic', async () => {
  const onPage = jest.fn()
  await render(<LeadPager cards={[card('a'), card('b'), card('c')]} width={345} height={256} onOpen={jest.fn()} onPage={onPage} />)
  const lead = screen.getByTestId('pulse-lead')
  expect(lead.props.accessibilityRole).toBe('adjustable')
  expect(lead.props.accessibilityLabel).toMatch(/^Featured, 1 of 3\. Night a/)
  await act(async () => fireEvent(lead, 'accessibilityAction', { nativeEvent: { actionName: 'increment' } }))
  expect(onPage).toHaveBeenLastCalledWith(1)
  expect(mockSelect).toHaveBeenCalledTimes(1)
  expect(screen.getByTestId('pulse-lead').props.accessibilityLabel).toMatch(/^Featured, 2 of 3\. Night b/)
  // The last page does not wrap, and a step that goes nowhere plays nothing.
  await act(async () => fireEvent(lead, 'accessibilityAction', { nativeEvent: { actionName: 'increment' } }))
  await act(async () => fireEvent(lead, 'accessibilityAction', { nativeEvent: { actionName: 'increment' } }))
  expect(onPage).toHaveBeenLastCalledWith(2)
  expect(mockSelect).toHaveBeenCalledTimes(2)
})

it('activating opens the card on screen, silently', async () => {
  const onOpen = jest.fn()
  await render(<LeadPager cards={[card('a'), card('b')]} width={345} height={256} onOpen={onOpen} />)
  const lead = screen.getByTestId('pulse-lead')
  await act(async () => fireEvent(lead, 'accessibilityAction', { nativeEvent: { actionName: 'increment' } }))
  mockSelect.mockReset()
  await act(async () => fireEvent(lead, 'accessibilityAction', { nativeEvent: { actionName: 'activate' } }))
  expect(onOpen).toHaveBeenCalledWith(1)
  expect(mockSelect).not.toHaveBeenCalled()
})

it('pips only with more than one card, the page’s own drawn long', async () => {
  const { rerender } = await render(<LeadPager cards={[card('a'), card('b'), card('c')]} width={345} height={256} onOpen={jest.fn()} />)
  expect(screen.getAllByTestId(/^pulse-lead-pip-/, { includeHiddenElements: true })).toHaveLength(3)
  await rerender(<LeadPager cards={[card('a')]} width={345} height={256} onOpen={jest.fn()} />)
  expect(screen.queryAllByTestId(/^pulse-lead-pip-/, { includeHiddenElements: true })).toHaveLength(0)
})

it('a paid card always carries its Promoted label on the card', async () => {
  await render(<LeadPager cards={[card('a', { promoted: true })]} width={345} height={256} onOpen={jest.fn()} />)
  expect(screen.getByTestId('pulse-lead-card-0-promoted', { includeHiddenElements: true })).toBeTruthy()
})

/*
 * /onboarding/details (Flow 2 details 01 to 06, R4.1 2.2): the bio and its cap,
 * the prompts, the interests and theirs, the server-fed lists loading and failing, and the expertise under the field.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import React from 'react'
import { StyleSheet } from 'react-native'

const mockCommit = jest.fn(async (_patch?: unknown) => true)
let mockDraft: Record<string, unknown> = {}
const mockCategories = jest.fn()
const mockWorkFields = jest.fn()
jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() } }))
jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default)
jest.mock('expo-linear-gradient', () => {
  const { View } = jest.requireActual('react-native')
  return { LinearGradient: (props: object) => <View {...props} /> }
})
jest.mock('../lib/useOnboarding', () => ({
  useOnboarding: () => ({ draft: mockDraft, loaded: true, saving: false, commit: mockCommit, skip: jest.fn(), goBack: jest.fn() }),
}))
jest.mock('../lib/apiClient', () => ({ apiClient: { getCategories: () => mockCategories(), getWorkFields: () => mockWorkFields() } }))
jest.mock('../lib/logger', () => ({ Logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } }))

import DetailsScreen from '../app/onboarding/details'
import { COLOR, SIZE } from '../lib/design/tokens'
import { tint } from '../lib/theme'

const primary = () => screen.getByTestId('onboarding-primary')
beforeEach(() => {
  jest.clearAllMocks()
  mockDraft = {}
})

describe('details', () => {
  const leaves = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `i${i}`, name: `Interest ${i}` }))
  const tree = (n: number) => ({ success: true, data: [{ id: 'g', name: 'Music', children: leaves(n) }] })

  it('while the interests load there is a spinner and a line; when they fail, a sentence and Try again', async () => {
    mockCategories.mockReturnValue(new Promise(() => {}))
    await render(<DetailsScreen />)
    expect(screen.getByText('Loading interests')).toBeTruthy()
    mockCategories.mockResolvedValue({ success: false, error: 'no' })
    await render(<DetailsScreen />)
    expect(await screen.findByText('Couldn’t load the interests.')).toBeTruthy()
    mockCategories.mockResolvedValue(tree(2))
    await fireEvent.press(screen.getByLabelText('Try again'))
    expect(await screen.findByText('Interest 0')).toBeTruthy()
  })

  it('a bio past 500 is not cut: it says by how much, and Continue waits', async () => {
    mockCategories.mockResolvedValue(tree(2))
    await render(<DetailsScreen />)
    await fireEvent.changeText(screen.getByTestId('onboarding-bio-input'), 'x'.repeat(512))
    expect(screen.getByText('500 characters at most.')).toBeTruthy()
    expect(screen.getByTestId('onboarding-bio-input').props.value).toHaveLength(512)
    expect(primary().props.accessibilityState).toMatchObject({ disabled: true })
    await fireEvent.changeText(screen.getByTestId('onboarding-bio-input'), 'x'.repeat(500))
    expect(screen.queryByText(/characters at most/)).toBeNull()
    expect(primary().props.accessibilityState).toMatchObject({ disabled: false })
  })

  it('a prompt chip puts its words in the bio', async () => {
    mockCategories.mockResolvedValue(tree(2))
    await render(<DetailsScreen />)
    await fireEvent.press(screen.getByLabelText('Ask me about…'))
    expect(screen.getByTestId('onboarding-bio-input').props.value).toBe('Ask me about… ')
  })

  it('the prompts rail fades at its edge rather than clipping a chip mid-word (GO-11, A13)', async () => {
    mockCategories.mockResolvedValue(tree(2))
    await render(<DetailsScreen />)
    const fade = screen.getByTestId('onboarding-prompts-fade', { includeHiddenElements: true })
    // The DS sideways fade (a LinearGradient, every architecture), clear to ink toward the right; no CSS gradient.
    // Negative control: the old View with `experimental_backgroundImage` has no `colors` and fails.
    expect(fade.props.colors).toEqual([tint(COLOR.ink, 0), COLOR.ink])
    expect(fade.props.end).toEqual({ x: 1, y: 0.5 })
    expect(JSON.stringify(screen.toJSON())).not.toContain('linear-gradient')
  })

  it('a prompt with no room left is dimmed and does nothing', async () => {
    mockCategories.mockResolvedValue(tree(2))
    await render(<DetailsScreen />)
    await fireEvent.changeText(screen.getByTestId('onboarding-bio-input'), 'x'.repeat(495))
    expect(StyleSheet.flatten(screen.getByLabelText('Ask me about…').props.style).opacity).toBe(0.45)
    await fireEvent.press(screen.getByLabelText('Ask me about…'))
    expect(screen.getByTestId('onboarding-bio-input').props.value).toBe('x'.repeat(495))
  })

  it('asks one question, the interests first and the bio after them, the chips at the 44 pt size', async () => {
    mockCategories.mockResolvedValue(tree(2))
    await render(<DetailsScreen />)
    await screen.findByText('Interest 0')
    expect(screen.getByRole('header', { name: 'What are you into?' })).toBeTruthy()
    const tree_ = JSON.stringify(screen.toJSON())
    expect(tree_.indexOf('Interest 0')).toBeLessThan(tree_.indexOf('onboarding-bio-input'))
    expect(StyleSheet.flatten(screen.getByLabelText(/^Interest 0\b/).props.style).minHeight).toBe(SIZE.targetIos)
  })

  it('a group past a dozen folds behind "+n more" (large data; control: a dozen shows whole)', async () => {
    mockCategories.mockResolvedValue(tree(20))
    await render(<DetailsScreen />)
    await screen.findByText('Interest 0')
    expect(screen.getByText('+8 more')).toBeTruthy()
    expect(screen.queryByText('Interest 12')).toBeNull()
    mockCategories.mockResolvedValue(tree(12))
    await render(<DetailsScreen />)
    expect(await screen.findByText('Interest 11')).toBeTruthy()
    expect(screen.queryByText(/^\+\d+ more$/)).toBeNull()
  })

  it('stops at ten interests (the server’s cap), dims the rest, and keeps "n picked" over the button', async () => {
    mockCategories.mockResolvedValue(tree(12))
    await render(<DetailsScreen />)
    await screen.findByText('Interest 0')
    expect(screen.getByTestId('onboarding-dock-caption').props.children).toBe('None picked yet')
    await fireEvent.press(screen.getByLabelText(/^Interest 0\b/))
    expect(screen.getByTestId('onboarding-dock-caption').props.children).toBe('1 picked')
    for (let i = 1; i < 10; i++) await fireEvent.press(screen.getByLabelText(new RegExp(`^Interest ${i}\\b`)))
    expect(screen.getByTestId('onboarding-dock-caption').props.children).toBe('10 picked, the most')
    await fireEvent.press(screen.getByLabelText(/^Interest 10\b/))
    expect(screen.getByTestId('onboarding-dock-caption').props.children).toBe('10 picked, the most')
    await fireEvent.press(primary())
    expect(mockCommit).toHaveBeenCalledWith(expect.objectContaining({ interestIds: expect.any(Array) }))
    expect((mockCommit.mock.calls[0][0] as { interestIds: string[] }).interestIds).toHaveLength(10)
  })
})

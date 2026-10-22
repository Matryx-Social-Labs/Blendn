/*
 * /onboarding/details and /onboarding/journey (Flow 2 details 01 to 06, journey 01 to 05, R4.1 2.2): the bio and its cap,
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
jest.mock('../lib/useOnboarding', () => ({
  useOnboarding: () => ({ draft: mockDraft, loaded: true, saving: false, commit: mockCommit, skip: jest.fn(), goBack: jest.fn() }),
}))
jest.mock('../lib/apiClient', () => ({ apiClient: { getCategories: () => mockCategories(), getWorkFields: () => mockWorkFields() } }))
jest.mock('../lib/logger', () => ({ Logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } }))

import DetailsScreen from '../app/onboarding/details'
import JourneyScreen from '../app/onboarding/journey'

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

  it('a prompt with no room left is dimmed and does nothing', async () => {
    mockCategories.mockResolvedValue(tree(2))
    await render(<DetailsScreen />)
    await fireEvent.changeText(screen.getByTestId('onboarding-bio-input'), 'x'.repeat(495))
    expect(StyleSheet.flatten(screen.getByLabelText('Ask me about…').props.style).opacity).toBe(0.45)
    await fireEvent.press(screen.getByLabelText('Ask me about…'))
    expect(screen.getByTestId('onboarding-bio-input').props.value).toBe('x'.repeat(495))
  })

  it('stops at ten interests (the server’s cap), dims the rest, and says n of 10', async () => {
    mockCategories.mockResolvedValue(tree(12))
    await render(<DetailsScreen />)
    await screen.findByText('Interest 0')
    for (let i = 0; i < 10; i++) await fireEvent.press(screen.getByLabelText(new RegExp(`^Interest ${i}\\b`)))
    expect(screen.getByText('10 of 10')).toBeTruthy()
    await fireEvent.press(screen.getByLabelText(/^Interest 10\b/))
    expect(screen.getByText('10 of 10')).toBeTruthy()
    await fireEvent.press(primary())
    expect(mockCommit).toHaveBeenCalledWith(expect.objectContaining({ interestIds: expect.any(Array) }))
    expect((mockCommit.mock.calls[0][0] as { interestIds: string[] }).interestIds).toHaveLength(10)
  })
})

describe('journey', () => {
  const fields = {
    success: true,
    data: {
      workFields: [
        { slug: 'design', label: 'Design' },
        { slug: 'finance', label: 'Finance' },
        { slug: 'other', label: 'Something else' },
      ],
      expertiseByField: {
        design: [
          { slug: 'design_product', label: 'Product Design' },
          { slug: 'design_brand', label: 'Brand & Identity' },
        ],
        finance: [{ slug: 'finance_banking', label: 'Banking' }],
        other: [],
      },
      maxExpertise: 3,
    },
  }

  it.each([
    ['onboarding-city-input', 200, 'location'],
    ['onboarding-job-input', 100, 'occupation'],
    ['onboarding-school-input', 100, 'education'],
  ])('%s past %i is not cut: it stays, says by how much, and Continue waits (SCRUM-745)', async (testID, cap) => {
    mockWorkFields.mockResolvedValue(fields)
    await render(<JourneyScreen />)
    const long = 'x'.repeat(cap + 7)
    await fireEvent.changeText(screen.getByTestId(testID), long)
    expect(screen.getByTestId(testID).props.value).toBe(long)
    expect(screen.getByText(`${cap} characters at most.`)).toBeTruthy()
    expect(primary().props.accessibilityState).toMatchObject({ disabled: true })
    await fireEvent.press(primary())
    expect(mockCommit).not.toHaveBeenCalled()
    await fireEvent.changeText(screen.getByTestId(testID), 'x'.repeat(cap))
    expect(screen.queryByText(/characters at most/)).toBeNull()
    expect(primary().props.accessibilityState).toMatchObject({ disabled: false })
    expect(screen.getByText(`${cap}/${cap}`, { includeHiddenElements: true })).toBeTruthy()
  })

  it('the field list shows a spinner and a line while it loads', async () => {
    mockWorkFields.mockReturnValue(new Promise(() => {}))
    await render(<JourneyScreen />)
    expect(screen.getByText('Loading fields of work')).toBeTruthy()
  })

  it('a failed list says so', async () => {
    mockWorkFields.mockResolvedValue({ success: false, error: 'no' })
    await render(<JourneyScreen />)
    expect(await screen.findByText('Couldn’t load the fields of work.')).toBeTruthy()
  })

  it('choosing a field draws its specialisms as step two; “Something else” has none', async () => {
    mockWorkFields.mockResolvedValue(fields)
    await render(<JourneyScreen />)
    await screen.findByText('Design')
    expect(screen.queryByTestId('onboarding-expertise')).toBeNull()
    await fireEvent.press(screen.getByLabelText('Design'))
    expect(screen.getByText('Product Design')).toBeTruthy()
    await fireEvent.press(screen.getByLabelText('Something else'))
    expect(screen.queryByTestId('onboarding-expertise')).toBeNull()
  })

  it('changing the field clears the specialisms that no longer fit, and the clearing is sent', async () => {
    mockWorkFields.mockResolvedValue(fields)
    await render(<JourneyScreen />)
    await screen.findByText('Design')
    await fireEvent.press(screen.getByLabelText('Design'))
    await fireEvent.press(screen.getByLabelText(/^Product Design/))
    await fireEvent.press(screen.getByLabelText('Finance'))
    await waitFor(() => expect(screen.getByText('Banking')).toBeTruthy())
    await fireEvent.press(primary())
    expect(mockCommit).toHaveBeenCalledWith(expect.objectContaining({ work_field: 'finance', expertise: [] }))
  })

  it('a person who never reached the specialisms is not sent an empty answer', async () => {
    mockWorkFields.mockResolvedValue(fields)
    await render(<JourneyScreen />)
    await screen.findByText('Design')
    await fireEvent.press(primary())
    expect(mockCommit.mock.calls[0]).toBeDefined()
    expect(mockCommit.mock.calls[0][0]).not.toHaveProperty('expertise')
  })
})

/*
 * /onboarding/basics (Flow 2 basics 01 to 07): the date as the design's field, the under-18 sentence with its exit, an
 * impossible date, the sign-out sheet, and Continue only when it could.
 */
import { fireEvent, render, screen } from '@testing-library/react-native'
import React from 'react'

import { H } from '../lib/haptics'

const mockCommit = jest.fn(async () => true)
const mockSignOut = jest.fn(async () => {})
let mockDraft: Record<string, unknown> = {}
jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() } }))
jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default)
jest.mock('../lib/perf', () => ({ ScreenProfiler: ({ children }: { children: React.ReactNode }) => children }))
jest.mock('../lib/useOnboarding', () => ({
  useOnboarding: () => ({ draft: mockDraft, loaded: true, saving: false, commit: mockCommit, skip: jest.fn(), goBack: jest.fn() }),
}))
jest.mock('../lib/useAuth', () => ({ useAuth: () => ({ user: { name: 'Sam Mehta' } }), signOut: () => mockSignOut() }))

import BasicsScreen from '../app/onboarding/basics'

const year = new Date().getFullYear()
beforeEach(() => {
  jest.clearAllMocks()
  mockDraft = {}
})

const dob = async (day: string, month: string, y: string) => {
  await fireEvent.changeText(screen.getByLabelText('Date of birth, day'), day)
  await fireEvent.changeText(screen.getByLabelText('Date of birth, month'), month)
  await fireEvent.changeText(screen.getByLabelText('Date of birth, year'), y)
}
const primary = () => screen.getByTestId('onboarding-primary')

it('opens with the account’s name in, the date’s hint, and Continue off', async () => {
  await render(<BasicsScreen />)
  expect(screen.getByTestId('onboarding-name-input').props.value).toBe('Sam Mehta')
  expect(screen.getByText('Your age will be private and used only for verification.')).toBeTruthy()
  expect(screen.getByText('Step 1 of 8')).toBeTruthy()
  expect(primary().props.accessibilityState).toMatchObject({ disabled: true })
})

it('a full adult date with a gender makes Continue live, and commits what was typed', async () => {
  await render(<BasicsScreen />)
  await fireEvent.press(screen.getByLabelText('Man'))
  await dob('14', '03', '1998')
  expect(primary().props.accessibilityState).toMatchObject({ disabled: false })
  await fireEvent.press(primary())
  expect(mockCommit).toHaveBeenCalledWith({ name: 'Sam Mehta', gender: 'man', dateOfBirth: '1998-03-14' })
})

it('under 18 says so under the date and offers Sign out beside it, and Continue stays off', async () => {
  await render(<BasicsScreen />)
  await dob('01', '01', String(year - 15))
  expect(screen.getByText("Blend'n is for people 18 and over.")).toBeTruthy()
  expect(screen.getByTestId('onboarding-under-age-sign-out')).toBeTruthy()
  expect(primary().props.accessibilityState).toMatchObject({ disabled: true })
  expect(screen.queryByText('Your age will be private and used only for verification.')).toBeNull()
})

it('30 February is “not a date we recognise”, not under 18, with no exit offered', async () => {
  await render(<BasicsScreen />)
  await dob('30', '02', '1998')
  expect(screen.getByText('That is not a date we recognise.')).toBeTruthy()
  expect(screen.queryByTestId('onboarding-under-age-sign-out')).toBeNull()
})

it('nothing is said while the boxes are half full', async () => {
  await render(<BasicsScreen />)
  await fireEvent.changeText(screen.getByLabelText('Date of birth, day'), '14')
  expect(screen.queryByText('That is not a date we recognise.')).toBeNull()
})

it('Not you? Sign out asks first, and only the sheet’s Sign out ends the session', async () => {
  await render(<BasicsScreen />)
  await fireEvent.press(screen.getByTestId('onboarding-secondary'))
  expect(screen.getByText('Sign out?')).toBeTruthy()
  expect(mockSignOut).not.toHaveBeenCalled()
  await fireEvent.press(screen.getByLabelText('Sign out'))
  expect(mockSignOut).toHaveBeenCalledTimes(1)
})

it('the docked primary plays H.primary on press-in, once, as every design-system primary does', async () => {
  const primarySpy = jest.spyOn(H, 'primary').mockImplementation(() => {})
  mockDraft = { name: 'Sam', dateOfBirth: '1990-01-01' }
  await render(<BasicsScreen />)
  await fireEvent(screen.getByTestId('onboarding-primary'), 'pressIn')
  expect(primarySpy).toHaveBeenCalledTimes(1)
})

it('the header is the glass bar with the step, no back on the first step, and the 4 pt progress under it', async () => {
  await render(<BasicsScreen />)
  expect(screen.getByTestId('onboarding-header')).toBeTruthy()
  expect(screen.getByText('Step 1 of 8')).toBeTruthy()
  expect(screen.queryByTestId('onboarding-back')).toBeNull()
  expect(screen.getByTestId('onboarding-progress', { includeHiddenElements: true })).toBeTruthy()
  expect(screen.getByTestId('onboarding-dock')).toBeTruthy()
})

it('a name past 100 is not cut: it stays, says by how much, and Continue waits (SCRUM-745)', async () => {
  await render(<BasicsScreen />)
  await fireEvent.press(screen.getByLabelText('Man'))
  await dob('14', '03', '1998')
  const long = 'N'.repeat(105)
  await fireEvent.changeText(screen.getByTestId('onboarding-name-input'), long)
  expect(screen.getByTestId('onboarding-name-input').props.value).toBe(long)
  expect(screen.getByText('100 characters at most.')).toBeTruthy()
  expect(primary().props.accessibilityState).toMatchObject({ disabled: true })
  await fireEvent.press(primary())
  expect(mockCommit).not.toHaveBeenCalled()
  await fireEvent.changeText(screen.getByTestId('onboarding-name-input'), 'N'.repeat(100))
  expect(screen.queryByText(/characters at most/)).toBeNull()
  expect(primary().props.accessibilityState).toMatchObject({ disabled: false })
  // The counter shows from 80% of the cap.
  expect(screen.getByText('100/100', { includeHiddenElements: true })).toBeTruthy()
})

it('the name shows no counter far from its cap', async () => {
  await render(<BasicsScreen />)
  expect(screen.queryByText(/^\d+\/100$/, { includeHiddenElements: true })).toBeNull()
})

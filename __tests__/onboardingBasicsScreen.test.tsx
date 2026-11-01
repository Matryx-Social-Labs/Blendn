/*
 * /onboarding/basics (Flow 2 basics 01 to 07): the date as the design's field, the under-18 sentence with its exit, an
 * impossible date, the sign-out sheet, and Continue only when it could.
 */
import { fireEvent, render, screen } from '@testing-library/react-native'
import React from 'react'

import { H } from '../lib/haptics'

const mockCommit = jest.fn(async () => true)
const mockUpdate = jest.fn()
const mockSignOut = jest.fn(async () => {})
let mockDraft: Record<string, unknown> = {}
jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() } }))
jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default)
jest.mock('../lib/perf', () => ({ ScreenProfiler: ({ children }: { children: React.ReactNode }) => children }))
jest.mock('../lib/useOnboarding', () => ({
  useOnboarding: () => ({ draft: mockDraft, loaded: true, saving: false, commit: mockCommit, update: mockUpdate, skip: jest.fn(), goBack: jest.fn() }),
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
/** Step 1 is two screens (direction A): the name, then the birthday and gender. */
const toBirthday = async () => {
  await fireEvent.press(primary())
  expect(screen.getByLabelText('Date of birth, day')).toBeTruthy()
}

it('opens on the name alone, the account’s name in and Continue live; no date or gender yet', async () => {
  await render(<BasicsScreen />)
  expect(screen.getByRole('header', { name: 'What should we call you?' })).toBeTruthy()
  expect(screen.getByTestId('onboarding-name-input').props.value).toBe('Sam Mehta')
  expect(screen.queryByLabelText('Date of birth, day')).toBeNull()
  expect(screen.queryByLabelText('Man')).toBeNull()
  expect(screen.getByRole('progressbar').props.accessibilityLabel).toBe('Step 1 of 5')
  expect(primary().props.accessibilityState).toMatchObject({ disabled: false })
})

it('Continue on the name opens the birthday screen inside step 1: the name kept in the draft, nothing committed', async () => {
  await render(<BasicsScreen />)
  await toBirthday()
  expect(screen.getByRole('header', { name: 'When’s your birthday?' })).toBeTruthy()
  expect(screen.getByText('Blend’n is 18+. People see your age, never your birthday.')).toBeTruthy()
  expect(screen.getByRole('progressbar').props.accessibilityLabel).toBe('Step 1 of 5')
  expect(mockUpdate).toHaveBeenCalledWith({ name: 'Sam Mehta' })
  expect(mockCommit).not.toHaveBeenCalled()
  expect(primary().props.accessibilityState).toMatchObject({ disabled: true })
})

it('back on the birthday screen returns to the name, as typed (control: the name screen has no back)', async () => {
  await render(<BasicsScreen />)
  expect(screen.queryByTestId('onboarding-back')).toBeNull()
  await fireEvent.changeText(screen.getByTestId('onboarding-name-input'), 'Sam M')
  await toBirthday()
  await fireEvent.press(screen.getByTestId('onboarding-back'))
  expect(screen.getByTestId('onboarding-name-input').props.value).toBe('Sam M')
  expect(screen.queryByLabelText('Date of birth, day')).toBeNull()
})

it('a full adult date with a gender makes Continue live, and commits what was typed', async () => {
  await render(<BasicsScreen />)
  await toBirthday()
  await fireEvent.press(screen.getByLabelText('Man'))
  await dob('14', '03', '1998')
  expect(primary().props.accessibilityState).toMatchObject({ disabled: false })
  await fireEvent.press(primary())
  expect(mockCommit).toHaveBeenCalledWith({ name: 'Sam Mehta', gender: 'man', dateOfBirth: '1998-03-14' })
})

it('under 18 says so under the date and offers Sign out beside it, and Continue stays off', async () => {
  await render(<BasicsScreen />)
  await toBirthday()
  await dob('01', '01', String(year - 15))
  expect(screen.getByText("Blend’n is for people 18 and over.")).toBeTruthy()
  expect(screen.getByTestId('onboarding-under-age-sign-out')).toBeTruthy()
  expect(primary().props.accessibilityState).toMatchObject({ disabled: true })
  expect(screen.queryByText('Blend’n is 18+. People see your age, never your birthday.')).toBeTruthy()
})

it('30 February is “not a date we recognise”, not under 18, with no exit offered', async () => {
  await render(<BasicsScreen />)
  await toBirthday()
  await dob('30', '02', '1998')
  expect(screen.getByText('That is not a date we recognise.')).toBeTruthy()
  expect(screen.queryByTestId('onboarding-under-age-sign-out')).toBeNull()
})

it('a date more than 100 years back is told to enter the real one, not that Blend’n is 18+ (SCRUM-923)', async () => {
  await render(<BasicsScreen />)
  await toBirthday()
  await dob('15', '06', '1912')
  expect(screen.getByText('Enter your real date of birth.')).toBeTruthy()
  expect(screen.queryByText('That is not a date we recognise.')).toBeNull()
  expect(screen.queryByText('Blend’n is for people 18 and over.')).toBeNull()
  expect(screen.queryByTestId('onboarding-under-age-sign-out')).toBeNull()
  expect(primary().props.accessibilityState).toMatchObject({ disabled: true })
})

it('a one-letter name is told "Use 2 to 100 letters." once the field is left, and Continue waits', async () => {
  mockDraft = { name: '' }
  await render(<BasicsScreen />)
  await fireEvent.changeText(screen.getByTestId('onboarding-name-input'), 'S')
  expect(screen.queryByText('Use 2 to 100 letters.')).toBeNull()
  await fireEvent(screen.getByTestId('onboarding-name-input'), 'blur')
  expect(screen.getByText('Use 2 to 100 letters.')).toBeTruthy()
  expect(primary().props.accessibilityState).toMatchObject({ disabled: true })
  await fireEvent.changeText(screen.getByTestId('onboarding-name-input'), 'Sa')
  expect(screen.queryByText('Use 2 to 100 letters.')).toBeNull()
  expect(primary().props.accessibilityState).toMatchObject({ disabled: false })
})

it('pressing the dead Continue says why: the name’s sentence shows at once, without leaving the field', async () => {
  mockDraft = { name: '' }
  await render(<BasicsScreen />)
  await fireEvent.changeText(screen.getByTestId('onboarding-name-input'), 'S')
  expect(screen.queryByText('Use 2 to 100 letters.')).toBeNull()
  await fireEvent.press(screen.getByTestId('onboarding-primary'))
  expect(screen.getByText('Use 2 to 100 letters.')).toBeTruthy()
  expect(mockCommit).not.toHaveBeenCalled()
  expect(screen.queryByLabelText('Date of birth, day')).toBeNull()
})

it('a one-letter name already there (a resume) shows its sentence on opening', async () => {
  mockDraft = { name: 'S' }
  await render(<BasicsScreen />)
  expect(screen.getByText('Use 2 to 100 letters.')).toBeTruthy()
})

it('nothing is said while the boxes are half full', async () => {
  await render(<BasicsScreen />)
  await toBirthday()
  await fireEvent.changeText(screen.getByLabelText('Date of birth, day'), '14')
  expect(screen.queryByText('That is not a date we recognise.')).toBeNull()
})

it('Not you? Sign out asks first, and only the sheet’s Sign out ends the session', async () => {
  await render(<BasicsScreen />)
  await fireEvent.press(screen.getByTestId('onboarding-header-action'))
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

it('the header is the glass bar, no back on the first screen, and the five segments under it', async () => {
  await render(<BasicsScreen />)
  expect(screen.getByTestId('onboarding-header')).toBeTruthy()
  expect(screen.queryByTestId('onboarding-back')).toBeNull()
  expect(screen.getByTestId('onboarding-progress', { includeHiddenElements: true })).toBeTruthy()
  expect(screen.getByTestId('onboarding-dock')).toBeTruthy()
})

it('a name past 100 is not cut: it stays, says by how much, and Continue waits (SCRUM-745)', async () => {
  await render(<BasicsScreen />)
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

it('signing out keeps what was typed in the draft, as the sheet promises (SCRUM-658)', async () => {
  await render(<BasicsScreen />)
  await fireEvent.changeText(screen.getByTestId('onboarding-name-input'), 'Sam M')
  await toBirthday()
  await fireEvent.press(screen.getByLabelText('Woman'))
  await dob('14', '03', '1998')
  await fireEvent.press(screen.getByTestId('onboarding-header-action'))
  await fireEvent.press(screen.getByLabelText('Sign out'))
  expect(mockUpdate).toHaveBeenLastCalledWith({ name: 'Sam M', gender: 'woman', dateOfBirth: '1998-03-14' })
  expect(mockSignOut).toHaveBeenCalled()
  expect(mockUpdate.mock.invocationCallOrder.at(-1)).toBeLessThan(mockSignOut.mock.invocationCallOrder[0])
})

it('the way out sits in the header’s top-right, out of the primary column (Flow 2, SCRUM-1002)', async () => {
  await render(<BasicsScreen />)
  expect(screen.queryByTestId('onboarding-secondary')).toBeNull()
  expect(screen.getByTestId('onboarding-header-action')).toBeTruthy()
  expect(screen.getByLabelText('Not you? Sign out')).toBeTruthy()
})

/*
 * The email forms' header wears the bar's material once the page has moved under it (r7 M11): the sign-up form's Name was
 * sliced on a bare line under the lockup. At rest it is clear over the orbs.
 */
import { render, screen } from '@testing-library/react-native'
import fs from 'fs'
import path from 'path'
import React from 'react'

import { FormHeader } from '../components/onboarding/FormHeader'

jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default)
jest.mock('expo-router', () => ({ router: { back: jest.fn() } }))

it('at rest: no bar; scrolled: the bar material behind the back circle and the lockup', async () => {
  await render(<FormHeader testID="h" />)
  expect(screen.queryByTestId('h-bar', { includeHiddenElements: true })).toBeNull()
  await render(<FormHeader testID="h" scrolled />)
  expect(screen.getByTestId('h-bar', { includeHiddenElements: true })).toBeTruthy()
})

it.each(['app/sign-in.tsx', 'app/forgot-password.tsx'])('%s tells its header when the page has moved', (file) => {
  const src = fs.readFileSync(path.join(__dirname, '..', file), 'utf8')
  expect(src).toMatch(/<FormHeader testID="[a-z-]+" scrolled=\{scrolled\} \/>/)
  expect(src).toMatch(/contentOffset\.y > 0/)
})

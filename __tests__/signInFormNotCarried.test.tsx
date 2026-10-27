/*
 * Re-review M1: the sign-in form's words are held across a remount (M4), and are one person's. Typed by A, then A signs in
 * another way (Google) and out again: the next person to open the form finds it empty. The real useAuth, a scripted client.
 */
import { fireEvent, render, screen } from '@testing-library/react-native'

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'))
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: jest.fn(() => ({})),
}))
jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default)
jest.mock('../lib/logger', () => ({ Logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } }))
jest.mock('../components/friends/PendingInvite', () => ({ PendingInvite: () => null }))
jest.mock('expo-notifications', () => ({ setBadgeCountAsync: jest.fn(async () => true), getPermissionsAsync: jest.fn() }))
jest.mock('../lib/purchases', () => ({ syncPurchasesUser: jest.fn() }))
const USER = { id: 'u-a', email: 'asha@example.com', name: 'Asha' }
jest.mock('../lib/apiClient', () => ({
  apiClient: {
    signInWithGoogle: jest.fn(async () => ({ success: true, data: { user: USER, isNewUser: false } })),
    signInWithApple: jest.fn(async () => ({ success: true, data: { user: USER, isNewUser: false } })),
    signOut: jest.fn(async () => ({ success: true })),
  },
  TokenStorage: { clearAll: jest.fn(async () => {}), getUser: jest.fn(async () => null) },
}))

/* eslint-disable import/first */
import SignIn from '../app/sign-in'
import { heldForm } from '../lib/heldSignInForm'
import { signInWithApple, signInWithGoogle, signOut } from '../lib/useAuth'
/* eslint-enable import/first */

const type = (testID: string, text: string) => fireEvent.changeText(screen.getByTestId(`${testID}-input`), text)

it.each([
  ['Google', () => signInWithGoogle('id-token')],
  ['Apple', () => signInWithApple('identity-token')],
])('typed, then in with %s and out again: the next sign-in form is empty', async (_how, signIn) => {
  const first = await render(<SignIn />)
  await fireEvent.press(screen.getByRole('tab', { name: 'Create account' }))
  await type('sign-in-name', 'Asha')
  await type('sign-in-email', 'asha@example.com')
  await type('sign-in-age', '27')
  await first.unmount()
  expect(heldForm.email).toBe('asha@example.com')

  await signIn()
  await signOut()

  await render(<SignIn />)
  expect(screen.getByRole('tab', { name: 'Sign in' }).props.accessibilityState).toMatchObject({ selected: true })
  expect(screen.queryByDisplayValue('asha@example.com')).toBeNull()
  expect(heldForm).toEqual({ mode: 'signin', email: '', name: '', age: '' })
})

it('a sign-out alone (no sign-in in between) drops it too', async () => {
  const first = await render(<SignIn />)
  await type('sign-in-email', 'someone@example.com')
  await first.unmount()
  await signOut()
  expect(heldForm.email).toBe('')
})

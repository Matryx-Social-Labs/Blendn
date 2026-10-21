/**
 * The crash screen (Flow 7 `errorBoundary`, on the DS StateScreen): Something went wrong, Try again as the one primary,
 * Contact support as a text action that opens a mailto carrying the error id, and — with no mail app — the address and
 * the id as selectable text, because this sits above the toast layer. Nothing you saved is lost, and the raw message is
 * for development builds.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { Linking, Text } from 'react-native'

jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }))
jest.mock('../components/onboarding/Backdrop', () => ({ Backdrop: () => null, ORB_LEVEL: { form: 0.6 } }))
jest.mock('../lib/logger', () => ({ Logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() } }))
jest.mock('../lib/useAuth', () => ({ getCurrentUser: jest.fn().mockResolvedValue({ id: 'u_me' }) }))
jest.mock('../lib/haptics', () => ({ H: { primary: jest.fn(), error: jest.fn(), destructive: jest.fn() } }))

import { ErrorBoundary } from '../components/ErrorBoundary'
import { H } from '../lib/haptics'
import { SUPPORT_EMAIL } from '../lib/support'

let shouldThrow = true
function Bomb() {
  if (shouldThrow) throw new Error('boom: a stack-trace fragment')
  return <Text>fine</Text>
}

const mount = (onError = jest.fn()) =>
  render(
    <ErrorBoundary onError={onError}>
      <Bomb />
    </ErrorBoundary>
  )

beforeEach(() => {
  shouldThrow = true
  jest.clearAllMocks()
  jest.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => jest.restoreAllMocks())

it('says what happened, that nothing is lost, and shows the error id once', async () => {
  const onError = jest.fn()
  await mount(onError)
  expect(screen.getByText('Something went wrong')).toBeTruthy()
  expect(screen.getByText(/Nothing you saved is lost/)).toBeTruthy()
  const id = onError.mock.calls[0][2] as string
  expect(id).toMatch(/^E-[A-Z0-9]+-[A-Z0-9]{4}$/)
  expect(screen.getByText(`Error ${id}`).props.selectable).toBe(true)
})

it('has Try again (the one primary) and Contact support (a text action)', async () => {
  await mount()
  expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Contact support' })).toBeTruthy()
})

it('Try again plays H.primary on press-in and renders the children again', async () => {
  await mount()
  shouldThrow = false
  const again = screen.getByRole('button', { name: 'Try again' })
  await act(async () => fireEvent(again, 'pressIn'))
  expect(H.primary).toHaveBeenCalledTimes(1)
  fireEvent.press(again)
  expect(await screen.findByText('fine')).toBeTruthy()
})

it('Contact support plays nothing and opens a mailto with the account and the error id', async () => {
  const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true)
  const onError = jest.fn()
  await mount(onError)
  const contact = screen.getByRole('button', { name: 'Contact support' })
  await act(async () => fireEvent(contact, 'pressIn'))
  fireEvent.press(contact)
  await waitFor(() => expect(open).toHaveBeenCalled())
  const url = decodeURIComponent(String(open.mock.calls[0][0]))
  expect(url).toContain(`mailto:${SUPPORT_EMAIL}`)
  expect(url).toContain('Account: u_me')
  expect(url).toContain(`Error: ${onError.mock.calls[0][2]}`)
  expect(H.primary).not.toHaveBeenCalled()
})

it('with no mail app, the address and the id are written on the screen, as text', async () => {
  jest.spyOn(Linking, 'openURL').mockRejectedValue(new Error('no mail'))
  const onError = jest.fn()
  await mount(onError)
  fireEvent.press(screen.getByRole('button', { name: 'Contact support' }))
  const id = onError.mock.calls[0][2]
  const line = await screen.findByText(`Write to ${SUPPORT_EMAIL} and mention ${id}.`)
  expect(line.props.selectable).toBe(true)
})

it('shows the raw message in development builds only', async () => {
  const g = global as { __DEV__: boolean }
  g.__DEV__ = true
  const dev = await mount()
  expect(screen.getByText('boom: a stack-trace fragment')).toBeTruthy()
  dev.unmount()
  g.__DEV__ = false
  try {
    await mount()
    expect(screen.queryByText('boom: a stack-trace fragment')).toBeNull()
  } finally {
    g.__DEV__ = true
  }
})

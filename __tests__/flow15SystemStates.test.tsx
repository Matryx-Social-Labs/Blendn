/**
 * Flow 15 system states: the reason classifier, the account screens, not found, update required, and the outage lines.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import { Linking } from 'react-native'

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'))
jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default)
jest.mock('../components/onboarding/Backdrop', () => ({ Backdrop: () => null, ORB_LEVEL: { form: 0.6 } }))
const mockReplace = jest.fn()
let mockPath = '/e/7f3a/tickets'
jest.mock('expo-router', () => ({ router: { replace: (...a: unknown[]) => mockReplace(...a) }, usePathname: () => mockPath }))
jest.mock('../lib/haptics', () => ({ H: { primary: jest.fn(), error: jest.fn(), destructive: jest.fn() } }))

/* eslint-disable import/first */
import NotFoundScreen from '../app/+not-found'
import { AccountStateScreen } from '../components/system/AccountStateScreen'
import { UpdateRequiredScreen } from '../components/system/UpdateRequiredScreen'
import { accountStateCopy } from '../lib/accountStateCopy'
import { setAccountState, getAccountState } from '../lib/accountState'
import { H } from '../lib/haptics'
import { AUTO_RETRY_MS, backByLabel, outageFrom, outageNote } from '../lib/outage'
import { accountRefusalOf, classifySessionEnd, SESSION_END_NOTICE } from '../lib/sessionEnd'
import { SUPPORT_EMAIL } from '../lib/support'
import { STORE_UPDATE } from '../lib/updateRequired'
/* eslint-enable import/first */

const SUSPENDED = "This account has been suspended. Contact support@blendn.app if you think that's a mistake."
const STAFF = 'This app is for attendees. Organisers, venue owners and sponsors sign in at the dashboard.'

beforeEach(() => {
  jest.clearAllMocks()
  mockPath = '/e/7f3a/tickets'
})

describe('classifySessionEnd', () => {
  it('reads the server’s codes first', () => {
    expect(classifySessionEnd({ errorCode: 'ACCOUNT_SUSPENDED' })).toBe('suspended')
    expect(classifySessionEnd({ errorCode: 'ACCOUNT_STAFF' })).toBe('staff')
    expect(classifySessionEnd({ errorCode: 'ACCOUNT_DELETED' })).toBe('deleted')
    expect(classifySessionEnd({ errorCode: 'SESSION_REVOKED_ELSEWHERE' })).toBe('elsewhere')
    expect(classifySessionEnd({ errorCode: 'PASSWORD_RESET' })).toBe('reset')
  })

  it('falls back to the two sentences the server writes today, and to a deleted social account', () => {
    expect(classifySessionEnd({ errorCode: 'FORBIDDEN', error: SUSPENDED })).toBe('suspended')
    expect(classifySessionEnd({ errorCode: 'FORBIDDEN', error: STAFF })).toBe('staff')
    expect(classifySessionEnd({ errorCode: 'UNAUTHORIZED', error: 'Account not found' })).toBe('deleted')
  })

  it('a code beats the sentence, and anything it cannot tell is expired, never a guess', () => {
    expect(classifySessionEnd({ errorCode: 'ACCOUNT_STAFF', error: SUSPENDED })).toBe('staff')
    expect(classifySessionEnd({ errorCode: 'FORBIDDEN', error: 'Nope' })).toBe('expired')
    expect(classifySessionEnd({ errorCode: 'UNAUTHORIZED', error: 'Invalid email or password' })).toBe('expired')
    expect(classifySessionEnd({})).toBe('expired')
  })

  it('only an account state is a refusal; a wrong password is a failed attempt', () => {
    expect(accountRefusalOf({ errorCode: 'FORBIDDEN', error: SUSPENDED })).toBe('suspended')
    expect(accountRefusalOf({ errorCode: 'ACCOUNT_DELETED' })).toBe('deleted')
    expect(accountRefusalOf({ errorCode: 'UNAUTHORIZED', error: 'Invalid email or password' })).toBeNull()
    expect(accountRefusalOf({ errorCode: 'PASSWORD_RESET' })).toBeNull()
  })

  it('has a notice for each session end that is not a screen', () => {
    expect(Object.keys(SESSION_END_NOTICE).sort()).toEqual(['elsewhere', 'expired', 'reset'])
  })
})

describe('accountStateCopy', () => {
  it('suspended: the first sentence is the title, the rest the body, word for word', () => {
    const copy = accountStateCopy('suspended', SUSPENDED)
    expect(copy.title).toBe('This account has been suspended.')
    expect(copy.body).toBe("Contact support@blendn.app if you think that's a mistake.")
    expect(copy.link).toBe(SUPPORT_EMAIL)
    expect(copy.note).toBe('Replies within two days. Say which account and what happened.')
  })

  it('suspended with no sentence still names where to write', () => {
    expect(accountStateCopy('suspended').body).toBe(`Contact ${SUPPORT_EMAIL} if you think that’s a mistake.`)
  })

  it('staff: the server’s sentence verbatim, and where the dashboard is', () => {
    expect(accountStateCopy('staff', STAFF)).toMatchObject({ title: 'Sign in at the dashboard', body: STAFF, note: 'dashboard.blendn.app' })
  })

  it('deleted: ours, neutral, never "try again" and never says deleted as a fact', () => {
    const copy = accountStateCopy('deleted', 'Account not found')
    expect(copy.title).toBe('We couldn’t sign you in with that account')
    expect(copy.body).not.toMatch(/try again/i)
    expect(copy.body).toMatch(/^If you deleted/)
  })
})

describe('AccountStateScreen', () => {
  it('suspended: Email support is the strong action and plays H.primary on press-in; the support address in the sentence is the same action', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true)
    await render(<AccountStateScreen state={{ kind: 'suspended', sentence: SUSPENDED }} />)
    const email = screen.getByRole('button', { name: 'Email support' })
    await act(async () => fireEvent(email, 'pressIn'))
    expect(H.primary).toHaveBeenCalledTimes(1)
    await act(async () => fireEvent.press(email))
    expect(decodeURIComponent(String(open.mock.calls[0][0]))).toContain(`mailto:${SUPPORT_EMAIL}`)
    await act(async () => fireEvent.press(screen.getByRole('link', { name: SUPPORT_EMAIL })))
    expect(open).toHaveBeenCalledTimes(2)
    open.mockRestore()
  })

  it('no sign-in button anywhere, and Back to start plays nothing and clears the state', async () => {
    setAccountState({ kind: 'suspended', sentence: SUSPENDED })
    await render(<AccountStateScreen state={getAccountState()!} />)
    expect(screen.queryByLabelText(/Continue with/)).toBeNull()
    const back = screen.getByRole('button', { name: 'Back to start' })
    await act(async () => fireEvent(back, 'pressIn'))
    await act(async () => fireEvent.press(back))
    expect(getAccountState()).toBeNull()
    expect(H.primary).not.toHaveBeenCalled()
  })

  it('staff: Open the dashboard leaves the app', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true)
    await render(<AccountStateScreen state={{ kind: 'staff', sentence: STAFF }} />)
    await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Open the dashboard' })))
    expect(open).toHaveBeenCalledWith('https://dashboard.blendn.app')
    open.mockRestore()
  })

  it('deleted: Contact support and Use a different account', async () => {
    await render(<AccountStateScreen state={{ kind: 'deleted' }} />)
    expect(screen.getByRole('button', { name: 'Contact support' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Use a different account' })).toBeTruthy()
  })
})

describe('Not found (15.12)', () => {
  it('says there is nothing here, shows what was asked for, and offers the one way on', async () => {
    await render(<NotFoundScreen />)
    expect(screen.getByText('Nothing here')).toBeTruthy()
    expect(screen.getByText('That link doesn’t go anywhere in Blend’n. It may be old, or missing a part.')).toBeTruthy()
    expect(screen.getByText('blendn.app/e/7f3a/tickets')).toBeTruthy()
    const go = screen.getByRole('button', { name: 'Go to the Pulse' })
    await act(async () => fireEvent(go, 'pressIn'))
    expect(H.primary).not.toHaveBeenCalled()
    await act(async () => fireEvent.press(go))
    expect(mockReplace).toHaveBeenCalledWith('/(tabs)/events')
  })

  it('with no path asked for, shows no address line', async () => {
    mockPath = '/'
    await render(<NotFoundScreen />)
    expect(screen.queryByText(/^blendn\.app/)).toBeNull()
  })
})

describe('Update required (15.14)', () => {
  it('names the store, and the one button opens it', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true)
    await render(<UpdateRequiredScreen />)
    expect(screen.getByText('Update Blend’n to keep going')).toBeTruthy()
    expect(screen.getByText('This version can’t talk to Blend’n any more. The update takes about a minute and keeps you signed in.')).toBeTruthy()
    await act(async () => fireEvent.press(screen.getByRole('button', { name: STORE_UPDATE.ios.label })))
    expect(open).toHaveBeenCalledWith(STORE_UPDATE.ios.url)
    open.mockRestore()
  })
})

describe('the outage lines (15.13)', () => {
  it('says nothing is wrong with the account until the server says it is being worked on', () => {
    expect(outageFrom(undefined)).toEqual({ kind: 'down' })
    expect(outageFrom({ errorCode: 'SERVER_ERROR' })).toEqual({ kind: 'down' })
  })

  it('maintenance carries the time the server named, from Retry-After', () => {
    expect(outageFrom({ errorCode: 'MAINTENANCE', retryAfter: 600 }, 1_000)).toEqual({ kind: 'maintenance', until: 601_000 })
    expect(outageFrom({ errorCode: 'MAINTENANCE' })).toEqual({ kind: 'maintenance', until: null })
    expect(backByLabel(null)).toBeNull()
    expect(backByLabel(new Date(2026, 9, 21, 2, 30).getTime())).toMatch(/2:30/)
  })

  it('counts its tries', () => {
    expect(AUTO_RETRY_MS).toBe(30_000)
    expect(outageNote(0)).toBe('Retries on its own every 30 s')
    expect(outageNote(2)).toBe('Tried 2× · retries on its own every 30 s')
  })
})

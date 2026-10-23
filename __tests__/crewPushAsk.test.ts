/** Flow 9's ask after Join: only a phone that has not been asked, and only on a yes. */
const mockPerm = jest.fn()
jest.mock('expo-notifications', () => ({ getPermissionsAsync: () => mockPerm() }))
jest.mock('../lib/notifications', () => ({ initializePushNotifications: jest.fn(async () => 'token') }))
jest.mock('../lib/pushDecline', () => ({ clearPushDeclined: jest.fn(async () => {}) }))
jest.mock('../lib/sheet', () => ({ showSheet: jest.fn() }))

import { askCrewPush, CREW_PUSH_TITLE } from '../lib/crewPushAsk'
import { initializePushNotifications } from '../lib/notifications'
import { clearPushDeclined } from '../lib/pushDecline'
import { showSheet, type ActionSheet } from '../lib/sheet'
import { forgetPushPermission } from '../lib/pushStatus'

beforeEach(() => {
  jest.clearAllMocks()
  // The permission is read once a session (RC drive D1): each test is a new one.
  forgetPushPermission()
})

describe('asking about pushes after joining a crew', () => {
  it('asks a phone that has not been asked, in the design’s words', async () => {
    mockPerm.mockResolvedValue({ status: 'undetermined', canAskAgain: true })
    await askCrewPush('me')
    const sheet = (showSheet as jest.Mock).mock.calls[0][0] as ActionSheet
    expect(sheet.title).toBe(CREW_PUSH_TITLE)
    expect(sheet.title).toBe('Want to know when your crew’s here?')
  })

  it.each([
    ['already allowed', { status: 'granted', canAskAgain: true }],
    ['refused for good', { status: 'denied', canAskAgain: false }],
  ])('does not ask a phone that is %s', async (_n, perm) => {
    mockPerm.mockResolvedValue(perm)
    await askCrewPush('me')
    expect(showSheet).not.toHaveBeenCalled()
  })

  it('does not ask when the phone will not say', async () => {
    mockPerm.mockRejectedValue(new Error('no'))
    await askCrewPush('me')
    expect(showSheet).not.toHaveBeenCalled()
  })

  it('turning it on clears a "maybe later" and registers, which asks the OS; Not now asks nothing', async () => {
    mockPerm.mockResolvedValue({ status: 'undetermined', canAskAgain: true })
    await askCrewPush('me')
    const sheet = (showSheet as jest.Mock).mock.calls[0][0] as ActionSheet
    expect(initializePushNotifications).not.toHaveBeenCalled()
    ;(sheet.actions.find((a) => a.label === 'Turn on notifications') as { then: () => void }).then()
    await new Promise((r) => setImmediate(r))
    expect(clearPushDeclined).toHaveBeenCalledWith('me')
    expect(initializePushNotifications).toHaveBeenCalledTimes(1)
    expect(sheet.actions.find((a) => a.label === 'Not now')).toMatchObject({ cancel: true })
  })
})

/*
 * Whether the phone can still be asked for push (lib/crewPushAsk.ts), the gate on every in-context ask: the first "I'm going"
 * and the crew join. Android 13+ reads a never-asked app as `denied` with `canAskAgain` (expo-notifications: notifications
 * are not enabled until POST_NOTIFICATIONS is granted), so a gate that took only `undetermined` never asked any Android 13+
 * phone; with the start-up prompt deferred (SCRUM-1002 PR 1) a new Android account was never asked at all (Android drive).
 */
import { Platform } from 'react-native'

let mockPermission: unknown
jest.mock('../lib/pushStatus', () => ({ readPushPermission: async () => mockPermission }))
jest.mock('../lib/notifications', () => ({ initializePushNotifications: jest.fn() }))
jest.mock('../lib/sheet', () => ({ showSheet: jest.fn() }))

import { mayAskForPush } from '../lib/crewPushAsk'

const as = (os: 'ios' | 'android') => Object.defineProperty(Platform, 'OS', { get: () => os, configurable: true })
afterEach(() => as('ios'))

it('asks a phone that has not been asked (iOS: undetermined)', async () => {
  as('ios')
  mockPermission = { status: 'undetermined', canAskAgain: true, granted: false }
  expect(await mayAskForPush()).toBe(true)
})

it('asks a never-asked Android 13+ phone, which reads denied while the OS can still ask', async () => {
  as('android')
  mockPermission = { status: 'denied', canAskAgain: true, granted: false }
  expect(await mayAskForPush()).toBe(true)
})

it('control: an iOS no is final, and an Android phone that will not show the dialog again is not asked', async () => {
  as('ios')
  mockPermission = { status: 'denied', canAskAgain: false, granted: false }
  expect(await mayAskForPush()).toBe(false)
  mockPermission = { status: 'denied', canAskAgain: true, granted: false }
  expect(await mayAskForPush()).toBe(false)
  as('android')
  mockPermission = { status: 'denied', canAskAgain: false, granted: false }
  expect(await mayAskForPush()).toBe(false)
})

it('a phone that said yes, or one whose permission cannot be read, is not asked', async () => {
  as('android')
  mockPermission = { status: 'granted', canAskAgain: true, granted: true }
  expect(await mayAskForPush()).toBe(false)
  mockPermission = 'unavailable'
  expect(await mayAskForPush()).toBe(false)
})

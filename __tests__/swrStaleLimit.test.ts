/*
 * A cached answer is shown while a fresh one is fetched, but not at any age (rc7 B). The response cache lives in memory for
 * the app's life and served an expired entry however old it was, refreshing behind it, and Room info never read again:
 * on an iOS app left running through the drive, a room of 426 listed only its organiser, from a roster read hours before.
 * Real `apiClient`, fetch faked.
 */
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'))
const mockSecure = new Map<string, string>()
jest.mock('expo-secure-store', () => ({
  getItemAsync: async (k: string) => mockSecure.get(k) ?? null,
  setItemAsync: async (k: string, v: string) => {
    mockSecure.set(k, v)
  },
  deleteItemAsync: async (k: string) => {
    mockSecure.delete(k)
  },
}))
jest.mock('../lib/logger', () => ({ Logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() } }))
jest.mock('../lib/sentry', () => ({ Sentry: { captureMessage: jest.fn(), captureException: jest.fn() } }))

process.env.EXPO_PUBLIC_API_BASE_URL = 'https://api.test'
/* eslint-disable @typescript-eslint/no-require-imports */
const { apiClient, TokenStorage, SWR_STALE_LIMIT_MS } = require('../lib/apiClient') as typeof import('../lib/apiClient')
/* eslint-enable @typescript-eslint/no-require-imports */

let roster: string[] = []
let now = Date.parse('2026-10-24T10:00:00.000Z')

beforeEach(async () => {
  jest.spyOn(Date, 'now').mockImplementation(() => now)
  await TokenStorage.setAccessToken('tok')
  global.fetch = jest.fn(async () =>
    new Response(JSON.stringify({ success: true, data: { participants: roster.map((name) => ({ userId: name, name, role: 'member' })), totalCount: roster.length } }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  ) as typeof fetch
})
afterEach(() => jest.restoreAllMocks())

const names = async (room: string) => ((await apiClient.getChatParticipants(room)).data?.participants ?? []).map((p) => p.name)

it('within the limit: the last answer at once, refreshed behind it (stale-while-revalidate, as before)', async () => {
  const room = '00000000-0000-4000-8000-000000000001'
  roster = ['Organizer']
  expect(await names(room)).toEqual(['Organizer'])
  roster = ['Organizer', 'Stellar Wave']
  now += 60_000
  expect(await names(room)).toEqual(['Organizer'])
})

it('past the limit: the read waits for the server, so an hours-old roster is never shown as the room', async () => {
  const room = '00000000-0000-4000-8000-000000000002'
  roster = ['Organizer']
  expect(await names(room)).toEqual(['Organizer'])
  roster = ['Organizer', 'Stellar Wave', 'Silent Parrot']
  now += SWR_STALE_LIMIT_MS + 1
  expect(await names(room)).toEqual(['Organizer', 'Stellar Wave', 'Silent Parrot'])
})

it('an event read past its 30 s waits for the server: an RSVP made elsewhere is on the page the first time it opens (SCRUM-1074)', async () => {
  // The event page draws its own 2-minute copy at once, so a stale answer here bought nothing and hid the status: an RSVP
  // made on another phone showed "Free · I'm going" until the page was opened a second time (the refresh landed only in
  // the cache).
  let status: string | null = null
  global.fetch = jest.fn(async () =>
    new Response(JSON.stringify({ success: true, data: { id: 'e1', title: 'Vinyl Night', userStatus: { rsvpStatus: status } } }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  ) as typeof fetch
  const rsvp = async () => (await apiClient.getEvent('e1')).data?.userStatus?.rsvpStatus ?? null
  expect(await rsvp()).toBeNull()
  status = 'going'
  now += 10_000
  expect(await rsvp()).toBeNull() // within 30 s: the same answer, no request
  now += 25_000
  expect(await rsvp()).toBe('going')
})

/**
 * SCRUM-876: "I'm going" -> back -> reopen showed "I'm going" again. An RSVP or Save write invalidated neither cache the
 * event page reads: the screen's own (2 min, paints the reopened page) and the API client's 30 s SWR. Check-in did both.
 * One place, every caller: the apiClient write methods.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
}))
jest.mock('expo-secure-store', () => ({ getItemAsync: async () => null, setItemAsync: async () => {}, deleteItemAsync: async () => {} }))
jest.mock('react-native', () => ({ Platform: { OS: 'ios' }, AppState: { addEventListener: () => ({ remove: () => {} }) } }))
jest.mock('../lib/appVersion', () => ({ appVersionNumber: () => '1.0.0' }))
jest.mock('../lib/logger', () => ({ Logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } }))

process.env.EXPO_PUBLIC_API_BASE_URL = 'https://api.test'
/* eslint-disable @typescript-eslint/no-require-imports */
const { apiClient, TokenStorage } = require('../lib/apiClient') as typeof import('../lib/apiClient')
const { getEventDetailCache, setEventDetailCache } = require('../lib/eventDetailCache') as typeof import('../lib/eventDetailCache')
/* eslint-enable @typescript-eslint/no-require-imports */

const ID = 'e1'
type Detail = { id: string; userStatus: { rsvpStatus: string | null; isFavorited: boolean } }
const detail = (rsvpStatus: string | null, isFavorited = false) => ({ id: ID, userStatus: { rsvpStatus, isFavorited } })
const json = (data: unknown) => new Response(JSON.stringify({ success: true, data }), { status: 200, headers: { 'content-type': 'application/json' } })

/** A server whose event detail follows the writes, as the real one does. */
let server: { rsvp: string | null; fav: boolean }
let reads: number
beforeEach(async () => {
  await TokenStorage.setAccessToken('tok')
  server = { rsvp: null, fav: false }
  reads = 0
  global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const method = init?.method ?? 'GET'
    if (url.endsWith('/rsvp') && method === 'POST') {
      server.rsvp = JSON.parse(String(init?.body)).status
      return json({ rsvpStatus: server.rsvp, rsvpCount: 1 })
    }
    if (url.endsWith('/rsvp') && method === 'DELETE') {
      server.rsvp = null
      return json({ rsvpStatus: null, rsvpCount: 0 })
    }
    if (url.endsWith('/interest')) {
      server.fav = !server.fav
      return json({ interested: server.fav, interestCount: 1 })
    }
    reads++
    return json(detail(server.rsvp, server.fav))
  }) as typeof fetch
  setEventDetailCache(ID, detail(null))
})

const cached = () => getEventDetailCache<Detail>(ID)

describe('an RSVP or Save write keeps the event page true on reopen', () => {
  it('"I\'m going": the screen cache says going at once, and getEvent is not served from before the write', async () => {
    await apiClient.getEvent(ID) // the 30 s entry the page read before tapping
    expect(reads).toBe(1)
    await apiClient.rsvpToEvent(ID, 'going')
    expect(cached()?.userStatus.rsvpStatus).toBe('going')
    const reopened = await apiClient.getEvent(ID)
    expect(reads).toBe(2)
    expect((reopened.data as unknown as Detail).userStatus.rsvpStatus).toBe('going')
  })

  it('a full event answers waitlisted: that is what the cache holds, not what was asked', async () => {
    server.rsvp = null
    ;(global.fetch as jest.Mock).mockImplementationOnce(async () => json({ rsvpStatus: 'waitlisted', rsvpCount: 9 }))
    await apiClient.rsvpToEvent(ID, 'going')
    expect(cached()?.userStatus.rsvpStatus).toBe('waitlisted')
  })

  it('withdraw: reopen says not going', async () => {
    await apiClient.rsvpToEvent(ID, 'going')
    await apiClient.getEvent(ID)
    await apiClient.cancelRsvp(ID)
    expect(cached()?.userStatus.rsvpStatus).toBeNull()
    const reopened = await apiClient.getEvent(ID)
    expect((reopened.data as unknown as Detail).userStatus.rsvpStatus).toBeNull()
  })

  it('Save: reopen says saved, and unsaving says not', async () => {
    await apiClient.getEvent(ID)
    await apiClient.toggleInterest(ID)
    expect(cached()?.userStatus.isFavorited).toBe(true)
    expect(((await apiClient.getEvent(ID)).data as unknown as Detail).userStatus.isFavorited).toBe(true)
    await apiClient.toggleInterest(ID)
    expect(cached()?.userStatus.isFavorited).toBe(false)
  })

  it('a write the server refused changes nothing', async () => {
    await apiClient.getEvent(ID)
    ;(global.fetch as jest.Mock).mockImplementationOnce(async () => new Response(JSON.stringify({ success: false, error: 'No', errorCode: 'FORBIDDEN' }), { status: 403, headers: { 'content-type': 'application/json' } }))
    await apiClient.rsvpToEvent(ID, 'going')
    expect(cached()?.userStatus.rsvpStatus).toBeNull()
    await apiClient.getEvent(ID)
    expect(reads).toBe(1) // still served from the 30 s entry: nothing was forgotten
  })

  it('an event nobody has opened has nothing to patch, and nothing breaks', async () => {
    const { forgetEventDetailCache } = require('../lib/eventDetailCache') as typeof import('../lib/eventDetailCache')
    forgetEventDetailCache(ID)
    await expect(apiClient.rsvpToEvent(ID, 'going')).resolves.toMatchObject({ success: true })
    expect(cached()).toBeNull()
  })
})

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }))
jest.mock('../lib/apiClient', () => ({ apiClient: { queuedRequest: jest.fn() }, TokenStorage: {} }))
jest.mock('../lib/logger', () => ({ Logger: { debug: jest.fn(), warn: jest.fn(), error: jest.fn(), info: jest.fn() } }))

import { apiClient } from '../lib/apiClient'
import { notificationTarget } from '../lib/notifications'
import { codeLife, nextRefreshMs, offersApi, offerStateLine, spacedCode } from '../lib/offers'

/**
 * Step 12 on the app: an offer's push opens the offer (the push names no
 * place), the pass refreshes before its code turns, and "Maybe later" never
 * reaches the server — only an explicit yes does (RG-I02).
 */
describe('an offer from a place', () => {
  it('opens the offer from its push, and somewhere sensible without an id', () => {
    expect(notificationTarget({ type: 'venue_offer', offerId: 'o1' })).toEqual({ pathname: '/offer/[id]', params: { id: 'o1' } })
    expect(notificationTarget({ type: 'venue_offer' })).toBe('/(tabs)/events')
  })

  it('asks again a second before the code turns, never later than 10 s, never sooner than 1 s', () => {
    const now = Date.parse('2026-10-11T20:00:10Z')
    expect(nextRefreshMs('2026-10-11T20:00:30Z', now)).toBe(10_000)
    expect(nextRefreshMs('2026-10-11T20:00:15Z', now)).toBe(4_000)
    expect(nextRefreshMs('2026-10-11T20:00:10.500Z', now)).toBe(1_000)
    expect(nextRefreshMs(null, now)).toBe(10_000)
  })

  it('drains the bar over the code’s 30 seconds', () => {
    const now = Date.parse('2026-10-11T20:00:15Z')
    expect(codeLife('2026-10-11T20:00:30Z', now)).toBe(0.5)
    expect(codeLife('2026-10-11T20:00:10Z', now)).toBe(0)
    expect(codeLife(null, now)).toBe(0)
  })

  it('reads the code as two groups of three', () => {
    expect(spacedCode('K7Q4M2')).toBe('K7Q 4M2')
  })

  it('says what became of an offer that can no longer be shown', () => {
    expect(offerStateLine('live', 'Toit')).toBeNull()
    expect(offerStateLine('redeemed', 'Toit')).toBe('Redeemed. Enjoy it.')
    expect(offerStateLine('used_tonight', 'Toit')).toMatch(/Toit tonight — one a night/)
    expect(offerStateLine('ended', 'Toit')).toBe('This offer has ended.')
  })

  it('sends only the choice that changed: a yes is `known: true`, and nothing else rides along', async () => {
    const request = apiClient.queuedRequest as jest.Mock
    request.mockResolvedValue({ success: true, data: { known: true, offersMuted: false } })
    await offersApi.setPrefs('v1', { known: true })
    expect(request).toHaveBeenLastCalledWith('/api/mobile/venues/v1/regular', { method: 'PUT', body: '{"known":true}' }, true, 2)
  })
})

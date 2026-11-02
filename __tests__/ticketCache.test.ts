/**
 * The tickets on the phone (contract §6): the last `/me/tickets` answer is kept per account so the pass opens with no signal,
 * an order just paid joins it before the list is read again, and sign-out wipes it so the next person on the phone never
 * holds the last one's QR codes.
 */
import AsyncStorage from '@react-native-async-storage/async-storage'
import { act, renderHook } from '@testing-library/react-native'
import { readFileSync } from 'fs'
import { join } from 'path'

jest.mock('../lib/apiClient', () => ({ apiClient: { getMyTickets: jest.fn() } }))

/* eslint-disable import/first */
import { apiClient } from '../lib/apiClient'
import { forgetTickets, readTicketCache, rememberTicketEvent, saveTickets, ticketSession, useMyTickets } from '../lib/ticketCache'
import type { Ticket } from '../lib/ticketing'
/* eslint-enable import/first */

const ticket = (id: string, orderId: string, eventId = 'e1'): Ticket => ({
  ticketId: id,
  orderId,
  eventId,
  typeName: 'Early bird',
  doorCode: 'K7Q2XM',
  qrPayload: `${id}.mac`,
  redeemedAt: null,
})

beforeEach(async () => {
  await AsyncStorage.clear()
})

it('is per account: another account on the phone reads nothing', async () => {
  await saveTickets('me', [ticket('k1', 'o1')])
  expect((await readTicketCache('me')).tickets.map((t) => t.ticketId)).toEqual(['k1'])
  expect((await readTicketCache('someone-else')).tickets).toEqual([])
})

it('a full read replaces the list; a paid order replaces only its own tickets', async () => {
  await saveTickets('me', [ticket('k1', 'o1'), ticket('k2', 'o2')])
  await saveTickets('me', [ticket('k3', 'o2')], { orderId: 'o2' })
  expect((await readTicketCache('me')).tickets.map((t) => t.ticketId)).toEqual(['k1', 'k3'])
  await saveTickets('me', [ticket('k9', 'o9')])
  expect((await readTicketCache('me')).tickets.map((t) => t.ticketId)).toEqual(['k9'])
})

it('keeps what the pass needs to say about the event, beside the tickets, for the same account only', async () => {
  await saveTickets('me', [ticket('k1', 'o1')])
  await rememberTicketEvent('me', 'e1', { title: 'Rooftop Sundowner', startTime: '2026-11-08T12:30:00Z', timezone: 'Asia/Kolkata', venueName: 'High Ultra Lounge' })
  const held = await readTicketCache('me')
  expect(held.events.e1.title).toBe('Rooftop Sundowner')
  expect(held.tickets).toHaveLength(1)
  await rememberTicketEvent('other', 'e2', { title: 'Theirs', startTime: '2026-11-08T12:30:00Z' })
  expect((await readTicketCache('me')).events.e2).toBeUndefined()
})

it('a corrupt entry reads as empty rather than throwing', async () => {
  await AsyncStorage.setItem('blendn.tickets.v1', '{not json')
  expect(await readTicketCache('me')).toEqual({ tickets: [], events: {} })
})

it('forgetTickets wipes it', async () => {
  await saveTickets('me', [ticket('k1', 'o1')])
  await forgetTickets()
  expect((await readTicketCache('me')).tickets).toEqual([])
})

it('sign-out wipes it, on the path every sign-out and every expired session takes', () => {
  const src = readFileSync(join(__dirname, '..', 'lib', 'useAuth.ts'), 'utf8')
  const reset = src.slice(src.indexOf('const resetLocalSession'), src.indexOf('const clearAuthState'))
  expect(reset).toMatch(/import\('\.\/ticketCache'\)\.then\(\(m\) => m\.forgetTickets\(\)\)/)
})

describe('a sign-out while the list is being read (security review)', () => {
  const api = apiClient as jest.Mocked<typeof apiClient>
  const deferred = () => {
    let resolve: (v: unknown) => void = () => {}
    const promise = new Promise((r) => {
      resolve = r
    })
    return { promise, resolve }
  }

  it('an answer that lands after sign-out is neither stored nor shown', async () => {
    const answer = deferred()
    api.getMyTickets.mockReturnValue(answer.promise as never)
    const { result } = await renderHook(() => useMyTickets('me'))
    await act(async () => {})
    expect(api.getMyTickets).toHaveBeenCalled()
    await act(async () => {
      await forgetTickets()
    })
    await act(async () => {
      answer.resolve({ success: true, data: [ticket('k1', 'o1')] })
    })
    expect(result.current.tickets).toEqual([])
    expect(await AsyncStorage.getItem('blendn.tickets.v1')).toBeNull()
    expect((await readTicketCache('me')).tickets).toEqual([])
  })

  it('a paid order saved after sign-out (its poll began before) is dropped', async () => {
    const since = ticketSession()
    await forgetTickets()
    await saveTickets('me', [ticket('k1', 'o1')], { orderId: 'o1', since })
    expect(await AsyncStorage.getItem('blendn.tickets.v1')).toBeNull()
  })

  it('another account on the hook shows nothing of the last one’s, even before its own read lands', async () => {
    api.getMyTickets.mockResolvedValueOnce({ success: true, data: [ticket('k1', 'o1')] } as never)
    const { result, rerender } = await renderHook(({ id }: { id: string }) => useMyTickets(id), { initialProps: { id: 'me' } })
    await act(async () => {})
    expect(result.current.tickets).toHaveLength(1)
    api.getMyTickets.mockReturnValue(new Promise(() => {}) as never)
    await rerender({ id: 'someone-else' })
    expect(result.current.tickets).toEqual([])
  })
})

const mockQueued = jest.fn()
jest.mock('../lib/apiClient', () => ({ apiClient: { queuedRequest: (...a: unknown[]) => mockQueued(...a) } }))

import { BLOCKED_PAGE_SIZE, blockedPageFrom, fetchBlockedPage } from '../lib/blockedUsersPage'

const user = (id: string) => ({ blocked_id: id, blocked_user_name: id, blocked_user_photo: null, reason: null, blocked_at: '2026-09-12T10:00:00Z' })

describe('blockedPageFrom', () => {
  it('an old server: everyone in users, no cursor, so one page that is the whole list', () => {
    expect(blockedPageFrom({ users: [user('a')] })).toEqual({ users: [user('a')], nextCursor: null })
  })
  it('a cursor, flat or under pagination', () => {
    expect(blockedPageFrom({ users: [], nextCursor: 'c2' })).toMatchObject({ nextCursor: 'c2' })
    expect(blockedPageFrom({ users: [], pagination: { nextCursor: 'c3' } })).toMatchObject({ nextCursor: 'c3' })
  })
  it('the last page says null, or nothing', () => {
    expect(blockedPageFrom({ users: [], nextCursor: null })?.nextCursor).toBeNull()
  })
  it('anything else is not a page', () => {
    for (const bad of [null, undefined, 'x', {}, { users: 'no' }]) expect(blockedPageFrom(bad)).toBeNull()
  })
})

describe('fetchBlockedPage', () => {
  beforeEach(() => mockQueued.mockReset())
  it('asks for a page of 50, and for the next one by its cursor', async () => {
    mockQueued.mockResolvedValue({ success: true, data: { users: [user('a')], nextCursor: 'c 2' } })
    await fetchBlockedPage()
    await fetchBlockedPage('c 2')
    expect(mockQueued.mock.calls.map((c) => c[0])).toEqual([`/api/mobile/users/blocked?limit=${BLOCKED_PAGE_SIZE}`, `/api/mobile/users/blocked?limit=${BLOCKED_PAGE_SIZE}&cursor=c%202`])
  })
  it('a failed read is a failure, not an empty list', async () => {
    mockQueued.mockResolvedValue({ success: false, error: 'offline' })
    expect(await fetchBlockedPage()).toEqual({ ok: false, error: 'offline' })
  })
  it('an answer with no list is a failure too', async () => {
    mockQueued.mockResolvedValue({ success: true, data: {} })
    expect((await fetchBlockedPage()).ok).toBe(false)
  })
})

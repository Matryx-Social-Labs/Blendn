/**
 * The six endpoints from blendn-admin PR #494, driven through the real client
 * against a scripted server: the method and path each one calls, the body it
 * sends, whether it signs the request, and what a refusal carries back.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
}))
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
// See session-end-reason.test.ts: apiClient's AppState timer outlives the test.
jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  AppState: { addEventListener: () => ({ remove: () => {} }) },
}))
jest.mock('../lib/logger', () => ({
  Logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}))

process.env.EXPO_PUBLIC_API_BASE_URL = 'https://api.test'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { apiClient, TokenStorage } = require('../lib/apiClient') as typeof import('../lib/apiClient')

type Seen = { method: string; path: string; body: unknown; auth: string | undefined }

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

/** One scripted answer per call; records what was asked. */
function server(answer: (seen: Seen) => Response) {
  const seen: Seen[] = []
  global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = (init?.headers ?? {}) as Record<string, string>
    const s: Seen = {
      method: init?.method ?? 'GET',
      path: String(input).replace(/^https?:\/\/[^/]+/, ''),
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
      auth: headers.Authorization,
    }
    seen.push(s)
    return answer(s)
  }) as typeof fetch
  return seen
}

beforeEach(async () => {
  mockSecure.clear()
  await TokenStorage.setAccessToken('tok')
  await TokenStorage.setRefreshToken('ref')
})

describe('leave and rejoin', () => {
  it('leaves with a POST and rejoins with a DELETE on the same path', async () => {
    const seen = server((s) => json(200, { success: true, data: { chatGroupId: 'g1', left: s.method === 'POST' } }))
    const left = await apiClient.leaveChatGroup('g1')
    const back = await apiClient.rejoinChatGroup('g1')
    expect(seen.map((s) => `${s.method} ${s.path}`)).toEqual([
      'POST /api/mobile/chat/groups/g1/leave',
      'DELETE /api/mobile/chat/groups/g1/leave',
    ])
    expect(left.data).toEqual({ chatGroupId: 'g1', left: true })
    expect(back.data).toEqual({ chatGroupId: 'g1', left: false })
  })

  it('carries a rejoin refusal as its code and sentence', async () => {
    server(() => json(403, { success: false, error: 'This chat has closed.', errorCode: 'CHAT_CLOSED' }))
    const result = await apiClient.rejoinChatGroup('g1')
    expect(result).toMatchObject({ success: false, errorCode: 'CHAT_CLOSED', error: 'This chat has closed.' })
  })

  it("carries the room id on the event chat's LEFT_ROOM, so the app can offer the rejoin", async () => {
    server(() =>
      json(403, { success: false, error: 'You left this room.', errorCode: 'LEFT_ROOM', chatGroupId: 'g9' })
    )
    const result = await apiClient.getEventChat('e1')
    expect(result).toMatchObject({ success: false, errorCode: 'LEFT_ROOM', chatGroupId: 'g9' })
  })

  it('drops the cached room list after leaving, so the Banter asks again', async () => {
    let rooms = [{ id: 'g1' }]
    server((s) =>
      s.path === '/api/mobile/chat/groups'
        ? json(200, { success: true, data: rooms })
        : json(200, { success: true, data: { chatGroupId: 'g1', left: true } })
    )
    await apiClient.getChatGroups()
    rooms = []
    await apiClient.leaveChatGroup('g1')
    const after = await apiClient.getChatGroups()
    expect(after.data).toEqual([])
  })
})

describe('mute', () => {
  it('sends the end time, or null for "until I turn it back on"', async () => {
    const seen = server(() => json(200, { success: true, data: { chatGroupId: 'g1', mute: { muted: true, until: null } } }))
    await apiClient.muteChatGroup('g1', '2026-09-29T02:30:00.000Z')
    await apiClient.muteChatGroup('g1', null)
    expect(seen.map((s) => [s.method, s.path, s.body])).toEqual([
      ['POST', '/api/mobile/chat/groups/g1/mute', { until: '2026-09-29T02:30:00.000Z' }],
      ['POST', '/api/mobile/chat/groups/g1/mute', { until: null }],
    ])
  })

  it('unmutes with a DELETE and hands back the new state', async () => {
    const seen = server(() => json(200, { success: true, data: { chatGroupId: 'g1', mute: { muted: false, until: null } } }))
    const result = await apiClient.unmuteChatGroup('g1')
    expect(seen[0]).toMatchObject({ method: 'DELETE', path: '/api/mobile/chat/groups/g1/mute' })
    expect(result.data?.mute).toEqual({ muted: false, until: null })
  })
})

describe('report a room', () => {
  it('posts the reason, and the note only when there is one', async () => {
    const seen = server(() => json(201, { success: true, data: { reported: true } }))
    await apiClient.reportChatGroup('g1', 'pile_on')
    await apiClient.reportChatGroup('g1', 'other', 'They would not stop')
    expect(seen.map((s) => [s.method, s.path, s.body])).toEqual([
      ['POST', '/api/mobile/chat/groups/g1/report', { reason: 'pile_on' }],
      ['POST', '/api/mobile/chat/groups/g1/report', { reason: 'other', description: 'They would not stop' }],
    ])
  })
})

describe('your own event rating', () => {
  it('reads it, nulls and all', async () => {
    const seen = server(() => json(200, { success: true, data: { rating: null, review: null, ratedAt: null } }))
    const result = await apiClient.getMyEventRating('e1')
    expect(seen[0]).toMatchObject({ method: 'GET', path: '/api/mobile/events/e1/rating' })
    expect(result.data).toEqual({ rating: null, review: null, ratedAt: null })
  })
})

describe('the signed-out invite preview', () => {
  it('asks without a token: the person opening it is not signed in', async () => {
    const seen = server(() => json(200, { success: true, data: { name: 'Priya', photoUrl: null } }))
    const result = await apiClient.getFriendInvitePreview('abc123')
    expect(seen[0]).toMatchObject({ method: 'GET', path: '/api/mobile/friends/invite/abc123/preview' })
    expect(seen[0].auth).toBeUndefined()
    expect(result.data).toEqual({ name: 'Priya', photoUrl: null })
  })

  it('carries a dead link as NOT_FOUND', async () => {
    server(() => json(404, { success: false, error: "This invite link doesn't work any more", errorCode: 'NOT_FOUND' }))
    const result = await apiClient.getFriendInvitePreview('dead')
    expect(result).toMatchObject({ success: false, errorCode: 'NOT_FOUND' })
  })
})

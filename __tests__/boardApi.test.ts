/**
 * The board's six endpoints, driven through the real client against a scripted
 * server: the method and path each calls, the body it sends, that it signs the
 * request, and that a refusal comes back with its code and its sentence.
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

const ok = (data: unknown) => () => json(200, { success: true, data })

beforeEach(async () => {
  mockSecure.clear()
  await TokenStorage.setAccessToken('tok')
  await TokenStorage.setRefreshToken('ref')
})

it('reads the board and your requests with signed GETs', async () => {
  const seen = server(ok({ posts: [], incoming: [], outgoing: [] }))
  await apiClient.getBoard('e1')
  await apiClient.getBoardRequests()
  expect(seen.map((s) => `${s.method} ${s.path}`)).toEqual([
    'GET /api/mobile/events/e1/board',
    'GET /api/mobile/board/requests',
  ])
  expect(seen.every((s) => s.auth === 'Bearer tok')).toBe(true)
})

it('posts an offer with its spaces, and a seeking without', async () => {
  const seen = server(ok({ id: 'p1' }))
  await apiClient.postToBoard('e1', { kind: 'offer', body: 'Two seats', spacesLeft: 2 })
  await apiClient.postToBoard('e1', { kind: 'seeking', body: 'Anyone?' })
  expect(seen.map((s) => [`${s.method} ${s.path}`, s.body])).toEqual([
    ['POST /api/mobile/events/e1/board', { kind: 'offer', body: 'Two seats', spacesLeft: 2 }],
    ['POST /api/mobile/events/e1/board', { kind: 'seeking', body: 'Anyone?' }],
  ])
})

it('asks with no message, takes a post down, and answers by PATCH', async () => {
  const seen = server(ok({}))
  await apiClient.askOnBoard('e1', 'p1')
  await apiClient.withdrawBoardPost('e1', 'p1')
  for (const action of ['accept', 'decline', 'withdraw'] as const) await apiClient.answerBoardRequest('r1', action)
  expect(seen.map((s) => [`${s.method} ${s.path}`, s.body])).toEqual([
    ['POST /api/mobile/events/e1/board/p1/requests', {}],
    ['DELETE /api/mobile/events/e1/board/p1', undefined],
    ['PATCH /api/mobile/board/requests/r1', { action: 'accept' }],
    ['PATCH /api/mobile/board/requests/r1', { action: 'decline' }],
    ['PATCH /api/mobile/board/requests/r1', { action: 'withdraw' }],
  ])
})

it('escapes what it puts in a path', async () => {
  const seen = server(ok({}))
  await apiClient.askOnBoard('e/1', 'p?1')
  expect(seen[0].path).toBe('/api/mobile/events/e%2F1/board/p%3F1/requests')
})

it('brings a refusal back with its code and its sentence', async () => {
  server(() => json(403, { success: false, errorCode: 'FORBIDDEN', error: 'Mark yourself as going to post here' }))
  const r = await apiClient.postToBoard('e1', { kind: 'seeking', body: 'Anyone?' })
  expect(r).toMatchObject({ success: false, errorCode: 'FORBIDDEN', error: 'Mark yourself as going to post here' })
})

it('returns the conversation an accept opened', async () => {
  server(ok({ id: 'r1', status: 'accepted', conversationId: 'c1' }))
  const r = await apiClient.answerBoardRequest('r1', 'accept')
  expect(r.data?.conversationId).toBe('c1')
})

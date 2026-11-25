/**
 * Every way to block somebody moves `blockEpoch` when the server says yes, and only then. The paged lists (the room's
 * feed, Room info, the Board, the Banter) start over from the server on that move, so a block from any route purges
 * what they already loaded (`lib/blockEpoch.ts`). Driven through the real client against a scripted server.
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

const { blockEpoch } = require('../lib/blockEpoch') as typeof import('../lib/blockEpoch')
const { queryCache } = require('../lib/queryCache') as typeof import('../lib/queryCache')
const { clearDirtyDomains, isDomainDirty } = require('../lib/liveSyncState') as typeof import('../lib/liveSyncState')

const PEOPLE = 'personal_chats_u1'
const cachePeople = () => {
  queryCache.set(PEOPLE, [{ conversation_id: 'c1' }], 60_000)
  clearDirtyDomains(['chat'])
}

const paths: [string, () => Promise<{ success: boolean }>][] = [
  ['blockUser', () => apiClient.blockUser('u1')],
  ['blockBoardPost', () => apiClient.blockBoardPost('e1', 'p1')],
  ['blockBoardRequest', () => apiClient.blockBoardRequest('r1')],
  ['leaveConversation with block', () => apiClient.leaveConversation('c1', { action: 'block' })],
  ['respondToMessageRequest with block', () => apiClient.respondToMessageRequest('q1', 'block')],
]

describe.each(paths)('%s', (_name, run) => {
  it('moves the block epoch once when the server says yes', async () => {
    server(ok({ blocked: true }))
    const before = blockEpoch()
    expect((await run()).success).toBe(true)
    expect(blockEpoch()).toBe(before + 1)
  })

  it('does not move it when the server refuses', async () => {
    server(() => json(403, { success: false, error: 'No', errorCode: 'FORBIDDEN' }))
    const before = blockEpoch()
    expect((await run()).success).toBe(false)
    expect(blockEpoch()).toBe(before)
  })
})

describe('what is not a block', () => {
  it.each([
    ['an unmatch', () => apiClient.leaveConversation('c1', { action: 'unmatch' })],
    ['accepting a request', () => apiClient.respondToMessageRequest('q1', 'accept')],
    ['declining a request', () => apiClient.respondToMessageRequest('q1', 'decline')],
    ['unblocking', () => apiClient.unblockUser('u1')],
  ])('%s moves nothing', async (_n, run) => {
    server(ok({}))
    const before = blockEpoch()
    await run()
    expect(blockEpoch()).toBe(before)
  })
})

/*
 * A block or a leave closes the conversation on the server. The Banter's People list is a 60 s copy, and a read that
 * races the forced one the block starts can leave it on screen until a pull-to-refresh (SCRUM-919): the copy goes, and
 * the next read is the server's.
 */
describe('the conversation a block or a leave closes leaves the cached People (SCRUM-919)', () => {
  it.each([
    ...paths,
    ['leaveConversation (unmatch)', () => apiClient.leaveConversation('c1', { action: 'unmatch' })] as [string, () => Promise<{ success: boolean }>],
  ])('%s drops it when the server says yes', async (_n, run) => {
    server(ok({ blocked: true }))
    cachePeople()
    await run()
    expect(queryCache.get(PEOPLE)).toBeNull()
    // Not the open conversation's own sync: it has just been closed.
    expect(isDomainDirty('chat')).toBe(false)
  })

  it.each(paths)('%s leaves it when the server refuses', async (_n, run) => {
    server(() => json(403, { success: false, error: 'No', errorCode: 'FORBIDDEN' }))
    cachePeople()
    await run()
    expect(queryCache.get(PEOPLE)).not.toBeNull()
    expect(isDomainDirty('chat')).toBe(false)
  })

  it.each([
    ['accepting a request', () => apiClient.respondToMessageRequest('q1', 'accept')],
    ['unblocking', () => apiClient.unblockUser('u1')],
  ])('%s leaves it', async (_n, run) => {
    server(ok({}))
    cachePeople()
    await run()
    expect(queryCache.get(PEOPLE)).not.toBeNull()
  })
})

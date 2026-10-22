/**
 * Every paged list this client reads asks for its first page by size (admin #724). With no `limit` and no `cursor` the
 * server answers in its legacy mode for installed builds (up to 200 in one page); new code never relies on it.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
}))
jest.mock('expo-secure-store', () => ({ getItemAsync: async () => null, setItemAsync: async () => {}, deleteItemAsync: async () => {} }))
jest.mock('react-native', () => ({ Platform: { OS: 'ios' }, AppState: { addEventListener: () => ({ remove: () => {} }) } }))
jest.mock('../lib/logger', () => ({ Logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } }))

process.env.EXPO_PUBLIC_API_BASE_URL = 'https://api.test'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { apiClient, LIST_PAGE } = require('../lib/apiClient') as typeof import('../lib/apiClient')

const paths = (spy: jest.SpyInstance) => spy.mock.calls.map((c) => c[0] as string)

describe('the first page of each paged list carries its limit', () => {
  let queued: jest.SpyInstance
  let cached: jest.SpyInstance
  beforeEach(() => {
    queued = jest.spyOn(apiClient, 'queuedRequest').mockResolvedValue({ success: true, data: {} } as never)
    cached = jest.spyOn(apiClient, 'cachedRequest').mockResolvedValue({ success: true, data: {} } as never)
  })
  afterEach(() => jest.restoreAllMocks())

  it('the sizes are the ones the client expects, inside the server’s 1–100', () => {
    expect(LIST_PAGE).toEqual({ conversations: 50, friends: 100, friendRequests: 50, blocked: 100 })
  })

  it('GET /friends asks for 100', async () => {
    await apiClient.getFriends()
    expect(paths(queued)).toEqual(['/api/mobile/friends?limit=100'])
  })

  it('GET /friends/requests asks for 50 (each side)', async () => {
    await apiClient.getFriendRequests()
    expect(paths(queued)).toEqual(['/api/mobile/friends/requests?limit=50'])
  })

  it('GET /users/blocked asks for 100', async () => {
    await apiClient.getBlockedUsers()
    expect(paths(queued)[0]).toBe('/api/mobile/users/blocked?limit=100')
  })

  it('GET /conversations asks for 50, cached or forced', async () => {
    await apiClient.getConversations()
    await apiClient.getConversations({ force: true })
    expect(paths(cached)).toEqual(['/api/mobile/conversations?limit=50'])
    expect(paths(queued)).toEqual(['/api/mobile/conversations?limit=50'])
  })
})

describe('a block takes the person out of the pages Friends kept (M5)', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { takeFriendsGone } = require('../lib/friendsGone') as typeof import('../lib/friendsGone')
  afterEach(() => jest.restoreAllMocks())

  it('blockUser notes them once the server says yes, from whichever screen it was called', async () => {
    takeFriendsGone()
    jest.spyOn(apiClient, 'queuedRequest').mockResolvedValue({ success: true, data: { blocked: true } } as never)
    await apiClient.blockUser('u_ana')
    expect([...takeFriendsGone()]).toEqual(['u_ana'])
  })

  it('a block the server refused notes nobody', async () => {
    takeFriendsGone()
    jest.spyOn(apiClient, 'queuedRequest').mockResolvedValue({ success: false, error: 'no' } as never)
    await apiClient.blockUser('u_ana')
    expect(takeFriendsGone().size).toBe(0)
  })
})

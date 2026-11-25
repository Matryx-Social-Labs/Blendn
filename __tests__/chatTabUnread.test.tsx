import { act, renderHook } from '@testing-library/react-native'

/** The Chat tab's badge (Flow 5 R-A): the server's count to start, then arrivals while People shows, cleared by Chat. */
const mockListeners: ((d: { chatGroupId: string; message: { userId: string } }) => void)[] = []
let mockServerUnread = 3
jest.mock('../lib/socketClient', () => ({
  subscribeToChatMessage: (_g: string, cb: never) => {
    mockListeners.push(cb)
    return () => mockListeners.splice(mockListeners.indexOf(cb), 1)
  },
}))
jest.mock('../lib/roomUnread', () => ({
  watchRoomUnread: ({ onChange }: { onChange: (n: number) => void }) => ({ refresh: async () => onChange(mockServerUnread), stop: () => {} }),
}))
jest.mock('../lib/roomMembership', () => ({ useRoomMembership: () => ({ left: new Set<string>() }) }))

// eslint-disable-next-line import/first
import { useChatTabUnread } from '../lib/useChatTabUnread'

const say = (userId: string, chatGroupId = 'g1') => act(() => mockListeners.forEach((f) => f({ chatGroupId, message: { userId } })))

it('starts at the server’s count and counts others’ messages while People shows, never your own or another room’s', async () => {
  const { result } = await renderHook(() => useChatTabUnread({ chatGroupId: 'g1', eventId: 'e1', tab: 'people', myId: 'me' }))
  expect(result.current).toBe(3)
  await say('them')
  await say('me')
  await say('them', 'g2')
  expect(result.current).toBe(4)
})

it('is 0 on Chat, stays 0 while you read, and counts again from 0 back on People', async () => {
  const hook = await renderHook(({ tab }: { tab: 'people' | 'chat' }) => useChatTabUnread({ chatGroupId: 'g1', eventId: 'e1', tab, myId: 'me' }), { initialProps: { tab: 'people' } })
  expect(hook.result.current).toBe(3)
  await hook.rerender({ tab: 'chat' })
  expect(hook.result.current).toBe(0)
  await say('them')
  expect(hook.result.current).toBe(0)
  await hook.rerender({ tab: 'people' })
  await say('them')
  expect(hook.result.current).toBe(1)
})

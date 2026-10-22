import { roomUnreadFrom, watchRoomUnread } from '../lib/roomUnread'

const mockGroups = jest.fn()
const mockSubscribe = jest.fn()
jest.mock('../lib/apiClient', () => ({ apiClient: { getChatGroups: (...a: unknown[]) => mockGroups(...a) } }))
jest.mock('../lib/socketClient', () => ({ subscribeToChatMessage: (...a: unknown[]) => mockSubscribe(...a) }))
jest.mock('../lib/logger', () => ({ Logger: { debug: jest.fn(), warn: jest.fn(), error: jest.fn(), info: jest.fn() } }))

const groups = [
  { id: 'g1', unreadCount: 4, event: { id: 'e1' } },
  { id: 'g2', unreadCount: 9, event: { id: 'e2' } },
]
const flush = () => new Promise((r) => setImmediate(r))

describe('roomUnreadFrom', () => {
  it('finds the live event room and its unread', () => {
    expect(roomUnreadFrom(groups, 'e1')).toEqual({ chatGroupId: 'g1', unread: 4 })
  })
  it('is null when the room is not in the list', () => {
    expect(roomUnreadFrom(groups, 'nope')).toBeNull()
    expect(roomUnreadFrom(null, 'e1')).toBeNull()
    expect(roomUnreadFrom({ groups }, 'e1')).toEqual({ chatGroupId: 'g1', unread: 4 })
  })
  it('never goes negative or non-numeric', () => {
    expect(roomUnreadFrom([{ id: 'g', unreadCount: -3, event: { id: 'e' } }], 'e')?.unread).toBe(0)
    expect(roomUnreadFrom([{ id: 'g', unreadCount: 'x', event: { id: 'e' } }], 'e')?.unread).toBe(0)
  })
})

describe('watchRoomUnread', () => {
  let push: (d: { chatGroupId: string; message: { userId: string } }) => void
  const unsubscribe = jest.fn()
  beforeEach(() => {
    mockGroups.mockReset()
    unsubscribe.mockReset()
    mockSubscribe.mockReset().mockImplementation((_id: string, cb: typeof push) => {
      push = cb
      return unsubscribe
    })
  })

  it('reports the server count, then counts messages from others until the next read', async () => {
    mockGroups.mockResolvedValue({ success: true, data: groups })
    const seen: number[] = []
    const w = watchRoomUnread({ eventId: 'e1', myId: () => 'me', onChange: (n) => seen.push(n) })
    await w.refresh()
    push({ chatGroupId: 'g1', message: { userId: 'them' } })
    push({ chatGroupId: 'g1', message: { userId: 'me' } })
    expect(seen).toEqual([4, 5])
    mockGroups.mockResolvedValue({ success: true, data: [{ id: 'g1', unreadCount: 0, event: { id: 'e1' } }] })
    await w.refresh()
    expect(seen.at(-1)).toBe(0)
    w.stop()
    expect(unsubscribe).toHaveBeenCalled()
  })

  it('keeps the last answer when a read fails', async () => {
    mockGroups.mockResolvedValueOnce({ success: true, data: groups }).mockResolvedValueOnce({ success: false })
    const seen: number[] = []
    const w = watchRoomUnread({ eventId: 'e1', myId: () => 'me', onChange: (n) => seen.push(n) })
    await w.refresh()
    await w.refresh()
    await flush()
    expect(seen).toEqual([4])
  })

  it('does nothing after stop', async () => {
    mockGroups.mockResolvedValue({ success: true, data: groups })
    const seen: number[] = []
    const w = watchRoomUnread({ eventId: 'e1', myId: () => 'me', onChange: (n) => seen.push(n) })
    w.stop()
    await w.refresh()
    expect(seen).toEqual([])
  })
})

import { roomUnreadFrom, watchRoomUnread } from '../lib/roomUnread'

const mockGroups = jest.fn()
jest.mock('../lib/apiClient', () => ({ apiClient: { getChatGroups: (...a: unknown[]) => mockGroups(...a) } }))
jest.mock('../lib/logger', () => ({ Logger: { debug: jest.fn(), warn: jest.fn(), error: jest.fn(), info: jest.fn() } }))

const groups = [
  { id: 'g1', unreadCount: 4, event: { id: 'e1' } },
  { id: 'g2', unreadCount: 9, event: { id: 'e2' } },
]

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

describe('watchRoomUnread: the server’s count and nothing else', () => {
  beforeEach(() => mockGroups.mockReset())

  it('the tick reads the cached list; a forced read is for a moment the answer has moved', async () => {
    mockGroups.mockResolvedValue({ success: true, data: groups })
    const seen: number[] = []
    const w = watchRoomUnread({ eventId: 'e1', onChange: (n) => seen.push(n) })
    await w.refresh()
    expect(mockGroups).toHaveBeenLastCalledWith({ force: false })
    mockGroups.mockResolvedValue({ success: true, data: [{ id: 'g1', unreadCount: 0, event: { id: 'e1' } }] })
    await w.refresh(true)
    expect(mockGroups).toHaveBeenLastCalledWith({ force: true })
    expect(seen).toEqual([4, 0])
  })

  it('has no socket: a message in the room is not counted until the server says so', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const src = require('fs').readFileSync(require('path').join(__dirname, '../lib/roomUnread.ts'), 'utf8') as string
    expect(src).not.toMatch(/socketClient|subscribeToChatMessage/)
  })

  it('keeps the last answer when a read fails', async () => {
    mockGroups.mockResolvedValueOnce({ success: true, data: groups }).mockResolvedValueOnce({ success: false })
    const seen: number[] = []
    const w = watchRoomUnread({ eventId: 'e1', onChange: (n) => seen.push(n) })
    await w.refresh()
    await w.refresh()
    expect(seen).toEqual([4])
  })

  it('does nothing after stop', async () => {
    mockGroups.mockResolvedValue({ success: true, data: groups })
    const seen: number[] = []
    const w = watchRoomUnread({ eventId: 'e1', onChange: (n) => seen.push(n) })
    w.stop()
    await w.refresh()
    expect(seen).toEqual([])
  })
})

describe('the bar wires it (R1)', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const layout = require('fs').readFileSync(require('path').join(__dirname, '../app/(tabs)/_layout.tsx'), 'utf8') as string
  it('passes the count to the disc', () => {
    expect(layout).toMatch(/roomUnread: unread/)
    expect(layout).toMatch(/watchRoomUnread\(/)
  })
  it('forces a read when the Room closes, the app comes back and the chat is left', () => {
    expect(layout).toMatch(/if \(!blendnOpen\) rereadUnread\.current\(true\)/)
    expect(layout).toMatch(/state === 'active'\) \{[\s\S]{0,80}rereadUnread\.current\(true\)/)
    expect(layout).toMatch(/startsWith\('\/chat\/'\)[\s\S]{0,120}rereadUnread\.current\(true\)/)
  })
})

/*
 * Delivered ticks, the unread divider and retry-safe sends (SCRUM-406, 408, 410).
 */
import { newClientId } from '../lib/clientId'
import { receiptFor } from '../lib/receipts'
import { withUnreadDivider } from '../lib/unreadDivider'

describe('newClientId', () => {
  it('is a v4 uuid, different every time', () => {
    const a = newClientId()
    const b = newClientId()
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(a).not.toBe(b)
  })
})

describe('receiptFor', () => {
  const me = 'me'
  const base = { senderId: me, isRead: false, deliveredAt: null as string | null, failed: false }

  it('✓ sent until their app has it', () => {
    expect(receiptFor({ ...base }, me)).toBe('sent')
  })
  it('✓✓ delivered once it arrived — the other app in the background still counts', () => {
    expect(receiptFor({ ...base, deliveredAt: '2026-09-28T20:00:00Z' }, me)).toBe('delivered')
  })
  it('✓✓ read when they read it', () => {
    expect(receiptFor({ ...base, deliveredAt: '2026-09-28T20:00:00Z', isRead: true }, me)).toBe('read')
  })
  it('read implies delivered even when no delivery was recorded (older rows)', () => {
    expect(receiptFor({ ...base, isRead: true }, me)).toBe('read')
  })
  it('nothing on their messages, nothing on a failed send', () => {
    expect(receiptFor({ ...base, senderId: 'them' }, me)).toBeNull()
    expect(receiptFor({ ...base, failed: true }, me)).toBeNull()
  })
})

describe('withUnreadDivider', () => {
  type Item = { kind: 'message'; id: string } | { kind: 'separator'; id: string }
  const items: Item[] = [
    { kind: 'separator', id: 'sep-1' },
    { kind: 'message', id: 'm1' },
    { kind: 'message', id: 'm2' },
    { kind: 'message', id: 'm3' },
  ]

  it('puts "N unread messages" right above the first unread', () => {
    const out = withUnreadDivider(items, 'm2', 2)
    expect(out.map((i) => i.id)).toEqual(['sep-1', 'm1', 'unread-divider', 'm2', 'm3'])
    expect(out[2]).toMatchObject({ kind: 'unread', label: '2 unread messages' })
  })

  it('says "1 unread message" for one', () => {
    expect(withUnreadDivider(items, 'm3', 1)[3]).toMatchObject({ label: '1 unread message' })
  })

  it('leaves the list alone with nothing unread, or an anchor not loaded', () => {
    expect(withUnreadDivider(items, null, 0)).toBe(items)
    expect(withUnreadDivider(items, 'gone', 3)).toBe(items)
  })
})

describe('swipe to reply', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { replyDragOffset, REPLY_SWIPE_TRIGGER } = require('../lib/swipeReply')

  it('moves right only', () => {
    expect(replyDragOffset(-40)).toBe(0)
    expect(replyDragOffset(30)).toBe(30)
  })
  it('reaches the trigger 1:1, then slows and stops', () => {
    expect(replyDragOffset(REPLY_SWIPE_TRIGGER)).toBe(REPLY_SWIPE_TRIGGER)
    expect(replyDragOffset(REPLY_SWIPE_TRIGGER + 20)).toBeLessThan(REPLY_SWIPE_TRIGGER + 20)
    expect(replyDragOffset(1000)).toBe(88)
  })
})

import { buildEntries, entryIndexOf } from '../lib/notificationEntries'
import type { NotificationItem } from '../lib/notificationFormat'
import { groupFeed } from '../lib/notificationRows'
import { readFileSync } from 'fs'
import { join } from 'path'

const NOW = Date.parse('2026-10-22T12:00:00Z')
const item = (id: string, kind: NotificationItem['kind'], over: Partial<NotificationItem> = {}): NotificationItem => ({
  id, kind, title: 't', body: 'b', data: null, readAt: null, createdAt: new Date(NOW - 60_000).toISOString(), ...over,
})
const groups = (items: NotificationItem[], fresh: string[] = []) => groupFeed(items, { fresh: new Set(fresh), resolved: new Set(), now: NOW })

describe('buildEntries', () => {
  it('is Waiting on you as one card, then New and Earlier each under a header, then the foot', () => {
    const e = buildEntries(groups([item('a', 'friend_request'), item('b', 'match'), item('c', 'blend')], ['b']), { allWaiting: false, hasMore: false })
    expect(e.map((x) => x.key)).toEqual(['waiting', 'header:New', 'row:b', 'header:Earlier', 'row:c', 'footer'])
  })

  it('shows three of the waiting requests until See all, then every one', () => {
    const five = ['1', '2', '3', '4', '5'].map((i) => item(i, 'friend_request'))
    const first = buildEntries(groups(five), { allWaiting: false, hasMore: false })[0]
    const all = buildEntries(groups(five), { allWaiting: true, hasMore: false })[0]
    expect(first).toMatchObject({ type: 'waiting', total: 5 })
    expect((first as { rows: unknown[] }).rows).toHaveLength(3)
    expect((all as { rows: unknown[] }).rows).toHaveLength(5)
  })

  it('draws no header for an empty section, and nothing at all, foot included, for nothing', () => {
    expect(buildEntries(groups([item('c', 'blend')]), { allWaiting: false, hasMore: false }).map((x) => x.key)).toEqual(['header:Earlier', 'row:c', 'footer'])
    expect(buildEntries(groups([]), { allWaiting: false, hasMore: false })).toEqual([])
  })

  it('the foot is a spinner while there are more pages', () => {
    const e = buildEntries(groups([item('c', 'blend')]), { allWaiting: false, hasMore: true })
    expect(e[e.length - 1]).toMatchObject({ type: 'footer', more: true })
  })

  it('finds a row’s entry, a waiting row by its card', () => {
    const e = buildEntries(groups([item('a', 'friend_request'), item('c', 'blend')]), { allWaiting: false, hasMore: false })
    expect(entryIndexOf(e, 'a')).toBe(0)
    expect(entryIndexOf(e, 'c')).toBe(2)
    expect(entryIndexOf(e, 'zzz')).toBe(-1)
  })
})

describe('the old sheet is gone', () => {
  const read = (...p: string[]) => readFileSync(join(__dirname, '..', ...p), 'utf8')
  it('the bell pushes the screen and imports no sheet', () => {
    const bell = read('components', 'pulse', 'NotificationBell.tsx')
    expect(bell).toContain("router.push('/notifications')")
    expect(bell).not.toMatch(/RisingSheet|SheetModal|ConfirmSheet|ActivityIndicator/)
    expect(() => read('components', 'motion', 'RisingSheet.tsx')).toThrow()
  })
  it('the bell reads out the true count where the badge says 9+', () => {
    expect(read('components', 'pulse', 'NotificationBell.tsx')).toMatch(/accessibilityValue=\{unread > 0 \? \{ text: `\$\{unread\} unseen` \} : undefined\}/)
  })
  it('both screens are declared with no native header', () => {
    const layout = read('app', '_layout.tsx')
    expect(layout).toMatch(/name="notifications" options=\{\{ headerShown: false \}\}/)
    expect(layout).toMatch(/name="notification-settings" options=\{\{ headerShown: false \}\}/)
  })
})

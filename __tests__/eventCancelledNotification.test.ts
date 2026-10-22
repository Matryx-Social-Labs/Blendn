/*
 * The server's `event_cancelled` (admin SV7): a push and a bell row for everyone who was checked in
 * when the event was cancelled, `data: { type: 'event_cancelled', eventId }`. It opens the event, shows
 * as the event's tile struck through, and is a bell row only while the app is open (the Room's card
 * already says it).
 */
import fs from 'fs'
import path from 'path'

import { bannerFor } from '../lib/inAppBanners'
import type { NotificationItem } from '../lib/notificationFormat'
import { rowFor } from '../lib/notificationRows'

const NOW = Date.parse('2026-10-22T20:00:00Z')
const item = (over: Partial<NotificationItem>): NotificationItem =>
  ({ id: 'n1', kind: 'event_cancelled', title: 'Vinyl Night', body: 'This event has been cancelled. You are no longer checked in.', read: false, createdAt: new Date(NOW - 60_000).toISOString(), data: { type: 'event_cancelled', eventId: 'e1' }, ...over }) as NotificationItem

describe('event_cancelled', () => {
  it('is the event tile, struck through, with the server’s sentence', () => {
    const row = rowFor(item({}), NOW)
    expect(row.visual).toMatchObject({ type: 'event', cancelled: true })
    expect(row.title).toBe('This event has been cancelled. You are no longer checked in.')
    expect(row.context).toContain('Vinyl Night')
  })

  it('never carries a person: it is not a person-only kind, and says no friend request', () => {
    const row = rowFor(item({}), NOW)
    expect(row.actions ?? []).toHaveLength(0)
  })

  it('a push of it is not a foreground capsule: the Room’s card says it', () => {
    expect(bannerFor({ title: 'Vinyl Night', body: 'x', data: { type: 'event_cancelled', eventId: 'e1' } }, 1)).toBeNull()
  })

  it('opens the event, from a push or the bell', () => {
    const src = fs.readFileSync(path.join(__dirname, '../lib/notifications.ts'), 'utf8')
    expect(src).toMatch(/case 'event_changed':\n\s*case 'event_cancelled':\n\s*case 'event_reminder':/)
  })

  it('the person-only kinds are untouched', () => {
    const src = fs.readFileSync(path.join(__dirname, '../lib/notificationRows.ts'), 'utf8')
    expect(src).toMatch(/PERSON_ONLY[^\n]*new Set\(\['friend_request', 'friend_accepted'\]\)/)
  })
})

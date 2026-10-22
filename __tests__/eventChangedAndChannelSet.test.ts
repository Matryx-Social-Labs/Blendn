/*
 * Two pieces of the server's client-gaps contract: `event_changed` (sent to people going when the time, venue or status
 * changed) is shown and opened exactly like `event_update`; and the push token tells the server which Android channel set
 * this install created, so pushes never land in a channel the build lacks.
 */
process.env.EXPO_PUBLIC_API_BASE_URL = 'https://api.test'

import fs from 'fs'
import path from 'path'

import { bannerFor } from '../lib/inAppBanners'
import type { NotificationItem } from '../lib/notificationFormat'
import { rowFor } from '../lib/notificationRows'

const NOW = Date.parse('2026-10-22T12:00:00Z')
const item = (over: Partial<NotificationItem> & Pick<NotificationItem, 'id' | 'kind'>): NotificationItem =>
  ({ title: 'Vinyl Night', body: 'New start time: 9:30 pm', createdAt: '2026-10-22T11:00:00Z', read: false, data: {}, ...over }) as NotificationItem

describe('event_changed reads as event_update', () => {
  it.each([
    [undefined, { badge: 'clock', cancelled: false }],
    ['venue', { badge: 'map-pin', cancelled: false }],
    ['cancelled', { badge: 'clock', cancelled: true }],
  ])('row visual for reason %s', (reason, expected) => {
    const data = reason ? { reason } : {}
    const changed = rowFor(item({ id: 'c', kind: 'event_changed' as NotificationItem['kind'], data }), NOW)
    const update = rowFor(item({ id: 'u', kind: 'event_update', data }), NOW)
    expect(changed.visual).toMatchObject({ type: 'event', ...expected })
    expect(changed.visual).toEqual(update.visual)
    expect(changed.title).toBe(update.title)
  })

  it('banner is the event capsule', () => {
    const b = bannerFor({ title: 'Vinyl Night', body: 'Moved to Toit', data: { type: 'event_changed', eventId: 'e1', reason: 'venue' } }, 1)
    expect(b).toMatchObject({ visual: { type: 'event', badge: 'map-pin' } })
  })

  it('a tap opens the event, like event_update', () => {
    const src = fs.readFileSync(path.join(__dirname, '../lib/notifications.ts'), 'utf8')
    expect(src).toMatch(/case 'event_update':\n\s*case 'event_changed':/)
  })
})

describe('the push token carries the channel set', () => {
  it('registerPushToken posts channelSet 2', async () => {
    const { apiClient, PUSH_CHANNEL_SET } = require('../lib/apiClient')
    expect(PUSH_CHANNEL_SET).toBe(2)
    const spy = jest.spyOn(apiClient, 'queuedRequest').mockResolvedValue({ success: true, data: { message: 'ok' } })
    await apiClient.registerPushToken('tok', 'android')
    const [url, init] = spy.mock.calls[0] as [string, { body: string }]
    expect(url).toBe('/api/mobile/notifications/token')
    expect(JSON.parse(init.body)).toEqual({ token: 'tok', platform: 'android', channelSet: 2 })
    spy.mockRestore()
  })
})

/**
 * The blocked list's line (Flow 6 `blocked`: "Blocked " + the date in Geist Mono + " · reason"), and the four settings-style
 * screens whose scroll used to be cut by a bottom-edge SafeAreaView (visual QA R5 M19).
 */
import { readFileSync } from 'fs'
import { join } from 'path'

jest.mock('../lib/apiClient', () => ({ apiClient: {} }))
jest.mock('../lib/logger', () => ({ Logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } }))

import { blockedLine } from '../lib/blockedLine'

const NOW = new Date('2026-10-21T12:00:00Z')

describe('blockedLine', () => {
  it('splits the words, the date and the reason, so the date can be set in mono', () => {
    expect(blockedLine({ blocked_at: '2026-09-12T10:00:00Z', reason: 'harassment' }, NOW)).toEqual({
      detail: 'Blocked ',
      mono: 'Sep 12',
      tail: ' · Harassment',
    })
  })

  it('has no reason when there is none, or it is not one we can name', () => {
    expect(blockedLine({ blocked_at: '2026-08-03T10:00:00Z', reason: null }, NOW)).toEqual({ detail: 'Blocked ', mono: 'Aug 3' })
    expect(blockedLine({ blocked_at: '2026-08-03T10:00:00Z', reason: 'made_up' }, NOW)).not.toHaveProperty('tail')
  })

  it('shows the year only for another year', () => {
    expect(blockedLine({ blocked_at: '2025-12-30T10:00:00Z', reason: null }, NOW).mono).toBe('Dec 30, 2025')
  })

  it('is just "Blocked" when the date cannot be read', () => {
    expect(blockedLine({ blocked_at: 'not a date', reason: null }, NOW)).toEqual({ detail: 'Blocked' })
  })
})

describe('the scroll owns its foot', () => {
  const src = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8')
  it.each(['app/settings.tsx', 'app/blocked-users.tsx', 'app/about.tsx', 'app/support.tsx', 'app/friends/index.tsx', 'app/friends/add.tsx', 'app/friends/requests.tsx'])(
    '%s has no SafeAreaView around the scroll, and pads its foot by the inset',
    (rel) => {
      const code = src(rel)
      expect(code).not.toMatch(/<SafeAreaView/)
      expect(code).toMatch(/insets\.bottom/)
    },
  )
})

/*
 * The haptic rulings the audit (U-M16, U-M17, U-L5, U-L9) put on the home, Pulse, notification and onboarding surfaces,
 * pinned as source shape because each is a call that must not exist, or exist exactly once: saving an event earns no
 * Success; a refresh is silent; a destructive confirm ticks once on press; a failure answers once, from its toast.
 */
import { readFileSync } from 'fs'
import { join } from 'path'

const code = (rel: string) =>
  readFileSync(join(__dirname, '..', rel), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

describe('what a save, a refresh and a failure play', () => {
  it('saving an event plays no Success (a failure plays its error through its toast, once)', () => {
    const src = code('app/(tabs)/events.tsx')
    const toggle = src.slice(src.indexOf('const toggleInterest'), src.indexOf('const handleCheckOut'))
    expect(toggle).not.toMatch(/H\.success/)
    expect(toggle).not.toMatch(/H\.error/)
    expect(toggle.match(/haptic: 'error'/g)).toHaveLength(1)
  })

  it('a pull to refresh in Places is silent: H.threshold is "armed", and RefreshControl reports only the start', () => {
    expect(code('components/home/PlacesList.tsx')).not.toMatch(/H\.threshold|haptics/)
  })

  it('Clear all on the Notifications screen ticks H.destructive on the confirm, and a failure restores the rows and answers from its toast', () => {
    const screen = code('app/notifications.tsx')
    const feed = code('lib/useNotificationFeed.ts')
    // The confirm is the DS Sheet's primary button (strong, not red: nothing is destroyed; E13), which plays its own tap: a call here would play it twice.
    expect(screen).toMatch(/label: 'Clear all', variant: 'primary'/)
    expect(screen).not.toMatch(/H\.destructive/)
    expect(feed).toMatch(/showToast\('Couldn’t clear\. Try again\.', 'error', \{ haptic: 'error' \}\)/)
    expect(feed).toMatch(/setItems\(before\)/)
  })

  it('every onboarding submit failure asks its toast for the error haptic', () => {
    for (const rel of ['lib/useOnboarding.ts', 'app/onboarding/media.tsx']) {
      const calls = code(rel).match(/showToast\([^\n]*'error'[^\n]*\)/g) ?? []
      expect(calls.length).toBeGreaterThan(0)
      for (const call of calls) expect(call).toMatch(/haptic: 'error'/)
    }
  })
})

describe('the Notifications screen’s decorative glyphs and skeleton', () => {
  it('are hidden from, or named for, a screen reader', () => {
    // The state glyphs are the StateScreen's (decorative, the title says it); the skeleton names itself once.
    expect(code('components/notifications/NotificationsSkeleton.tsx')).toMatch(/accessibilityLabel="Loading notifications"/)
    expect(code('components/ds/NotificationRow.tsx')).toMatch(/accessibilityElementsHidden/)
  })
})

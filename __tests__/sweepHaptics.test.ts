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
  it('saving an event plays no Success (a failure plays its error through the tray, once)', () => {
    const src = code('app/(tabs)/events.tsx')
    const toggle = src.slice(src.indexOf('const toggleInterest'), src.indexOf('const handleCheckOut'))
    expect(toggle).not.toMatch(/H\.success/)
    expect(toggle.match(/H\.error\(\)/g)).toHaveLength(1)
  })

  it('a pull to refresh in Places is silent: H.threshold is "armed", and RefreshControl reports only the start', () => {
    expect(code('components/home/PlacesList.tsx')).not.toMatch(/H\.threshold|haptics/)
  })

  it('Clear all in the notifications sheet ticks H.destructive on the confirm, and a failure restores the rows and answers from its toast', () => {
    const src = code('components/pulse/NotificationBell.tsx')
    expect(src.match(/H\.destructive\(\)/g)).toHaveLength(1)
    expect(src).toMatch(/showToast\('Couldn’t clear\. Try again\.', 'error', \{ haptic: 'error' \}\)/)
    expect(src).toMatch(/setItems\(before\.items\)/)
  })

  it('every onboarding submit failure asks its toast for the error haptic', () => {
    for (const rel of ['lib/useOnboarding.ts', 'app/onboarding/media.tsx']) {
      const calls = code(rel).match(/showToast\([^\n]*'error'[^\n]*\)/g) ?? []
      expect(calls.length).toBeGreaterThan(0)
      for (const call of calls) expect(call).toMatch(/haptic: 'error'/)
    }
  })
})

describe('the notification sheet’s decorative glyphs and spinner', () => {
  it('are hidden from, or named for, a screen reader', () => {
    const src = code('components/pulse/NotificationBell.tsx')
    expect(src.match(/accessibilityElementsHidden/g)?.length).toBeGreaterThanOrEqual(2)
    expect(src).toMatch(/accessibilityLabel="Loading notifications"/)
  })
})

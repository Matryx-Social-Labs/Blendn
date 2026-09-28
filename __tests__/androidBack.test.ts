import { readFileSync } from 'fs'
import { join } from 'path'

import { handleAndroidBack, isBackRoot } from '../lib/androidBack'

/**
 * Android's hardware back at the root layout.
 *
 * Three bugs: back on a tab never matched the "tab root" check (Expo Router's
 * pathname drops the `(tabs)` group), back at a root could never background
 * the app (the handler always returned `true`), and re-registering on every
 * navigation put this handler ahead of the Blend'n overlay's own.
 */
const nav = (canGoBack: boolean) => ({ canGoBack: jest.fn(() => canGoBack), back: jest.fn() })

describe('isBackRoot', () => {
  it.each(['/', '/index', '/events', '/going', '/chat', '/profile'])('%s is a root', (path) => {
    expect(isBackRoot(path)).toBe(true)
  })

  it.each(['/settings', '/event/abc', '/onboarding/journey', '/chat/abc', '/profile-edit'])('%s is not', (path) => {
    expect(isBackRoot(path)).toBe(false)
  })
})

describe('handleAndroidBack', () => {
  it('pops when there is somewhere to go', () => {
    const n = nav(true)
    expect(handleAndroidBack('/settings', n)).toBe(true)
    expect(n.back).toHaveBeenCalledTimes(1)
  })

  it('hands the press on when there is no history, instead of popping into nothing', () => {
    const n = nav(false)
    expect(handleAndroidBack('/event/abc', n)).toBe(false)
    expect(n.back).not.toHaveBeenCalled()
  })

  it('lets the app background from a tab with nothing underneath', () => {
    const n = nav(false)
    expect(handleAndroidBack('/events', n)).toBe(false)
  })

  it('does not pop a tab back into a finished flow underneath it', () => {
    const n = nav(true)
    expect(handleAndroidBack('/chat', n)).toBe(true)
    expect(n.back).not.toHaveBeenCalled()
  })

  it('survives a navigator that throws', () => {
    expect(handleAndroidBack('/settings', { canGoBack: () => { throw new Error('not ready') }, back: jest.fn() })).toBe(false)
  })
})

describe('the root layout', () => {
  const src = readFileSync(join(__dirname, '..', 'app/_layout.tsx'), 'utf8')
  const effect = src.slice(src.indexOf("BackHandler.addEventListener('hardwareBackPress'"))

  it('registers once, reading the pathname from a ref', () => {
    expect(src).toMatch(/handleAndroidBack\(pathnameRef\.current, router\)/)
    // The effect's dependency list is empty: re-registering put it ahead of the overlay's handler.
    expect(effect).toMatch(/^[\s\S]*?return \(\) => sub\.remove\(\);\s*\}, \[\]\);/)
  })
})

/*
 * No launch animation (owner, 2026-10-21): the native splash shows the static monogram and hands straight to the first
 * screen once fonts and images are ready. Its background is the page ink, so the hand-off has no change of black.
 */
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'

const ROOT = join(__dirname, '..')

it('the root layout mounts no intro overlay and preloads no intro asset', () => {
  const layout = readFileSync(join(ROOT, 'app/_layout.tsx'), 'utf8')
  expect(layout).not.toMatch(/IntroAnimation|intro\.webp|showIntro/)
  expect(existsSync(join(ROOT, 'components/IntroAnimation.tsx'))).toBe(false)
  expect(existsSync(join(ROOT, 'assets/logo/intro.webp'))).toBe(false)
})

it('the splash background is the page ink', () => {
  const { COLOR } = require('../lib/design/tokens')
  const app = JSON.parse(readFileSync(join(ROOT, 'app.json'), 'utf8'))
  const splash = app.expo.plugins.find((p: unknown) => Array.isArray(p) && p[0] === 'expo-splash-screen')[1]
  expect(splash.backgroundColor.toUpperCase()).toBe(COLOR.ink.toUpperCase())
  expect(splash.dark.backgroundColor.toUpperCase()).toBe(COLOR.ink.toUpperCase())
})

/**
 * One status bar for the app, set in the root layout.
 *
 * Screens used to each render `<StatusBar style="light" />`, the same style
 * the root already sets (the app is dark only, and iOS status bar appearance
 * is global here: `UIViewControllerBasedStatusBarAppearance` is false). A
 * screen that needs a different style should say why next to it, and be
 * added below.
 */
import { readdirSync, readFileSync, statSync } from 'fs'
import { join, relative } from 'path'

const ROOT = join(__dirname, '..')
const ALLOWED = new Set(['app/_layout.tsx'])

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.tsx?$/.test(name)) out.push(p)
  }
  return out
}

it('only the root layout renders a StatusBar', () => {
  const offenders = [...walk(join(ROOT, 'app')), ...walk(join(ROOT, 'components'))]
    .map((p) => relative(ROOT, p))
    .filter((p) => !ALLOWED.has(p))
    .filter((p) => /from 'expo-status-bar'/.test(readFileSync(join(ROOT, p), 'utf8')))
  expect(offenders).toEqual([])
})

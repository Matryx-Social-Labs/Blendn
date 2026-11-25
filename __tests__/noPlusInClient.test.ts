/*
 * Launch gate 5 (SCRUM-1178): Blend'n+ is deleted from the client, not hidden. 1.0 goes to App Review with no
 * in-app purchase, so no route may open a paywall and no module may reach the Plus layer. The code lives on at the
 * git tag `plus-paused-2026-11`; bringing it back is a revert of that deletion, which this guard will then name.
 * `lib/purchases.ts` (the RevenueCat SDK wrapper) stays until task 04's native rebuild, so it is not listed here.
 */
import { readdirSync, readFileSync, statSync } from 'fs'
import { basename, join } from 'path'

const root = join(__dirname, '..')

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(join(root, dir))) {
    const path = join(dir, name)
    if (statSync(join(root, path)).isDirectory()) walk(path, out)
    else if (/\.tsx?$/.test(name)) out.push(path)
  }
  return out
}

const sources = ['app', 'components', 'lib'].flatMap((dir) => walk(dir))

/** A local import (static, dynamic or require) of a Plus-layer module, by its last path segment; packages (lucide's `icons/plus`) are not ours. */
const PLUS_IMPORT =
  /(?:from\s+|import\(\s*|require\(\s*)['"](?:\.{1,2}|@)\/(?:[^'"]*\/)?(?:paywall|paywallPolicy|plus|plusManage|mePlus|useMonthlyPrice|plus\/[^'"]+)['"]/

it('no route is named plus*', () => {
  expect(walk('app').filter((f) => /^plus/i.test(basename(f)))).toEqual([])
})

it('no Stack.Screen registers a plus route', () => {
  expect(read('app/_layout.tsx')).not.toMatch(/name=["']plus/)
})

it('no module imports the Plus layer', () => {
  expect(sources.filter((f) => PLUS_IMPORT.test(read(f)))).toEqual([])
})

it('the guard regex catches each shape it is meant to catch (negative control)', () => {
  for (const line of [
    "import { openPaywall } from '../lib/paywall'",
    "import { showsPlus } from '@/lib/mePlus'",
    "import { loadPlusOffers } from '../../lib/plus'",
    "import { usePlusManage } from '@/lib/plusManage'",
    "import TonightHost from '../plus/TonightHost'",
    "const m = require('../lib/paywallPolicy')",
    "await import('@/lib/useMonthlyPrice')",
    "import { openTonight } from './paywall'",
  ])
    expect(line).toMatch(PLUS_IMPORT)
  for (const line of [
    "import { syncPurchasesUser } from './purchases'",
    "import { Icon } from './ui/Icon'",
    "import Plus from 'lucide-react-native/icons/plus'",
  ])
    expect(line).not.toMatch(PLUS_IMPORT)
})

function read(path: string): string {
  return readFileSync(join(root, path), 'utf8')
}

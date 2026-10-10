/**
 * Two source guards for Blendn+ (plan v2 step 11).
 *
 * - **MN-CU01** — the paywall never comes from onboarding, a check-in, a chat
 *   or the room: none of them imports it or routes to it. (It is mounted over
 *   them too, through `LiveAtVenue`; that is the policy's job,
 *   `paywallPolicy.test.ts`.)
 * - **MN-G03 (client)** — Blendn+ is sold through the App Store and Google
 *   Play only (guideline 3.1.1): no Razorpay anywhere in the app, and no
 *   RevenueCat web checkout.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'fs'
import { join, relative } from 'path'

const ROOT = join(__dirname, '..')
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8')

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(join(ROOT, dir))) {
    const rel = join(dir, entry)
    if (statSync(join(ROOT, rel)).isDirectory()) walk(rel, out)
    else if (/\.(ts|tsx|js|jsx)$/.test(entry)) out.push(rel)
  }
  return out
}

/** Where the paywall must never come from. */
const QUIET = [
  ...walk('app/onboarding'),
  ...walk('app/chat'),
  ...walk('app/private-chat'),
  'app/room.tsx',
  // The check-in: its request, its flow, and the room's hold-to-check-in.
  'lib/checkIn.ts',
  'lib/useCheckInFlow.ts',
  ...walk('components/blendn'),
]

/** An import of the paywall, its policy or the store, or a push to its route. */
const PAYWALL = /from ['"][^'"]*\/(paywall|paywallPolicy|purchases|plus)['"]|from ['"]react-native-purchases['"]|['"]\/plus['"]/

describe('MN-CU01: the paywall is not reachable from onboarding, a check-in, a chat or the room', () => {
  it('covers real files', () => {
    for (const f of ['app/onboarding/basics.tsx', 'app/chat/[id].tsx', 'app/room.tsx', 'lib/useCheckInFlow.ts']) {
      expect(QUIET).toContain(f)
      expect(existsSync(join(ROOT, f))).toBe(true)
    }
  })

  it.each(QUIET)('%s does not import or open it', (file) => {
    expect(read(file)).not.toMatch(PAYWALL)
  })

  it('the pattern catches the ways in', () => {
    expect("import { openPaywall } from '../lib/paywall'").toMatch(PAYWALL)
    expect("import { mayOpenPaywall } from '../../lib/paywallPolicy'").toMatch(PAYWALL)
    expect("import Purchases from 'react-native-purchases'").toMatch(PAYWALL)
    expect("router.push('/plus')").toMatch(PAYWALL)
    expect("import { useGoLive } from '../lib/useGoLive'").not.toMatch(PAYWALL)
  })
})

describe('MN-G03: Blendn+ is never sold outside the stores', () => {
  const SOURCES = [...walk('app'), ...walk('components'), ...walk('lib')]

  it('no Razorpay anywhere in the app source', () => {
    const hits = SOURCES.filter((f) => /razorpay/i.test(read(f)))
    expect(hits).toEqual([])
  })

  it('no Razorpay or web-billing SDK among the dependencies', () => {
    const pkg = JSON.parse(read('package.json')) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> }
    const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })
    expect(deps.filter((d) => /razorpay/i.test(d) || d === '@revenuecat/purchases-js')).toEqual([])
  })

  it("no RevenueCat web checkout: a package's webCheckoutUrl is never read", () => {
    const hits = SOURCES.filter((f) => /webCheckoutUrl|purchases-js['"]/.test(read(f)))
    expect(hits.map((f) => relative(ROOT, join(ROOT, f)))).toEqual([])
  })
})

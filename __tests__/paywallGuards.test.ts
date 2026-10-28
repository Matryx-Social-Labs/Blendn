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

  // Reading what the server says about an entitlement bought outside the app is not selling it (SYS-17, OD-5): the source
  // name `'razorpay'` and the words about it, in the three files that draw Manage. Never a link, a checkout or an SDK.
  const SOURCE_NAME_READERS = ['app/plus-manage.tsx', 'lib/plus.ts', 'lib/plusManage.ts']
  // The paywall also reads it (to sell nothing to someone who already has Plus outside the app), and opens the terms links, so only its Razorpay lines are held to the source name.
  const PAYWALL_READER = 'app/plus.tsx'

  /** Every line that says Razorpay must be reading the source name or be a comment. */
  const READS_THE_SOURCE_NAME = /source === 'razorpay'|'grant' \| 'razorpay' \| null|^\s*(\/\/|\*|\/\*\*)/
  /** And these files may not open anything outside the app, or load a Razorpay module. */
  const OPENS_OUTSIDE = /require\([^)]*razorpay|openURL|openInApp|WebBrowser|Linking/
  const offending = (text: string): string[] =>
    text
      .split('\n')
      .filter((line) => (/razorpay/i.test(line) && !READS_THE_SOURCE_NAME.test(line)) || OPENS_OUTSIDE.test(line))

  it('no Razorpay anywhere in the app source, bar the entitlement source name where Manage reads it', () => {
    const hits = SOURCES.filter((f) => !SOURCE_NAME_READERS.includes(f) && f !== PAYWALL_READER && /razorpay/i.test(read(f)))
    expect(hits).toEqual([])
    for (const f of SOURCE_NAME_READERS) expect({ file: f, lines: offending(read(f)) }).toEqual({ file: f, lines: [] })
    const razorpayLines = read(PAYWALL_READER).split('\n').filter((l) => /razorpay/i.test(l))
    expect(razorpayLines.filter((l) => !READS_THE_SOURCE_NAME.test(l) || OPENS_OUTSIDE.test(l))).toEqual([])
  })

  it('the check catches a planted Razorpay module, link or checkout in an allow-listed file', () => {
    expect(offending("const Razorpay = require('react-native-razorpay')")).toHaveLength(1)
    expect(offending("Linking.openURL('https://rzp.io/pay')")).toHaveLength(1)
    expect(offending('openInApp(RAZORPAY_CHECKOUT_URL)')).toHaveLength(1)
    expect(offending("const url = 'https://razorpay.com/checkout'")).toHaveLength(1)
    expect(offending("if (status.source === 'razorpay') return null")).toHaveLength(0)
    expect(offending('  // Bought outside the app (Razorpay): no store holds it')).toHaveLength(0)
  })

  it('no Razorpay or web-billing SDK among the dependencies', () => {
    const pkg = JSON.parse(read('package.json')) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> }
    const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })
    expect(deps.filter((d) => /razorpay/i.test(d) || d === '@revenuecat/purchases-js')).toEqual([])
  })

  it("no RevenueCat web checkout: a package’s webCheckoutUrl is never read", () => {
    const hits = SOURCES.filter((f) => /webCheckoutUrl|purchases-js['"]/.test(read(f)))
    expect(hits.map((f) => relative(ROOT, join(ROOT, f)))).toEqual([])
  })
})

describe("the server’s RevenueCat secret key never ships (review LOW)", () => {
  /** A RevenueCat secret API key: `sk_` and a long token. The public keys are `appl_` / `goog_`. */
  const SECRET_KEY = /\bsk_[A-Za-z0-9]{12,}/

  it('the pattern catches one', () => {
    expect(SECRET_KEY.test('EXPO_PUBLIC_REVENUECAT_APPLE_KEY=sk_live0123456789abcd')).toBe(true)
    expect(SECRET_KEY.test('appl_0123456789abcdef')).toBe(false)
  })

  it('in no source, script, env example or build config', () => {
    const files = [
      ...walk('app'),
      ...walk('components'),
      ...walk('lib'),
      ...walk('scripts'),
      ...['.env.example', 'eas.json', 'app.json', 'app.config.js'].filter((f) => existsSync(join(ROOT, f))),
    ]
    expect(files.length).toBeGreaterThan(50)
    expect(files.filter((f) => SECRET_KEY.test(read(f)))).toEqual([])
  })
})


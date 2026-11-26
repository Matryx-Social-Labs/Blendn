/**
 * What the shipped bundle must never carry, kept from `paywallGuards.test.ts` when Blend'n+ was deleted (SCRUM-1178,
 * launch gate 5): the RevenueCat SDK and `lib/purchases.ts` stay until task 04, so the guards on them stay too.
 *
 * - **MN-G03 (client):** nothing is sold outside the App Store and Google Play (guideline 3.1.1): no Razorpay anywhere in
 *   the app, no Razorpay or web-billing dependency, and no RevenueCat web checkout.
 * - **Review LOW:** the server's RevenueCat secret key never ships.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'fs'
import { join } from 'path'

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

const SOURCES = [...walk('app'), ...walk('components'), ...walk('lib')]

describe('MN-G03: nothing is sold outside the stores', () => {
  it('no Razorpay anywhere in the app source', () => {
    expect(SOURCES.filter((f) => /razorpay/i.test(read(f)))).toEqual([])
  })

  it('no Razorpay or web-billing SDK among the dependencies', () => {
    const pkg = JSON.parse(read('package.json')) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> }
    const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })
    expect(deps.filter((d) => /razorpay/i.test(d) || d === '@revenuecat/purchases-js')).toEqual([])
  })

  it('no RevenueCat web checkout: a package’s webCheckoutUrl is never read', () => {
    expect(SOURCES.filter((f) => /webCheckoutUrl|purchases-js['"]/.test(read(f)))).toEqual([])
  })
})

describe('the server’s RevenueCat secret key never ships (review LOW)', () => {
  /** A RevenueCat secret API key: `sk_` and a long token. The public keys are `appl_` / `goog_`. */
  const SECRET_KEY = /\bsk_[A-Za-z0-9]{12,}/

  it('the pattern catches one', () => {
    expect(SECRET_KEY.test('EXPO_PUBLIC_REVENUECAT_APPLE_KEY=sk_live0123456789abcd')).toBe(true)
    expect(SECRET_KEY.test('appl_0123456789abcdef')).toBe(false)
  })

  it('in no source, script, env example or build config', () => {
    const files = [
      ...SOURCES,
      ...walk('scripts'),
      ...['.env.example', 'eas.json', 'app.json', 'app.config.js'].filter((f) => existsSync(join(ROOT, f))),
    ]
    expect(files.length).toBeGreaterThan(50)
    expect(files.filter((f) => SECRET_KEY.test(read(f)))).toEqual([])
  })
})

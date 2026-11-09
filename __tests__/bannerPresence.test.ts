/**
 * A banner that comes and goes with its condition arrives and leaves on DS #44 (motion audit M7, M15, M28): inside
 * `BannerPresence` (or a wrapper that carries `bannerIn`/`bannerOut` itself), never a bare `<Banner>` behind a `?`, `&&`
 * or an early `return`, which pops in and cuts out.
 */
import { readdirSync, readFileSync, statSync } from 'fs'
import { join } from 'path'

const ROOT = join(__dirname, '..')
const files = (dir: string): string[] =>
  readdirSync(join(ROOT, dir)).flatMap((f) => {
    const p = join(dir, f)
    return statSync(join(ROOT, p)).isDirectory() ? files(p) : /\.tsx$/.test(f) ? [p] : []
  })

const EXEMPT = new Set([
  // The banner is the swap: one wrapper carries the presence, and its kinds replace each other in place (a crossfade would stack two).
  'components/RealtimeStatusBanner.tsx',
  // The DS's own compositions (VisibilityBanner): the caller decides whether one is there.
  'components/ds/Banner.tsx',
])

/** `? <Banner`, `&& <Banner`, `return <Banner`, each also with `(` and a line break before the tag. */
const BARE = /(\?|&&|return)\s*\(?\s*<Banner\b/g

it('no banner pops: every conditional one is inside BannerPresence', () => {
  const bare = [...files('app'), ...files('components')]
    .filter((p) => !EXEMPT.has(p))
    .flatMap((p) => {
      const src = readFileSync(join(ROOT, p), 'utf8')
      return [...src.matchAll(BARE)].map((m) => `${p}:${src.slice(0, m.index).split('\n').length}`)
    })
  expect(bare).toEqual([])
})

it('the places the audit named go through it', () => {
  const src = (p: string) => readFileSync(join(ROOT, p), 'utf8')
  for (const p of ['app/sign-in.tsx', 'app/forgot-password.tsx', 'components/places/PlaceParts.tsx', 'components/profile/OfflineStrip.tsx']) {
    expect(src(p)).toContain('<BannerPresence')
  }
  // Sign-up's Name and Age leave as they came (M7), and the landing's error and notice fade in the Dock.
  expect(src('app/sign-in.tsx')).toMatch(/entering=\{reduceMotion \? undefined : FadeIn[^}]+\} exiting=\{reduceMotion \? undefined : FadeOut\.duration\(DURATION\.quick\)\} style=\{styles\.more\}/)
  expect(src('app/index.tsx').match(/entering=\{bannerFadeIn\} exiting=\{bannerOut\}/g)).toHaveLength(2)
})

it('the guard sees each shape', () => {
  for (const s of ['{e ? <Banner kind="error" />', '{e && (\n  <Banner', 'if (x) return <Banner', 'return (\n    <Banner']) {
    expect(s.match(BARE)).not.toBeNull()
  }
  expect('{e ? <BannerPresence>'.match(BARE)).toBeNull()
})

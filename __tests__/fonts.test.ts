/*
 * Every family the type scale names is a family the app actually loads.
 *
 * This is the one font failure that is silent. `fontFamily: 'Manrope_600Semibold'`
 * — lowercase b — does not throw, does not warn, and does not fall back to
 * Manrope. It falls back to the *system* font, which on a dark screen at a
 * glance reads as a slightly different weight rather than as a bug, and which
 * is exactly what a designer would flag three weeks later as "the labels look
 * wrong on Android".
 *
 * `lib/fonts.ts` is what `useFonts` is handed, so its keys are the registered
 * family names. Anything `TYPE` asks for that is not among them would
 * render in the system font at runtime.
 */

import { execFileSync } from 'child_process'
import fs from 'fs'
import path from 'path'

import { FONT_FAMILY, NUMERIC, TYPE as DESIGN_TYPE } from '../lib/design/tokens'
import { EMBER_FONT_MODULES } from '../lib/fonts'
import { EMBER_FONTS, TYPE } from '../lib/theme'

const loaded = new Set(Object.keys(EMBER_FONT_MODULES))
const ROOT = path.resolve(__dirname, '..')

/** Every style that names a family: today's scale, the redesign's roles and its numeric style. */
const STYLES: [string, { fontFamily: string }][] = [
  ...Object.entries(TYPE),
  ...Object.entries(DESIGN_TYPE).map(([k, v]): [string, { fontFamily: string }] => [`design.${k}`, v]),
  ['design.numeric', NUMERIC],
]

describe('Ember fonts', () => {
  it('loads every family the token layer names', () => {
    const named = [...Object.values(EMBER_FONTS), ...Object.values(FONT_FAMILY).flatMap((w) => Object.values(w))]
    for (const family of named) {
      expect([family, loaded.has(family)]).toEqual([family, true])
    }
  })

  it('loads every family the type scale uses', () => {
    // Via `TYPE` rather than `EMBER_FONTS`, because a style could name a
    // family string directly and bypass the constant.
    for (const [name, style] of STYLES) {
      expect([name, loaded.has(style.fontFamily)]).toEqual([name, true])
    }
  })

  it('loads nothing the type scale never asks for', () => {
    // A font in the bundle that no style uses is weight downloaded on every
    // cold start for nothing. Not a correctness bug — a size one.
    // `Set<string>` explicitly: `TYPE` is `as const`, so its family names
    // infer as a literal union and comparing them against plain strings is an
    // error rather than the lookup it reads as.
    const used = new Set<string>(STYLES.map(([, s]) => s.fontFamily))
    for (const family of loaded) {
      expect([family, used.has(family)]).toEqual([family, true])
    }
  })

  /*
   * Satoshi is under the ITF Free Font License: the app may embed it, but the
   * files may not be published, and this repository is public. They live in a
   * gitignored folder; this fails if one is ever added anyway (`git add -f`,
   * a renamed folder, a copy in assets/). `git ls-files` lists the index, so a
   * staged file fails too, before it is pushed.
   */
  it('never commits a Satoshi file', () => {
    const tracked = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' }).split('\n')
    expect(tracked.filter((f) => /(^|\/)satoshi[^/]*$/i.test(f) || /satoshi[^/]*\/[^/]+\.(otf|ttf|woff2?)$/i.test(f))).toEqual([])
  })

  /*
   * EAS uploads by `.easignore` instead of every `.gitignore` when it exists,
   * and it must: otherwise the gitignored Satoshi files never reach a build.
   * That makes it a second copy of all of them — the nested ones too (ios/:
   * Pods, build, .xcode.env.local; android/: local.properties, .cxx) — and a
   * rule added to one and not the other would upload what git keeps out
   * (`.env`, signing keys, build trees) to the build.
   */
  it('uploads to EAS everything git ignores, except Satoshi', () => {
    const rules = (file: string) =>
      fs.readFileSync(path.join(ROOT, file), 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))
    /** A nested rule as git applies it: anchored when it has an inner slash, at any depth below otherwise. */
    const scoped = (dir: string, rule: string) => {
      const negated = rule.startsWith('!')
      const pattern = negated ? rule.slice(1) : rule
      const inner = pattern.replace(/\/$/, '').includes('/')
      return `${negated ? '!' : ''}${dir}/${inner ? pattern.replace(/^\//, '') : `**/${pattern}`}`
    }
    const nested = execFileSync('git', ['ls-files', '*.gitignore'], { cwd: ROOT, encoding: 'utf8' })
      .split('\n')
      .filter((f) => f && f !== '.gitignore')
    const satoshi = '/assets/fonts/satoshi/'
    const wanted = [
      ...rules('.gitignore').filter((r) => r !== satoshi),
      ...nested.flatMap((f) => rules(f).map((r) => scoped(path.dirname(f), r))),
    ]
    expect(nested).toEqual(expect.arrayContaining(['ios/.gitignore', 'android/.gitignore']))
    expect(rules('.gitignore')).toContain(satoshi)
    expect(rules('.easignore')).not.toContain(satoshi)
    expect(wanted.filter((r) => !rules('.easignore').includes(r))).toEqual([])
  })

  /*
   * Jest maps every Satoshi .otf to a stub, so a typo in one of lib/fonts.ts's
   * four requires would pass here and fail only in Metro. Where the folder is
   * present (a developer's machine, a build machine), each required file must
   * be in it; CI has no folder and skips this.
   */
  it('requires Satoshi files that exist, wherever the folder does', () => {
    const required = [
      ...fs.readFileSync(path.join(ROOT, 'lib/fonts.ts'), 'utf8').matchAll(/require\('\.\.\/(assets\/fonts\/satoshi\/[^']+)'\)/g),
    ].map((m) => m[1])
    expect(required).toHaveLength(4)
    if (!fs.existsSync(path.join(ROOT, 'assets/fonts/satoshi'))) return
    expect(required.filter((rel) => !fs.existsSync(path.join(ROOT, rel)))).toEqual([])
  })
})

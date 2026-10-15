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
   * EAS uploads by `.easignore` instead of `.gitignore` when it exists, and it
   * must: otherwise the gitignored Satoshi files never reach a build. That makes
   * it a second copy of `.gitignore`, and a rule added to one and not the other
   * would upload what git keeps out (`.env`, signing keys) to the build.
   */
  it('uploads to EAS everything git ignores, except Satoshi', () => {
    const rules = (file: string) =>
      fs.readFileSync(path.join(ROOT, file), 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))
    const satoshi = '/assets/fonts/satoshi/'
    expect(rules('.gitignore')).toContain(satoshi)
    expect(rules('.easignore')).not.toContain(satoshi)
    expect(rules('.gitignore').filter((r) => r !== satoshi && !rules('.easignore').includes(r))).toEqual([])
  })
})

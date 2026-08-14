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
 * family names. Anything `EMBER_TYPE` asks for that is not among them would
 * render in the system font at runtime.
 */

import { EMBER_FONT_MODULES } from '../lib/fonts'
import { EMBER_FONTS, EMBER_TYPE } from '../lib/theme'

const loaded = new Set(Object.keys(EMBER_FONT_MODULES))

describe('Ember fonts', () => {
  it('loads every family the token layer names', () => {
    for (const family of Object.values(EMBER_FONTS)) {
      expect(loaded.has(family)).toBe(true)
    }
  })

  it('loads every family the type scale uses', () => {
    // Via `EMBER_TYPE` rather than `EMBER_FONTS`, because a style could name a
    // family string directly and bypass the constant.
    for (const [name, style] of Object.entries(EMBER_TYPE)) {
      expect([name, loaded.has(style.fontFamily)]).toEqual([name, true])
    }
  })

  it('loads nothing the type scale never asks for', () => {
    // A font in the bundle that no style uses is weight downloaded on every
    // cold start for nothing. Not a correctness bug — a size one.
    // `Set<string>` explicitly: `EMBER_TYPE` is `as const`, so its family names
    // infer as a literal union and comparing them against plain strings is an
    // error rather than the lookup it reads as.
    const used = new Set<string>(Object.values(EMBER_TYPE).map((s) => s.fontFamily))
    for (const family of loaded) {
      expect([family, used.has(family)]).toEqual([family, true])
    }
  })
})

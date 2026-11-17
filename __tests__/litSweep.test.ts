/*
 * A positive action is `lit`, never the white `strong` pill (foundations C, part 2), and since buttons board C (owner
 * 2026-11-17) `strong` is retired everywhere: no screen, sheet or fallback names it.
 * A white selection drawn by hand (`COLOR.selectionFill`) is pinned by `selectionColour.test.tsx`.
 * This pins it by source: a new white action fails here, and has to be argued for in the table below, with its reason, before it can land. The counts are exact, so a second `strong` in a file
 * that is allowed one fails too.
 *
 * The design gallery (`app/preview`) is not a screen and is not scanned.
 */
import fs from 'fs'
import path from 'path'

const ROOT = path.join(__dirname, '..')
const walk = (dir: string): string[] =>
  fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
    const rel = path.join(dir, entry.name)
    if (entry.isDirectory()) return rel === path.join('app', 'preview') ? [] : walk(rel)
    return /\.tsx?$/.test(entry.name) ? [rel] : []
  })

/**
 * A `'strong'` or `"strong"` literal: a `kind` being set or compared. Prose ("a strong action") is not one. A conditional
 * (`kind={cond ? 'strong' : 'lit'}`) and an object spread into the props (`{...{ kind: 'strong' }}`) still hold the literal,
 * so they are counted too; only a kind built at run time from other strings would pass, and nothing here does that.
 */
const STRONG = /['"]strong['"]/g

/**
 * File → how many literals it may hold, and why. Empty: `strong` is retired (buttons board C, owner 2026-11-17). A screen's
 * one way on is its `primary`, a sheet's yes is `lit`; the kind is gone from `ButtonKind`, so it cannot come back typed.
 */
const STRONG_STAYS: Record<string, { count: number; why: string }> = {}

const found = Object.fromEntries(
  [...walk('app'), ...walk('components'), ...walk('lib')]
    .map((file) => [file, (fs.readFileSync(path.join(ROOT, file), 'utf8').match(STRONG) ?? []).length] as const)
    .filter(([, count]) => count > 0)
)

describe('the white strong button', () => {
  it('is used only where there is no world, as the table below says, and nowhere else', () => {
    expect(found).toEqual(Object.fromEntries(Object.entries(STRONG_STAYS).map(([file, { count }]) => [file, count])))
  })

  it('every allowed file exists, so the table cannot outlive what it excuses', () => {
    for (const file of Object.keys(STRONG_STAYS)) expect(fs.existsSync(path.join(ROOT, file))).toBe(true)
  })
})


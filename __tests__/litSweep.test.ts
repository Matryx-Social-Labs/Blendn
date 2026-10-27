/*
 * Inside a world a positive action is `lit`, never the white `strong` pill (foundations C, part 2). `strong` stays only where
 * there is no world to light in: the system screens, which sit outside every screen's `HueProvider`, and the screen-reader
 * fallback of a control that mirrors another. The app-level sheet host is not one: its caller names a hue (`lib/sheet`).
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

/** File → how many literals it may hold, and why. */
const STRONG_STAYS: Record<string, { count: number; why: string }> = {
  'components/ds/Button.tsx': { count: 4, why: 'the kind itself: its type, its fill, its ink, its spinner' },
  'components/ds/Sheet.tsx': { count: 1, why: 'the fixed order of a sheet’s actions names every kind' },
  'components/system/AccountStateScreen.tsx': { count: 3, why: 'a suspended or signed-out account: a system screen with no world' },
  'app/+not-found.tsx': { count: 1, why: 'a system screen with no world' },
  'lib/linkRefusalCard.ts': { count: 2, why: 'the card a refused link lands on, before any screen has a world' },
  'components/ds/HoldToConfirm.tsx': { count: 1, why: 'its screen-reader fallback mirrors the hold’s own white ink' },
}

const found = Object.fromEntries(
  [...walk('app'), ...walk('components'), ...walk('lib')]
    .map((file) => [file, (fs.readFileSync(path.join(ROOT, file), 'utf8').match(STRONG) ?? []).length] as const)
    .filter(([, count]) => count > 0)
)

describe('the white strong button', () => {
  it('is used only where there is no world, as the table below says, and nowhere else', () => {
    expect(found).toEqual(Object.fromEntries(Object.entries(STRONG_STAYS).map(([file, { count }]) => [file, count])))
  })

  it.each(Object.entries(STRONG_STAYS))('%s says why it may', (_file, { why }) => {
    expect(why.length).toBeGreaterThan(10)
  })

  it('every allowed file exists, so the table cannot outlive what it excuses', () => {
    for (const file of Object.keys(STRONG_STAYS)) expect(fs.existsSync(path.join(ROOT, file))).toBe(true)
  })
})


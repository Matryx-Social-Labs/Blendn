/*
 * A function called inside a worklet runs on the UI runtime. If it is a plain JS function (no 'worklet' directive), a Release
 * build aborts the app the moment the worklet runs (2026-10-21: `barStateAt` in ProfileBar crashed Me and every profile on open).
 * Jest runs worklets on the JS thread, so no render test can see it; this scans the source instead.
 *
 * Covered: the bodies of useAnimatedStyle / useAnimatedProps / useDerivedValue / useAnimatedReaction / useAnimatedScrollHandler /
 * useFrameCallback, and gesture callbacks (.onBegin/.onStart/.onUpdate/.onChange/.onEnd/.onFinalize/.onTouches*). A callee counts
 * when it is a module-level function or arrow in app/, components/ or lib/ and no definition of that name is a worklet.
 * ponytail: a regex scan, not a type-aware one; a callee passed under another name escapes it.
 */
import fs from 'fs'
import path from 'path'

const ROOT = path.join(__dirname, '..')
const DIRS = ['app', 'components', 'lib']

const walk = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) return walk(p)
    return /\.(ts|tsx)$/.test(e.name) ? [p] : []
  })

const files = DIRS.flatMap((d) => walk(path.join(ROOT, d)))
const sources = new Map(files.map((f) => [f, fs.readFileSync(f, 'utf8')]))

// Module-level definitions only (column 0), so a helper defined inside a worklet never collides with one outside it.
const DEF = /^(?:export\s+)?(?:function\s+([A-Za-z_]\w*)\s*\(|const\s+([A-Za-z_]\w*)\s*=\s*(?:\([^)]*\)|[A-Za-z_]\w*)\s*(?::[^=\n]+)?=>)/gm
const defs = new Map<string, boolean[]>()
for (const [, src] of sources) {
  for (const m of src.matchAll(DEF)) {
    const name = m[1] ?? m[2]
    const head = src.slice(m.index! + m[0].length, m.index! + m[0].length + 120)
    const worklet = /^[^\n]*\{?\s*\n?\s*['"]worklet['"]/.test(head) || /^\s*\{\s*['"]worklet['"]/.test(head)
    defs.set(name, [...(defs.get(name) ?? []), worklet])
  }
}

const OPENERS = /(useAnimatedStyle|useAnimatedProps|useDerivedValue|useAnimatedReaction|useAnimatedScrollHandler|useFrameCallback|\.onBegin|\.onStart|\.onUpdate|\.onChange|\.onEnd|\.onFinalize|\.onTouchesDown|\.onTouchesMove|\.onTouchesUp)\(/g

const bodyFrom = (src: string, open: number) => {
  let depth = 1
  let i = open
  while (i < src.length && depth) {
    if (src[i] === '(') depth++
    else if (src[i] === ')') depth--
    i++
  }
  return src.slice(open, i)
}

it('every function a worklet calls is itself a worklet', () => {
  const offenders: string[] = []
  for (const [file, src] of sources) {
    for (const m of src.matchAll(OPENERS)) {
      const body = bodyFrom(src, m.index! + m[0].length)
      for (const call of new Set([...body.matchAll(/(?<![.\w])([a-z][A-Za-z0-9_]*)\(/g)].map((c) => c[1]))) {
        // Defined inside the worklet itself (a local helper): it is part of the worklet.
        if (new RegExp(`(?:const|let|function)\\s+${call}\\b`).test(body)) continue
        const known = defs.get(call)
        if (known && known.every((w) => !w)) offenders.push(`${path.relative(ROOT, file)}: ${m[1]} calls ${call}()`)
      }
    }
  }
  expect([...new Set(offenders)]).toEqual([])
})

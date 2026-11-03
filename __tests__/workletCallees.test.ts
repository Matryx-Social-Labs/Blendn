/*
 * A function called inside a worklet runs on the UI runtime. If it is a plain JS function (no 'worklet' directive), a Release
 * build aborts the app the moment the worklet runs (2026-10-21: `barStateAt` in ProfileBar crashed Me and every profile on open).
 * Jest runs worklets on the JS thread, so no render test can see it; this scans the source instead.
 *
 * Covered: the bodies of useAnimatedStyle / useAnimatedProps / useDerivedValue / useAnimatedReaction / useAnimatedScrollHandler /
 * useFrameCallback / Skia's useRSXformBuffer / scheduleOnUI / runOnUI, and gesture callbacks (.onBegin/.onStart/.onUpdate/.onChange/.onEnd/.onFinalize/
 * .onTouches*). A callee counts when it is a module-level function or arrow in app/, components/ or lib/ and no definition of
 * that name is a worklet. A callee that is a worklet is followed into, so a plain helper two calls down (the landing's
 * galaxies: useFrameCallback → advanceFilm → step → kick) is caught too.
 *
 * Second: a worklet that calls a worklet defined further down its own file. The worklets plugin turns each into a const
 * that captures its callees as it is defined, so the later one is not there yet ("setCamera is not a function").
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
/** Each module-level worklet's body (from its opening brace), its file and where it is defined, to follow its own calls. */
const workletBodies = new Map<string, { file: string; at: number; body: string }[]>()

/** From just after an opening bracket to its match. */
const bodyFrom = (src: string, from: number, open = '(', close = ')') => {
  let depth = 1
  let i = from
  while (i < src.length && depth) {
    if (src[i] === open) depth++
    else if (src[i] === close) depth--
    i++
  }
  return src.slice(from, i)
}

for (const [file, src] of sources) {
  for (const m of src.matchAll(DEF)) {
    const name = m[1] ?? m[2]
    const end = m.index! + m[0].length
    const head = src.slice(end, end + 120)
    // A function's parameters can run over several lines (lib/galaxySim's placeDisk): look past them, to the body.
    const afterParams = m[1] ? end + bodyFrom(src, end).length : end
    const opens = /^\s*(?::[^{=]*)?\{\s*['"]worklet['"]/.exec(src.slice(afterParams, afterParams + 200))
    const worklet = !!opens || /^[^\n]*\{?\s*\n?\s*['"]worklet['"]/.test(head) || /^\s*\{\s*['"]worklet['"]/.test(head)
    defs.set(name, [...(defs.get(name) ?? []), worklet])
    if (!worklet) continue
    const brace = opens ? src.indexOf('{', afterParams) : src.indexOf('{', end)
    workletBodies.set(name, [...(workletBodies.get(name) ?? []), { file, at: m.index!, body: bodyFrom(src, brace + 1, '{', '}') }])
  }
}

const OPENERS = /(useAnimatedStyle|useAnimatedProps|useDerivedValue|useAnimatedReaction|useAnimatedScrollHandler|useFrameCallback|useRSXformBuffer|scheduleOnUI|runOnUI|\.onBegin|\.onStart|\.onUpdate|\.onChange|\.onEnd|\.onFinalize|\.onTouchesDown|\.onTouchesMove|\.onTouchesUp)\(/g

/** The lower-case calls in a body that are not defined inside it. */
const callsIn = (body: string) =>
  [...new Set([...body.matchAll(/(?<![.\w])([a-z][A-Za-z0-9_]*)\(/g)].map((c) => c[1]))].filter(
    (call) => !new RegExp(`(?:const|let|function)\\s+${call}\\b`).test(body)
  )

it('every function a worklet calls is itself a worklet, all the way down', () => {
  const offenders: string[] = []
  for (const [file, src] of sources) {
    for (const m of src.matchAll(OPENERS)) {
      const seen = new Set<string>()
      const visit = (body: string, via: string) => {
        for (const call of callsIn(body)) {
          const known = defs.get(call)
          if (known && known.every((w) => !w)) offenders.push(`${path.relative(ROOT, file)}: ${via} calls ${call}()`)
          if (seen.has(call)) continue
          seen.add(call)
          for (const def of workletBodies.get(call) ?? []) visit(def.body, `${via} → ${call}`)
        }
      }
      visit(bodyFrom(src, m.index! + m[0].length), m[1])
    }
  }
  expect([...new Set(offenders)]).toEqual([])
})

it('no worklet calls a worklet defined further down its own file', () => {
  const offenders: string[] = []
  for (const [name, bodies] of workletBodies) {
    for (const { file, at, body } of bodies) {
      for (const call of callsIn(body)) {
        const later = (workletBodies.get(call) ?? []).find((d) => d.file === file && d.at > at)
        if (later) offenders.push(`${path.relative(ROOT, file)}: ${name} calls ${call}(), defined below it`)
      }
    }
  }
  expect(offenders).toEqual([])
})

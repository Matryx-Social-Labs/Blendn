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
 * Also (SCRUM-1001 M18): component-local helpers (in their own file), an animation's callback (withTiming / withSpring /
 * withDecay, never its arguments), a layout animation's `.withCallback`, and every 'worklet' function as a root of its own,
 * so a layout-animation builder that is passed and never called is read too.
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
const realSources = new Map(files.map((f) => [f, fs.readFileSync(f, 'utf8')]))

// Module-level definitions (column 0), shared across files by name.
const DEF = /^(?:export\s+)?(?:function\s+([A-Za-z_]\w*)\s*\(|const\s+([A-Za-z_]\w*)\s*=\s*(?:\([^)]*\)|[A-Za-z_]\w*)\s*(?::[^=\n]+)?=>)/gm
// Component-local definitions (indented), which count in their own file only (M18: these were not known at all).
const LOCAL_DEF = /^[ \t]+(?:function\s+([A-Za-z_]\w*)\s*\(|const\s+([A-Za-z_]\w*)\s*=\s*(?:\([^)]*\)|[A-Za-z_]\w*)\s*(?::[^=\n]+)?=>)/gm

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

type Body = { file: string; at: number; body: string }

/** Each definition's name, whether it is a worklet, and a worklet's body (from its opening brace). */
const definitionsIn = (src: string, pattern: RegExp) => {
  const found: { name: string; worklet: boolean; at: number; body?: string }[] = []
  for (const m of src.matchAll(pattern)) {
    const name = m[1] ?? m[2]
    const end = m.index! + m[0].length
    const head = src.slice(end, end + 120)
    // A function's parameters can run over several lines (lib/galaxySim's placeDisk): look past them, to the body.
    const afterParams = m[1] ? end + bodyFrom(src, end).length : end
    const opens = /^\s*(?::[^{=]*)?\{\s*['"]worklet['"]/.exec(src.slice(afterParams, afterParams + 200))
    const worklet = !!opens || /^[^\n]*\{?\s*\n?\s*['"]worklet['"]/.test(head) || /^\s*\{\s*['"]worklet['"]/.test(head)
    const brace = opens ? src.indexOf('{', afterParams) : src.indexOf('{', end)
    found.push({ name, worklet, at: m.index!, body: worklet ? bodyFrom(src, brace + 1, '{', '}') : undefined })
  }
  return found
}

const OPENERS = /(useAnimatedStyle|useAnimatedProps|useDerivedValue|useAnimatedReaction|useAnimatedScrollHandler|useFrameCallback|useRSXformBuffer|scheduleOnUI|runOnUI|\.onBegin|\.onStart|\.onUpdate|\.onChange|\.onEnd|\.onFinalize|\.onTouchesDown|\.onTouchesMove|\.onTouchesUp|\.withCallback)\(/g
// An animation's arguments are read where it is called; only its callback runs on the UI runtime (M18).
const ANIMATIONS = /\b(withTiming|withSpring|withDecay)\(/g
const CALLBACK = /(?:\([^()]*\)|\b[A-Za-z_]\w*)\s*=>\s*/g

/** The lower-case calls in a body that are not defined inside it. */
const callsIn = (body: string) =>
  [...new Set([...body.matchAll(/(?<![.\w])([a-z][A-Za-z0-9_]*)\(/g)].map((c) => c[1]))].filter(
    (call) => !new RegExp(`(?:const|let|function)\\s+${call}\\b`).test(body)
  )

/** Where a worklet starts in a file: the openers' bodies, animation callbacks, and every worklet function (a layout builder is passed, never called). */
const rootsIn = (src: string, localWorklets: Body[]) => {
  const roots: { body: string; via: string }[] = []
  for (const m of src.matchAll(OPENERS)) roots.push({ body: bodyFrom(src, m.index! + m[0].length), via: m[1] })
  for (const m of src.matchAll(ANIMATIONS)) {
    const args = bodyFrom(src, m.index! + m[0].length)
    for (const c of args.matchAll(CALLBACK)) roots.push({ body: args.slice(c.index! + c[0].length), via: `${m[1]} callback` })
  }
  for (const w of localWorklets) roots.push({ body: w.body, via: 'worklet' })
  return roots
}

/** Every plain function a worklet calls, followed through the worklets it calls. */
function plainCalleesOfWorklets(sources: Map<string, string>): string[] {
  const defs = new Map<string, boolean[]>()
  const workletBodies = new Map<string, Body[]>()
  const locals = new Map<string, Map<string, boolean[]>>()
  const fileWorklets = new Map<string, Body[]>()
  for (const [file, src] of sources) {
    const mine = new Map<string, boolean[]>()
    const ownWorklets: Body[] = []
    for (const d of definitionsIn(src, DEF)) {
      defs.set(d.name, [...(defs.get(d.name) ?? []), d.worklet])
      if (d.body !== undefined) {
        workletBodies.set(d.name, [...(workletBodies.get(d.name) ?? []), { file, at: d.at, body: d.body }])
        ownWorklets.push({ file, at: d.at, body: d.body })
      }
    }
    for (const d of definitionsIn(src, LOCAL_DEF)) {
      mine.set(d.name, [...(mine.get(d.name) ?? []), d.worklet])
      if (d.body !== undefined) ownWorklets.push({ file, at: d.at, body: d.body })
    }
    locals.set(file, mine)
    fileWorklets.set(file, ownWorklets)
  }

  const offenders: string[] = []
  for (const [file, src] of sources) {
    const mine = locals.get(file)!
    for (const root of rootsIn(src, fileWorklets.get(file)!)) {
      const seen = new Set<string>()
      const visit = (body: string, via: string) => {
        for (const call of callsIn(body)) {
          const known = [...(defs.get(call) ?? []), ...(mine.get(call) ?? [])]
          if (known.length && known.every((w) => !w)) offenders.push(`${path.relative(ROOT, file)}: ${via} calls ${call}()`)
          if (seen.has(call)) continue
          seen.add(call)
          for (const def of workletBodies.get(call) ?? []) visit(def.body, `${via} → ${call}`)
        }
      }
      visit(root.body, root.via)
    }
  }
  return [...new Set(offenders)]
}

/** A worklet that calls a worklet defined further down its own file. */
function workletsCallingLaterOnes(sources: Map<string, string>): string[] {
  const workletBodies = new Map<string, Body[]>()
  for (const [file, src] of sources) {
    for (const d of definitionsIn(src, DEF)) {
      if (d.body !== undefined) workletBodies.set(d.name, [...(workletBodies.get(d.name) ?? []), { file, at: d.at, body: d.body }])
    }
  }
  const offenders: string[] = []
  for (const [name, bodies] of workletBodies) {
    for (const { file, at, body } of bodies) {
      for (const call of callsIn(body)) {
        const later = (workletBodies.get(call) ?? []).find((d) => d.file === file && d.at > at)
        if (later) offenders.push(`${path.relative(ROOT, file)}: ${name} calls ${call}(), defined below it`)
      }
    }
  }
  return offenders
}

it('every function a worklet calls is itself a worklet, all the way down', () => {
  expect(plainCalleesOfWorklets(realSources)).toEqual([])
})

it('no worklet calls a worklet defined further down its own file', () => {
  expect(workletsCallingLaterOnes(realSources)).toEqual([])
})

/*
 * The blind spots the motion audit found (SCRUM-1001 M18), each planted once. Before M18 the scan saw none of them: it
 * knew column-0 definitions only, and opened neither an animation's callback nor a layout-animation builder.
 */
describe('the scan sees the places a worklet hides', () => {
  const at = (src: string) => plainCalleesOfWorklets(new Map([[path.join(ROOT, 'components/Planted.tsx'), src]]))

  it('a component-local helper called from a gesture', () => {
    const src = `export function Card() {\n  const nudge = (x: number) => x * 2\n  const pan = Gesture.Pan().onUpdate((e) => {\n    offset.set(nudge(e.translationX))\n  })\n}\n`
    expect(at(src)).toEqual(['components/Planted.tsx: .onUpdate calls nudge()'])
  })

  it('a plain function in an animation’s callback', () => {
    const src = `const settle = (v: number) => v\nexport function Card() {\n  open.set(withTiming(0, { duration: 200 }, (done) => {\n    if (done) settle(1)\n  }))\n}\n`
    expect(at(src)).toEqual(['components/Planted.tsx: withTiming callback calls settle()'])
  })

  it('a plain function an entering builder calls', () => {
    const src = `const lift = () => 8\nexport const riseIn = () => {\n  'worklet'\n  return { initialValues: { transform: [{ translateY: lift() }] }, animations: {} }\n}\n`
    expect(at(src)).toEqual(['components/Planted.tsx: worklet calls lift()'])
  })

  it('a plain function in a layout animation’s callback', () => {
    const src = `const report = () => null\nexport const out = FadeOut.withCallback((finished) => {\n  report()\n})\n`
    expect(at(src)).toEqual(['components/Planted.tsx: .withCallback calls report()'])
  })

  it('control: an animation’s arguments run where it is called, so a plain call there is fine', () => {
    const src = `const target = () => 1\nexport function Card() {\n  open.set(withTiming(target(), { duration: 200 }))\n}\n`
    expect(at(src)).toEqual([])
  })

  it('control: the same helpers marked as worklets pass', () => {
    const src = `export function Card() {\n  const nudge = (x: number) => {\n    'worklet'\n    return x * 2\n  }\n  const pan = Gesture.Pan().onUpdate((e) => {\n    offset.set(nudge(e.translationX))\n  })\n}\n`
    expect(at(src)).toEqual([])
  })
})

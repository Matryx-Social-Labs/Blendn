import React, { Profiler, type ReactNode } from 'react'

/**
 * What each screen actually costs to render.
 *
 * ## Why this exists
 *
 * Three perf changes shipped before this did, and every one was justified by
 * *reading* the code: a `force: true` on a mount path, a cache cleared on every
 * foreground, a `renderItem` rebuilding its props. All three were real. None of
 * them was measured, so none of them could answer the only question that
 * matters — **which one was the lag you could feel?**
 *
 * Reading finds candidates. It cannot rank them, and a ranked list is the whole
 * difference between fixing the slow thing and fixing three things that were
 * merely wrong.
 *
 * ## Why React's own Profiler and not a library
 *
 * `<Profiler>` is in React 19 already, so there is no dependency to add, no
 * native module to link, and nothing that can drift from the React version. It
 * reports `actualDuration` — the time React spent rendering that subtree for a
 * commit — which is exactly the number a "this screen feels slow" report is
 * about.
 *
 * What it does **not** measure, and neither does anything else at this layer:
 * native layout, image decode, or the JS↔native bridge. A screen that reads as
 * fast here and janky on device is telling you the cost is below React, which
 * is a genuinely useful answer rather than a gap.
 *
 * ## Dev only, and structurally so
 *
 * `<Profiler>` costs something to run. In production this returns its children
 * untouched, so there is no wrapper in the tree at all — not a wrapper that
 * checks a flag, which would still be a component.
 *
 * ## Reading the output
 *
 * Every commit slower than `SLOW_COMMIT_MS` logs immediately. Everything is
 * aggregated regardless, and `dumpPerf()` prints the table:
 *
 *     PERF pulse            commits=23  total=412ms  worst=88ms  mount=88ms
 *     PERF room             commits=7   total=96ms   worst=41ms  mount=41ms
 *
 * `commits` is the one people skip and should not: a screen with a small worst
 * case and a hundred commits is re-rendering on something it should not be
 * watching, and that is the shape that reads as lag rather than as a wait.
 */

/**
 * A commit worth a line in the log.
 *
 * 16ms is one frame at 60Hz, and anything at or over it has definitely dropped
 * one. The threshold is deliberately not tunable per screen: a slow commit is
 * slow wherever it happens, and a per-screen dial would be used to silence the
 * screens that need the attention.
 */
export const SLOW_COMMIT_MS = 16

interface Stat {
  commits: number
  total: number
  worst: number
  mount: number
}

const stats = new Map<string, Stat>()

/**
 * Wrap a screen. `id` is what appears in the log, so keep it short and stable.
 *
 * ```tsx
 * export default function Pulse() {
 *   return <ScreenProfiler id="pulse"><PulseInner /></ScreenProfiler>
 * }
 * ```
 */
export function ScreenProfiler({ id, children }: { id: string; children: ReactNode }) {
  if (!__DEV__) return <>{children}</>

  return (
    <Profiler
      id={id}
      onRender={(_id, phase, actualDuration) => {
        const s = stats.get(id) ?? { commits: 0, total: 0, worst: 0, mount: 0 }
        s.commits += 1
        s.total += actualDuration
        s.worst = Math.max(s.worst, actualDuration)
        if (phase === 'mount') s.mount = actualDuration
        stats.set(id, s)

        if (actualDuration >= SLOW_COMMIT_MS) {
          // eslint-disable-next-line no-console
          console.log(
            `PERF-SLOW ${id} ${phase} ${actualDuration.toFixed(1)}ms (frame budget ${SLOW_COMMIT_MS}ms)`
          )
        }
      }}
    >
      {children}
    </Profiler>
  )
}

/** Everything measured so far, worst total first. */
export function perfSnapshot(): Array<{ id: string } & Stat> {
  return [...stats.entries()]
    .map(([id, s]) => ({ id, ...s }))
    .sort((a, b) => b.total - a.total)
}

/**
 * Print the table.
 *
 * Called from a dev-only trigger rather than on a timer: a timer would itself
 * be a thing waking the JS thread up, which is the category of problem being
 * measured.
 */
export function dumpPerf(): void {
  if (!__DEV__) return
  const rows = perfSnapshot()
  if (rows.length === 0) {
    // eslint-disable-next-line no-console
    console.log('PERF (nothing measured yet)')
    return
  }
  for (const r of rows) {
    // eslint-disable-next-line no-console
    console.log(
      `PERF ${r.id.padEnd(18)} commits=${String(r.commits).padEnd(4)} ` +
        `total=${r.total.toFixed(0)}ms  worst=${r.worst.toFixed(0)}ms  mount=${r.mount.toFixed(0)}ms`
    )
  }
}

/** Start again — between two runs of the same flow, so they can be compared. */
export function resetPerf(): void {
  stats.clear()
}

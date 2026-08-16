import { readFileSync, readdirSync, statSync } from 'fs'
import { join, basename } from 'path'

/**
 * Every component reaches a real screen.
 *
 * ## Why this exists
 *
 * Five times in this codebase something was built, reviewed, merged — and never
 * called:
 *
 *   `renderFeaturedRow`   the frame-accurate Featured row, no caller, while six
 *                         older sections that were not in any frame still ran
 *   `likeAtEvent`         the like API with a queue and three retries, no caller
 *   `handleCheckOut`      optimistic, rolled back, deduped, no caller
 *   `RoomVisibilityBanner` one of three safeguards making named rooms safe at
 *                         all, rendered nowhere
 *   `components/scene/*`  the entire Scene rebuild, reachable only from the
 *                         dev-only preview harness while `/event/[id]` kept
 *                         rendering the old screen
 *
 * The last one is the reason this file exists. It is invisible to every other
 * check: the code compiles, the tests pass, the harness screenshot looks right,
 * and the app ships the old screen. Someone opened the preview, saw the new
 * design, and reasonably concluded it had shipped.
 *
 * ## What counts as reachable
 *
 * An importer that is **not** the preview harness. `app/preview/` is dev-only
 * and allow-listed behind `__DEV__` in `app/_layout.tsx`, so being imported
 * there is exactly the state this test is looking for, not a defence against it.
 */

const ROOT = join(__dirname, '..')

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (entry.endsWith('.tsx') || entry.endsWith('.ts')) out.push(full)
  }
  return out
}

/**
 * Components that are knowingly unreachable, and why.
 *
 * **An entry here is a debt, not a dispensation.** It says "this is built and
 * not wired, and somebody decided that on purpose today" — which is the state
 * the Scene was in for a week while nobody knew.
 */
const KNOWN_ORPHANS: Record<string, string> = {
  /*
   * Empty, and that is the point.
   *
   * It held the three Scene files while the event route still rendered
   * the old screen. The render swap closed that, so the entries went with it —
   * which is the lifecycle an entry here is supposed to have.
   */
}

const sources = walk(join(ROOT, 'app'))
  .concat(walk(join(ROOT, 'components')))
  .concat(walk(join(ROOT, 'lib')))

const nonPreview = sources.filter((f) => !f.includes(`${'app'}/preview/`))

const componentFiles = walk(join(ROOT, 'components')).filter((f) => f.endsWith('.tsx'))

describe('no component is reachable only from the preview harness', () => {
  it.each(componentFiles.map((f) => [f.replace(`${ROOT}/`, ''), f]))(
    '%s reaches a real screen',
    (rel, full) => {
      const name = basename(full, '.tsx')
      const importers = nonPreview.filter(
        (f) => f !== full && new RegExp(`['"][^'"]*/${name}['"]`).test(readFileSync(f, 'utf8'))
      )

      if (importers.length > 0) return

      const reason = KNOWN_ORPHANS[basename(full)]
      if (reason) {
        // Recorded debt. The message is the ledger entry, so a reader who hits
        // this sees the decision rather than an unexplained allowance.
        expect(reason.length).toBeGreaterThan(20)
        return
      }

      throw new Error(
        `${rel} has no importer outside app/preview/.\n\n` +
          `Either wire it to a real screen, delete it, or add it to KNOWN_ORPHANS ` +
          `with the reason and the plan. A component reachable only from the ` +
          `harness ships as a design nobody sees.`
      )
    }
  )
})

describe('the orphan ledger stays honest', () => {
  it('lists nothing that is actually wired', () => {
    /*
     * An entry that has quietly become reachable is worse than no entry: it
     * reads as "still not wired" to anybody skimming, so the real work looks
     * undone and gets done twice.
     */
    for (const file of Object.keys(KNOWN_ORPHANS)) {
      const name = basename(file, '.tsx')
      const importers = nonPreview.filter(
        (f) =>
          !f.endsWith(`/${file}`) &&
          new RegExp(`['"][^'"]*/${name}['"]`).test(readFileSync(f, 'utf8'))
      )
      expect({ file, importers: importers.map((f) => f.replace(`${ROOT}/`, '')) }).toEqual({
        file,
        importers: [],
      })
    }
  })

  it('names a file that exists', () => {
    // A stale entry silently disables the check for a name nothing matches.
    const present = new Set(componentFiles.map((f) => basename(f)))
    for (const file of Object.keys(KNOWN_ORPHANS)) expect(present.has(file)).toBe(true)
  })
})

import { readFileSync } from 'fs'
import { join } from 'path'

/*
 * SCRUM-480 was SCRUM-286 coming back. The fix lived in a component, and the
 * screens stopped using it: the Going rows moved to a card whose thumb drew
 * nothing when a cover was missing. `upcomingCardCover.test.tsx` guards the
 * card; this guards the screens, so a row cannot quietly stop going through
 * it, or stop retrying on a pull, again.
 */
const read = (...p: string[]) => readFileSync(join(__dirname, '..', ...p), 'utf8')

const SCREENS: Array<{ file: string[]; counter: string; bump: RegExp }> = [
  { file: ['app', '(tabs)', 'going.tsx'], counter: 'refreshCount', bump: /setRefreshCount\(/ },
  { file: ['app', '(tabs)', 'events.tsx'], counter: 'pulls', bump: /setPulls\(\(n\) => n \+ 1\)/ },
]

/** Every `<UpcomingCard …>` opening element, props included. */
const cards = (src: string) => src.match(/<UpcomingCard\b[\s\S]*?\n\s*\/?>/g) ?? []

/** Index of the `)` that closes the `(` at `open`. */
function closing(src: string, open: number): number {
  for (let i = open, depth = 0; i < src.length; i++) {
    if (src[i] === '(') depth++
    else if (src[i] === ')' && --depth === 0) return i
  }
  return -1
}

/** The deps of the useCallback that encloses `at`, or null when none does. */
function enclosingDeps(src: string, at: number): string | null {
  for (let open = src.lastIndexOf('useCallback(', at); open !== -1; open = src.lastIndexOf('useCallback(', open - 1)) {
    const paren = open + 'useCallback'.length
    const end = closing(src, paren)
    if (end > at) return src.slice(src.lastIndexOf('[', end) + 1, src.lastIndexOf(']', end))
    if (open === 0) break
  }
  return null
}

describe.each(SCREENS)('$file.2', ({ file, counter, bump }) => {
  const src = read(...file)

  it('draws each event row through UpcomingCard, with the row cover and the refresh count', () => {
    const found = cards(src)
    expect(found.length).toBeGreaterThan(0)
    for (const card of found) {
      expect(card).toMatch(/imageUrl=\{\w+\.cover_image_url\}/)
      expect(card).toContain(`retry={${counter}}`)
    }
  })

  it('bumps the count on a pull-to-refresh', () => {
    expect(src).toMatch(bump)
  })

  it('lists the count in every callback that hands it to a row', () => {
    const stale: number[] = []
    let enclosed = 0
    for (let at = src.indexOf(`retry={${counter}}`); at !== -1; at = src.indexOf(`retry={${counter}}`, at + 1)) {
      const deps = enclosingDeps(src, at)
      if (deps === null) continue
      enclosed++
      if (!deps.split(',').map((d) => d.trim()).includes(counter)) stale.push(at)
    }
    // Both screens hand it to a row from inside a memoised renderer.
    expect(enclosed).toBeGreaterThan(0)
    // A stale closure keeps retry at its first value: the pull never retries.
    expect(stale).toEqual([])
  })
})

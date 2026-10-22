import { readFileSync } from 'fs'
import { join } from 'path'

/*
 * SCRUM-480 was SCRUM-286 coming back. The fix lived in a component, and the
 * screens stopped using it: the Going rows moved to a card whose thumb drew
 * nothing when a cover was missing. `upcomingCardCover.test.tsx` guards the
 * Going's card; this guards the screens, so a row cannot quietly stop going through
 * it, or stop retrying on a pull, again.
 */
const read = (...p: string[]) => readFileSync(join(__dirname, '..', ...p), 'utf8')

const SCREENS: Array<{ file: string[]; counter: string; bump: RegExp }> = [
  { file: ['app', '(tabs)', 'going.tsx'], counter: 'refreshCount', bump: /setRefreshCount\(/ },
]

/** Every row's opening element, props included: `<GoingRow …>` (the ds EventCard row) on Going. */
const cards = (src: string) => src.match(/<GoingRow\b[\s\S]*?\n\s*\/?>/g) ?? []

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

  it('draws each event row with the row cover and the refresh count', () => {
    const found = cards(src)
    expect(found.length).toBeGreaterThan(0)
    for (const card of found) {
      // A visit to a place (Going › Past) is the place's type art, not an event's cover.
      if (card.includes('plate=')) expect(card).not.toMatch(/\bcover=/)
      else expect(card).toMatch(/(?:imageUrl|cover)=\{\w+\.cover_image_url\}/)
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

describe('the Pulse', () => {
  const src = read('app', '(tabs)', 'events.tsx')
  it('draws every row through the DS EventCard (its thumb is the quiet square when a cover is missing or fails)', () => {
    expect(src).not.toContain('UpcomingCard')
    // Search results and Nearby-style rows are the EventCard itself; Everything else is `MoreRow`, which wraps it.
    expect(src).toMatch(/<EventCard\b/)
    expect(src).toMatch(/<MoreRow\b/)
    expect(read('components', 'pulse', 'MoreRow.tsx')).toMatch(/<EventCard\b/)
  })
  it('bumps the pull count on a refresh, which re-asks the sections', () => {
    expect(src).toMatch(/setPulls\(\(n\) => n \+ 1\)/)
    expect(src).toMatch(/sectionsKey = `[^`]*\$\{pulls\}`/)
  })
})

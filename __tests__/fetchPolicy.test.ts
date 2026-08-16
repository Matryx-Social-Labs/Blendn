import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'

/**
 * `force` means a human asked, and nothing else.
 *
 * ## The report this came from
 *
 * "I open the Blend'n button when checked in and wait a few seconds for the
 * matchmaking list; minimise and open it again and it takes a few seconds
 * again."
 *
 * Traced: opening `/room` fired two **sequential forced** round trips —
 * `getActiveCheckins` then `getEventMatches` — and blocked the whole screen on
 * them, because `attendees.length === 0` on a fresh mount. Both endpoints
 * already had SWR caches (`CHECKINS_SWR_TTL`, and 30s on matches, both
 * `swr: true`). The room asked for neither.
 *
 * The infrastructure was never the problem. `queuedRequest` even deduplicates
 * concurrent identical GETs by key, so the two callers of `getActiveCheckins`
 * collapse into one request. The call sites simply refused the cache.
 *
 * ## The rule
 *
 *   mount            read the cache, revalidate behind the paint
 *   focus / sync     same — `swr: true` refreshes in the background already
 *   pull to refresh  force. A human asked.
 *   retry button     force. A human asked, and the last answer was an error.
 *   load more        force. It is a different query, not a re-read.
 *   presence         force. Correctness, not freshness — see PresenceMonitor.
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

const files = walk(join(ROOT, 'app'))
  .concat(walk(join(ROOT, 'components')))
  .filter((f) => !f.includes('/preview/'))

const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

/**
 * Every `force: true` still in the app, with why it is allowed.
 *
 * An entry is a claim that a human asked for this fetch. Adding one without
 * that being true is how the bug comes back.
 */
const ALLOWED: Record<string, string> = {
  'app/(tabs)/events.tsx': 'pull-to-refresh and two retry buttons — all user intent',
  'components/PresenceMonitor.tsx':
    'presence is correctness, not freshness: a stale check-in decides whether ' +
    'somebody is shown as in the room',
  'components/screens/MatchScreen.tsx':
    'load-more raises the limit, which is a different query rather than a ' +
    're-read of the same one',
}

describe('force is user intent, never a mount', () => {
  it.each(Object.keys(ALLOWED))('%s documents why it forces', (rel) => {
    const src = stripComments(readFileSync(join(ROOT, rel), 'utf8'))
    expect(src).toContain('force: true')
    expect(ALLOWED[rel].length).toBeGreaterThan(20)
  })

  it('no other file forces at all', () => {
    const offenders = files
      .filter((f) => stripComments(readFileSync(f, 'utf8')).includes('force: true'))
      .map((f) => f.replace(`${ROOT}/`, ''))
      .filter((rel) => !(rel in ALLOWED))

    expect(offenders).toEqual([])
  })

  it('the room reads its cache on mount', () => {
    /*
     * The two calls the report was actually about. Both are on a mount path and
     * both have a live SWR cache behind them.
     */
    const room = stripComments(readFileSync(join(ROOT, 'app/room.tsx'), 'utf8'))
    expect(room).toContain('.getActiveCheckins()')
    expect(room).not.toContain('getActiveCheckins({ force')

    const match = stripComments(
      readFileSync(join(ROOT, 'components/screens/MatchScreen.tsx'), 'utf8')
    )
    expect(match).toContain('await loadActiveEventAndAttendees(authUser.id)')
  })

  it('keeps pull-to-refresh forcing, because that IS the ask', () => {
    // The other half of the rule. A refresh gesture that returned cache would
    // be a control that does nothing, which is worse than a slow one.
    const match = stripComments(
      readFileSync(join(ROOT, 'components/screens/MatchScreen.tsx'), 'utf8')
    )
    const pull = match.slice(match.indexOf('const onPullToRefresh'))
    expect(pull.slice(0, 400)).toContain('loadActiveEventAndAttendees(authUser.id, true)')
  })
})

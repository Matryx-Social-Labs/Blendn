import { readFileSync } from "fs"
import { join } from "path"

/**
 * Three costs that came from state outliving, or escaping, its scope.
 *
 * Structural, because all three are properties of *shape* — a dependency array,
 * a missing bound, a missing call — and a behavioural test of any one of them
 * would pass against the broken version.
 */

const ROOT = join(__dirname, "..")

const code = (rel: string) =>
  readFileSync(join(ROOT, rel), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "")

describe("the Pulse handlers keep their identity", () => {
  /*
   * Every action handler listed the volatile maps in its deps, because each
   * reads them to snapshot a previous value before an optimistic update. So
   * `onCheckIn` and `onToggleInterest` were new objects whenever any map
   * changed — and they are props on every card in the list, which defeats
   * `EventCard`'s `memo` on all of them at once. One person checking in
   * re-rendered every mounted card. Measured at 27 commits / 257ms per visit.
   *
   * The distinction: those maps are inputs to a *decision* taken on a tap, not
   * inputs to a render.
   */
  const src = code("app/(tabs)/events.tsx")

  it("reads the volatile maps through refs inside handlers", () => {
    for (const ref of [
      "latestCheckinStatuses",
      "latestCheckedInEvents",
      "latestProximityData",
      "latestInterestStatuses",
      "latestInterestCounts",
    ]) {
      expect(src).toContain(`const ${ref} = useLatest(`)
      expect(src).toContain(`${ref}.current`)
    }
  })

  it("keeps the maps out of every handler dependency array", () => {
    /*
     * The actual guard. A `useLatest` call that nobody's deps benefit from is
     * decoration, and re-adding a map to one array silently restores the bug.
     */
    const VOLATILE = [
      "checkinStatuses",
      "checkedInEvents",
      "proximityData",
      "interestStatuses",
      "interestCounts",
    ]
    /*
     * Handlers only. `renderEventItem` is the deliberate exception below: there
     * the maps ARE the render input, and stabilising it too would fix the
     * re-render count by never re-rendering.
     */
    const HANDLERS = [
      "handleEventPress",
      "handleCheckIn",
      "handleCheckOut",
      "toggleInterest",
      "handleEventPreview",
    ]
    const depArrays = HANDLERS.map((name) => {
      const start = src.indexOf(`const ${name} = useCallback(`)
      expect(start).toBeGreaterThan(-1)
      const close = /\n {2}\}, \[([^\]]*)\]\)/.exec(src.slice(start))
      expect(close).not.toBeNull()
      return close![1]
    })
    expect(depArrays).toHaveLength(HANDLERS.length)

    for (const deps of depArrays) {
      const named = deps.split(",").map((d) => d.trim())
      for (const volatile of VOLATILE) {
        expect(named).not.toContain(volatile)
      }
    }
  })

  it("still lets renderEventItem see them, because there they are render inputs", () => {
    /*
     * The maps must stay in `renderEventItem`'s deps. That is what makes a card
     * actually update when somebody checks in — stabilising it too would fix
     * the re-render count by never re-rendering.
     */
    expect(src).toMatch(
      /\}, \[checkinStatuses, proximityData, interestStatuses, interestCounts,/
    )
  })
})

describe("the response cache is bounded and does not outlive the session", () => {
  const src = code("lib/apiClient.ts")

  it("has a ceiling and an eviction pass", () => {
    /*
     * It had neither. An expired entry is *served* as stale-while-revalidate
     * rather than deleted, so nothing ever removed anything and the map grew
     * for the lifetime of the process — one full response body per distinct
     * request key, and the keys include query strings.
     *
     * `lib/queryCache.ts`, in the same directory, has had a bound and an
     * eviction pass since it was written.
     */
    expect(src).toMatch(/MAX_CACHED_RESPONSES = 500/)
    expect(src).toMatch(/private evictExpiredOrOldest\(\)/)
    expect(src).toMatch(/if \(this\.responseCache\.size >= this\.MAX_CACHED_RESPONSES\)/)
  })

  it("is emptied on sign-out", () => {
    /*
     * `clearResponseCache` had no callers, so after signing out the map still
     * held the previous user's conversations, matches and profile in memory,
     * keyed by endpoint. The next person to use the device hits the same
     * endpoint and `getCached` returns it. The TTL is not a defence: an expired
     * entry is returned first and corrected afterwards.
     */
    const signOut = /async signOut\([\s\S]*?\n  \}/.exec(src)
    expect(signOut).not.toBeNull()
    expect(signOut![0]).toContain("this.clearResponseCache()")
  })
})

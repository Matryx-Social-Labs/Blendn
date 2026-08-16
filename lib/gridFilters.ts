/**
 * Narrowing the room — profession, and how much you have in common.
 *
 * ## Why this is client-side, and why that is not a preference
 *
 * `workField` is **null in rooms below 8 people** (`MIN_ROOM_FOR_WORK_FIELD` on
 * the server), because four attributes name one person:
 *
 * > "29, Bengaluru, works in fintech, into techno and board games" is one
 * > specific person in a room of eight — the pseudonym stops doing anything at
 * > all.
 *
 * A server-side filter would defeat that. `?workField=fintech` makes the server
 * filter on the **real column** while the response still suppresses it, so
 * narrowing to a single result tells you a suppressed attribute by elimination —
 * the feature meant to use the data would be the thing that leaks it.
 *
 * Filtering the payload the client already holds is safe by construction: in a
 * small room every `workField` is null, so the control has nothing to offer and
 * shows nothing. Same answer, no leak.
 *
 * ## Profession only
 *
 * There was a "2+ shared" interest filter here too. It is gone: the roster is
 * already *ranked* by compatibility with shared interests in the score, so
 * filtering on them narrows a list that is already sorted by them — and the
 * overlap is shown on every card that has one, which is what somebody actually
 * wants from it. Filtering by profession is the one cut the ranking does not
 * already make for you.
 *
 * "All" is an explicit chip rather than the absence of a selection, because a
 * filter row whose off-state is "nothing looks pressed" gives you no way to see
 * that you are unfiltered, and no obvious way back.
 */

export interface GridFilterable {
  workField?: string | null
}

export interface GridFilters {
  /** Empty means everyone — the "All" chip — never "match nothing". */
  workFields: readonly string[]
}

export const NO_GRID_FILTERS: GridFilters = { workFields: [] }

/**
 * The professions worth offering, from the people actually in this room.
 *
 * Not the whole `WORK_FIELDS` vocabulary: a filter listing twenty professions
 * when eleven are present is a menu of dead ends, and picking one to find an
 * empty room teaches you to stop using the control.
 *
 * Sorted by how many people share it, then alphabetically — the useful ones
 * first, and stable when counts tie so the chips do not reshuffle on a refresh.
 */
export function availableWorkFields(people: readonly GridFilterable[]): string[] {
  const counts = new Map<string, number>()
  for (const p of people) {
    const f = p.workField?.trim()
    if (f) counts.set(f, (counts.get(f) ?? 0) + 1)
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([field]) => field)
}

/**
 * Apply both filters.
 *
 * Order is preserved: `rankMatches` ranked this list and narrowing it must not
 * re-rank it. Filtering is "show fewer", never "show different".
 */
export function applyGridFilters<T extends GridFilterable>(
  people: readonly T[],
  filters: GridFilters
): T[] {
  const wanted = new Set(filters.workFields)

  return people.filter((p) => {
    /*
     * An empty selection matches everyone. The alternative -- treating "nothing
     * ticked" as "nothing matches" -- empties the screen the instant somebody
     * unticks their last chip, which reads as the room emptying rather than as
     * a filter clearing.
     */
    if (wanted.size > 0) {
      const f = p.workField?.trim()
      /*
       * Somebody whose profession is suppressed is not excluded by a profession
       * filter *matching* them; they simply are not in a set they cannot be
       * known to belong to. Worth stating because the opposite -- keeping
       * unknowns in every result -- would let you infer suppressed values by
       * watching who never disappears.
       */
      if (!f || !wanted.has(f)) return false
    }

    return true
  })
}

/** Whether anything is narrowing the list, for the "clear" affordance. */
export function hasActiveFilters(filters: GridFilters): boolean {
  return filters.workFields.length > 0
}

/**
 * What to say when the filters have emptied the room.
 *
 * Distinct from an empty room, which is a different situation with a different
 * fix: one is "nobody is here", the other is "nobody here matches", and telling
 * somebody the room is empty when they filtered it themselves is the kind of
 * small lie that makes people stop trusting a screen.
 */
export function emptyReason(
  totalInRoom: number,
  shown: number,
  filters: GridFilters
): 'room-empty' | 'filtered-out' | null {
  if (shown > 0) return null
  if (totalInRoom === 0) return 'room-empty'
  return hasActiveFilters(filters) ? 'filtered-out' : 'room-empty'
}

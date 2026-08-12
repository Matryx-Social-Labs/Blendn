/**
 * The category tree, and turning it into something a person can tick.
 *
 * `GET /categories` returns a **tree**: top-level rows with `parent_id: null`
 * and a `children` array under each. The interests screen rendered the top
 * level directly, which meant it showed only groupings — "Music", "Sports" —
 * and every leaf, which is what `user_interests` actually stores and what
 * matching ranks on, was unreachable. `user_interests` was empty across every
 * account for weeks as a direct result.
 *
 * Moved out of `app/onboarding/interests.tsx` so it can be tested without
 * rendering a screen, and because three screens are about to need it: the
 * onboarding picker is being retired, the about-you screen replaces it, and
 * edit-profile still writes free text to the column
 * `lib/interest-coverage.ts` exists to warn about.
 */

export type Category = { id: string; name: string; icon?: string | null }

/** One tier of the tree as the endpoint sends it. */
export type CategoryNode = {
  id: unknown
  name: unknown
  icon?: unknown
  children?: { id: unknown; name: unknown; icon?: unknown }[]
}

/** A heading and the leaves under it. The heading is not selectable. */
export type CategoryGroup = { id: string; name: string; items: Category[] }

/**
 * Tree → groups of selectable leaves.
 *
 * Replaces `flattenToLeaves`, which threw the 13 parents away and rendered 67
 * chips in one undifferentiated wall. The parents come back as **headings**,
 * not options: a group is somewhere to look, and what gets stored is still a
 * leaf.
 *
 * Parents are deliberately not selectable. Making them so would need a
 * three-state control (unchecked / some children / explicitly held), a way to
 * distinguish an explicit "Music" from one implied by holding "Techno", and a
 * save path that diffs both levels — all to express "I like music generally",
 * which nobody has asked for. The ranking gets the parent anyway: `matches.ts`
 * expands a stored leaf up to its parent, so two people into different genres
 * still meet at Music.
 *
 * A parent with no children contributes **itself** as a lone selectable item
 * rather than vanishing. Dropping it would silently remove a whole branch from
 * the picker, and a coarse interest beats a missing one.
 *
 * Everything is coerced through `String` because this is parsing a network
 * response, not reading a local constant — an id that arrives as a number would
 * otherwise be compared against a string id and never match.
 */
export function toPickerTree(nodes: CategoryNode[]): CategoryGroup[] {
  const out: CategoryGroup[] = []
  for (const node of nodes) {
    if (node.id == null) continue
    const children = Array.isArray(node.children) ? node.children : []
    const items: Category[] =
      children.length > 0
        ? children
            .filter((child) => child?.id != null)
            .map((child) => ({
              id: String(child.id),
              name: String(child.name),
              icon: (child.icon as string | null) ?? null,
            }))
        : // Childless parent: it *is* the option, so the group holds itself.
          [
            {
              id: String(node.id),
              name: String(node.name),
              icon: (node.icon as string | null) ?? null,
            },
          ]

    out.push({ id: String(node.id), name: String(node.name), items })
  }
  return out
}

/** Every selectable leaf, order preserved. For counting and lookup. */
export function pickableItems(groups: CategoryGroup[]): Category[] {
  return groups.flatMap((g) => g.items)
}

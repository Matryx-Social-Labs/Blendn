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

/**
 * Tree → selectable leaves.
 *
 * A parent with no children contributes **itself** rather than vanishing:
 * dropping it would silently remove a whole branch of the taxonomy from the
 * picker, and a coarse interest beats a missing one.
 *
 * Everything is coerced through `String` because this is parsing a network
 * response, not reading a local constant — an id that arrives as a number would
 * otherwise be compared against a string id and never match.
 */
export function flattenToLeaves(nodes: CategoryNode[]): Category[] {
  const out: Category[] = []
  for (const node of nodes) {
    const children = Array.isArray(node.children) ? node.children : []
    if (children.length > 0) {
      for (const child of children) {
        out.push({
          id: String(child.id),
          name: String(child.name),
          icon: (child.icon as string | null) ?? null,
        })
      }
    } else if (node.id != null) {
      out.push({
        id: String(node.id),
        name: String(node.name),
        icon: (node.icon as string | null) ?? null,
      })
    }
  }
  return out
}

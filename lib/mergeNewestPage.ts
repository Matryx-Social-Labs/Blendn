/**
 * A refresh's newest page, laid over what a chat screen already holds.
 *
 * Putting the page in place of the list dropped every older page the reader
 * had loaded, so each sync — an incoming message, your own send's echo, the
 * reconnect after the background — shrank the list under them and the view
 * jumped (driven on build 121, 2026-09-28).
 *
 * `held` and `page` are oldest first. What is above the page's oldest message
 * stays; the page's own copies win, since ticks and edits change; a send only
 * this phone holds stays at the bottom. When the page does not reach what is
 * held — more than a page arrived in between — there is a gap nobody loaded,
 * and the page replaces the list as it always did: `keptOlder` is false and the
 * caller's older-page cursor must move to the page's.
 *
 * ponytail: callers judge `keptOlder` on the list as last rendered, and build
 * the list from the latest state. Two refreshes landing before a render can
 * move the cursor into history already on screen; the older-page loaders dedupe
 * and walk back from there, so the cost is a re-fetch, not lost history. Keep
 * the cursor in the same state as the list if that ever shows up.
 */
export function mergeNewestPage<T>(
  held: readonly T[],
  page: readonly T[],
  idOf: (item: T) => string,
  isLocal: (item: T) => boolean
): { items: T[]; keptOlder: boolean } {
  const onPage = new Set(page.map(idOf))
  const local = held.filter((item) => isLocal(item) && !onPage.has(idOf(item)))
  const joint = page.length > 0 ? held.findIndex((item) => idOf(item) === idOf(page[0])) : -1
  const older = joint > 0 ? held.slice(0, joint).filter((item) => !isLocal(item)) : []
  return { items: [...older, ...page, ...local], keptOlder: older.length > 0 }
}

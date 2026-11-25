/**
 * A socket message put in its place by (createdAt, id), the order the history reads in.
 *
 * The server emits a chat message only once moderation has passed it (0.3–1 s, varying), so a quick second message
 * can arrive before a slow first one; appending showed it above. The scan runs back from the newest, where nearly
 * every arrival belongs. `list` is oldest first and stays untouched.
 */
export function insertInOrder<T>(list: readonly T[], item: T, timeOf: (x: T) => number, idOf: (x: T) => string): T[] {
  const after = (x: T) => timeOf(x) > timeOf(item) || (timeOf(x) === timeOf(item) && idOf(x) > idOf(item))
  let at = list.length
  while (at > 0 && after(list[at - 1])) at--
  return [...list.slice(0, at), item, ...list.slice(at)]
}

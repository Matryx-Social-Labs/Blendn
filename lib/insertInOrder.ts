/**
 * A socket message put in its place by (createdAt, id), the order the history reads in.
 *
 * The server emits a chat message only once moderation has passed it (0.3–1 s, varying), so a quick second message
 * can arrive before a slow first one; appending showed it above. The scan runs back from the newest, where nearly
 * every arrival belongs. A time that does not parse compares as nothing (NaN), so that message goes last, as it
 * always did. `list` is oldest first and stays untouched.
 */
export function insertInOrder<T>(list: readonly T[], item: T, createdAtOf: (x: T) => string, idOf: (x: T) => string): T[] {
  const time = Date.parse(createdAtOf(item))
  const after = (x: T) => Date.parse(createdAtOf(x)) > time || (Date.parse(createdAtOf(x)) === time && idOf(x) > idOf(item))
  let at = list.length
  while (at > 0 && after(list[at - 1])) at--
  return [...list.slice(0, at), item, ...list.slice(at)]
}

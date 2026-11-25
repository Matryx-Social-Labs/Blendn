/**
 * A socket message put in its place by (createdAt, id), the order the history reads in.
 *
 * The server emits a chat message only once moderation has passed it (0.3–1 s, varying), so a quick second message
 * can arrive before a slow first one; appending showed it above. The scan runs back from the newest, where nearly
 * every arrival belongs. What only this phone holds (a send in flight, a failed one) carries the phone's clock, so it
 * is passed over and stays below, as a refresh keeps it (lib/mergeNewestPage). A time that does not parse compares as
 * nothing (NaN), so that message goes last among the server's, as it always did. `list` is oldest first and stays
 * untouched.
 */
export function insertInOrder<T>(
  list: readonly T[],
  item: T,
  createdAtOf: (x: T) => string,
  idOf: (x: T) => string,
  isLocal: (x: T) => boolean
): T[] {
  const time = Date.parse(createdAtOf(item))
  const after = (x: T) =>
    isLocal(x) || Date.parse(createdAtOf(x)) > time || (Date.parse(createdAtOf(x)) === time && idOf(x) > idOf(item))
  let at = list.length
  while (at > 0 && after(list[at - 1])) at--
  return [...list.slice(0, at), item, ...list.slice(at)]
}

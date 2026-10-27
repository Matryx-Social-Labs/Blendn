/**
 * Who is no longer a friend, noticed on a screen other than the list (an unfriend, a profile that answered 404), so Friends can
 * drop them from pages it read earlier. The first page is read again on every return; pages read further down are kept so the
 * list does not jump, and this is how a person removed from one of those leaves with it. Drained by the list that reads it.
 */
const gone = new Set<string>()

export function noteFriendGone(userId: string): void {
  gone.add(userId)
}

/** The ids noted since the last call, and forgets them. */
export function takeFriendsGone(): ReadonlySet<string> {
  const taken = new Set(gone)
  gone.clear()
  return taken
}

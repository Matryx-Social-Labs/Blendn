/**
 * Who is no longer a friend, noticed on a screen other than the list (an unfriend, a profile that answered 404), so Friends can
 * drop them from pages it read earlier. The first page is read again on every return; pages read further down are kept so the
 * list does not jump, and this is how a person removed from one of those leaves with it.
 *
 * Every list reads from its own mark, so two lists open at once (Friends' newest head and its A–Z) both drop the person; a
 * drained set let the first reader take it from the second.
 *
 * ponytail: the noted ids are kept for the app's life (an unfriend is rare, a few ids a session); cap it if that ever changes.
 */
const noted: string[] = []

export function noteFriendGone(userId: string): void {
  noted.push(userId)
}

/** A new reader's mark: it reads only what is noted from now on. */
export const friendsGoneMark = (): number => noted.length

/** The ids noted after a reader's `mark`, and its next mark. */
export function friendsGoneSince(mark: number): { gone: ReadonlySet<string>; next: number } {
  return { gone: new Set(noted.slice(mark)), next: noted.length }
}

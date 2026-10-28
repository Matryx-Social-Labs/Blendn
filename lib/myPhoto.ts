/**
 * Your own main photo: the first non-blank entry of the session's `profile.photos`.
 *
 * `profile.photos` is the source the profile editor writes; `User.image` mirrors the chosen
 * photo (it is the server's copy of `photos[0]`, and the OAuth avatar is never stored), so
 * reading the list directly follows an edit before the mirror does. No photo is `null`, and
 * the caller falls back to its glyph (the Me tab) or creature.
 *
 * The session user is re-read by `refreshAuthUser()` after every photo write and on
 * foreground, so a caller that reads `useAuth().user` follows a change.
 */
export type MyPhotoUser = { profile?: { photos?: readonly (string | null | undefined)[] | null } | null } | null | undefined

export const myMainPhoto = (user: MyPhotoUser): string | null => user?.profile?.photos?.find((u) => !!u?.trim()) ?? null

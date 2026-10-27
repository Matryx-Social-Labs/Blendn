/**
 * Your own main photo: the first non-blank entry of the session's `profile.photos`.
 *
 * Never `user.image`. That is the OAuth avatar until the first profile save, and it
 * often 404s; the rest of the app does not draw it either. No photo is `null`, and the
 * caller falls back to its glyph (the Me tab) or creature.
 *
 * The session user is re-read by `refreshAuthUser()` after every photo write and on
 * foreground, so a caller that reads `useAuth().user` follows a change.
 */
export type MyPhotoUser = { profile?: { photos?: readonly (string | null | undefined)[] | null } | null } | null | undefined

export const myMainPhoto = (user: MyPhotoUser): string | null => user?.profile?.photos?.find((u) => !!u?.trim()) ?? null

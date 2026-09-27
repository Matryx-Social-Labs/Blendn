/**
 * The Me tab's words, as pure functions so they can be tested without a screen.
 *
 * Everything here reads fields `GET /users/:id` already returns for your own
 * profile — `memberSince` is the account's `createdAt`, and the gaps are read
 * off `photos`, `bio` and `interests`. Nothing is invented to fill a line: a
 * value that is missing drops its part rather than printing a placeholder.
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** The slots Edit profile offers — `PhotoManager`'s grid. */
export const MAX_PHOTOS = 6

/** Below this many photos the tab suggests adding more. */
const FEW_PHOTOS = 3

function memberDate(memberSince: string | null | undefined): Date | null {
  if (!memberSince) return null
  const d = new Date(memberSince)
  return Number.isNaN(d.getTime()) ? null : d
}

/** "Joined Mar 2025", or null when the date is missing or unreadable. */
export function joinedLabel(memberSince: string | null | undefined): string | null {
  const d = memberDate(memberSince)
  return d ? `Joined ${MONTHS[d.getMonth()]} ${d.getFullYear()}` : null
}

/** "Bengaluru · Joined Mar 2025", dropping whichever part is missing. */
export function identityMeta(
  location: string | null | undefined,
  memberSince: string | null | undefined
): string | null {
  const parts = [location?.trim(), joinedLabel(memberSince)].filter(Boolean)
  return parts.length ? parts.join(' · ') : null
}

export interface ProfileGap {
  key: 'photo' | 'photos' | 'bio' | 'interests'
  label: string
}

/**
 * What is still missing, most useful first, at most three.
 *
 * A photo leads because revealing yourself in a room shows your name and photo
 * and nothing else — without one there is nothing to reveal. Rows, never a
 * percentage: leaving a field empty is a legitimate choice, and a meter turns
 * it into a debt.
 */
export function profileGaps(profile: {
  photos?: string[] | null
  bio?: string | null
  interests?: string[] | null
}): ProfileGap[] {
  const photos = (profile.photos ?? []).filter((p) => !!p && p.trim() !== '').length
  const gaps: ProfileGap[] = []
  if (photos === 0) gaps.push({ key: 'photo', label: 'Add a photo' })
  else if (photos < FEW_PHOTOS) {
    gaps.push({ key: 'photos', label: `Add photos · ${photos} of ${MAX_PHOTOS}` })
  }
  if (!profile.bio?.trim()) gaps.push({ key: 'bio', label: 'Write a bio' })
  if (!profile.interests?.length) gaps.push({ key: 'interests', label: 'Pick interests' })
  return gaps.slice(0, 3)
}

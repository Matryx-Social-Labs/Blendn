/**
 * "Share location for nearby events" (Settings, onboarding; `profiles.share_location`).
 *
 * Off means no position leaves the phone for the reads that sort and label by distance: the events list, Places and an
 * event's detail (`apiClient`). It is not the check-in, which is an act the person performs and sends in a body.
 *
 * Kept here, in memory, because the reads are made from many screens and none of them holds the profile: it is set from the
 * account when a session begins (`useAuth`) and from a saved switch (`apiClient.updateProfile`). Unknown is on, the column's default.
 */
let sharing = true

export const locationSharingOn = (): boolean => sharing

/** `undefined` (a profile that does not say) is the default, on. */
export function setLocationSharing(value: boolean | null | undefined): void {
  sharing = value !== false
}

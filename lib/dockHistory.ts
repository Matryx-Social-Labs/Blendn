/**
 * The Room chat dock's first read: the room chat's last few messages, read
 * with the Room (`useRoom`) so the dock opens on its real last line instead of
 * "Nobody has said anything yet" turning into a message (PR #401 drive 2).
 * Its own module so the dock does not import the room hook.
 */
export type ChatHistory = { groupId: string; data: unknown; failed: boolean }

/** The dock reads the room chat's last few messages; the newest shown is its line. */
export const DOCK_HISTORY = 8

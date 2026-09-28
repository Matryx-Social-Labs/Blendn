/** How far a message must be dragged right before letting go replies to it. */
export const REPLY_SWIPE_TRIGGER = 56
/** How far it can travel; past the trigger it slows, so it never flies off. */
const REPLY_SWIPE_MAX = 88

/**
 * The row's offset for a finger `translationX` along: right only, 1:1 up to the
 * trigger, then rubber-banded to a stop. A worklet, so it runs on the UI thread.
 */
export function replyDragOffset(translationX: number): number {
  'worklet'
  if (translationX <= 0) return 0
  if (translationX <= REPLY_SWIPE_TRIGGER) return translationX
  const extra = translationX - REPLY_SWIPE_TRIGGER
  return Math.min(REPLY_SWIPE_MAX, REPLY_SWIPE_TRIGGER + extra * 0.35)
}

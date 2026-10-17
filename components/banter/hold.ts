/**
 * #27 / C12: when the Banter's order holds still under a finger, and when it
 * lets go — as a pure step over the list's own events, in the order a real
 * touch delivers them.
 *
 * - The hold starts when a finger comes DOWN (touch start), not when a drag
 *   begins: a finger resting on the list is what "a finger was down" means,
 *   and a row must not move under it before it scrolls.
 * - It lets go on lift: a short timer after the touch ends or the drag ends,
 *   so a fling's momentum (which starts just after) can cancel it and hold
 *   until the list comes to rest.
 * - A touch cancelled while dragging is ignored: Android cancels the raw
 *   touch as the scroll view takes it over, and that is not a lift.
 */
export type HoldEvent = 'touchStart' | 'dragBegin' | 'dragEnd' | 'touchEnd' | 'momentumBegin' | 'momentumEnd' | 'timer' | 'release'
export type Hold = { held: boolean; dragging: boolean; gliding: boolean; armed: boolean }

export const IDLE: Hold = { held: false, dragging: false, gliding: false, armed: false }

export function holdStep(s: Hold, e: HoldEvent): Hold {
  switch (e) {
    case 'touchStart':
      return { ...s, held: true, armed: false }
    case 'dragBegin':
      return { ...s, held: true, dragging: true, armed: false }
    case 'dragEnd':
      return { ...s, dragging: false, armed: true }
    case 'touchEnd':
      return s.dragging ? s : { ...s, armed: true }
    case 'momentumBegin':
      return { ...s, gliding: true, armed: false }
    case 'momentumEnd':
      return IDLE
    case 'timer':
      return s.dragging || s.gliding ? { ...s, armed: false } : IDLE
    case 'release':
      return IDLE
  }
}

/** The held order lets go this long after a lift (a fling's momentum, starting just after, cancels it). */
export const HOLD_RELEASE_MS = 250
/**
 * The longest the order holds without a new event from the list. iOS can drop
 * the lift (a row's Pressable has the touch, so the list's touchEnd never
 * comes) or a glide's momentumEnd; Android settled on lift, iOS held until
 * the next tap (drive 3). Restarted by every event while held.
 */
export const HOLD_MAX_MS = 3000

/**
 * `holdStep` with its two timers: the short one after a lift, and the cap.
 * `onHeld` hears each change of `held`. `state()` is the current step.
 */
export function holdController(onHeld: (held: boolean) => void) {
  let s: Hold = IDLE
  let lift: ReturnType<typeof setTimeout> | null = null
  let cap: ReturnType<typeof setTimeout> | null = null
  const clear = (t: ReturnType<typeof setTimeout> | null) => {
    if (t) clearTimeout(t)
    return null
  }
  const step = (e: HoldEvent) => {
    const prev = s
    s = holdStep(prev, e)
    if (prev.armed && !s.armed) lift = clear(lift)
    if (s.armed && !prev.armed) lift = setTimeout(() => step('timer'), HOLD_RELEASE_MS)
    cap = clear(cap)
    if (s.held) cap = setTimeout(() => step('release'), HOLD_MAX_MS)
    if (s.held !== prev.held) onHeld(s.held)
  }
  return {
    step,
    state: () => s,
    dispose() {
      lift = clear(lift)
      cap = clear(cap)
    },
  }
}

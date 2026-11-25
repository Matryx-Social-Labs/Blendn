import { useEffect, useRef, useState } from 'react'
import { Easing, ReduceMotion, withSpring, withTiming, type SharedValue } from 'react-native-reanimated'
import { scheduleOnRN } from 'react-native-worklets'

import { DURATION, EASING, SPRING } from '../../lib/design/tokens'
import { motionTokens } from '../../lib/motion'
import { useLatest } from '../../lib/useLatest'

/** Past this the Modal goes whether or not the close's own callback came (M11's lesson: never callback-only). */
export const CLOSE_BACKSTOP_MS = DURATION.moment

/**
 * A full-screen viewer's open, and a close that reverses it (DS #33, SCRUM-1001 M22). `open` runs to 1 on `M.travel`
 * when it travels in from a thumbnail, otherwise over the base fade (Reduce Motion's 200 ms). When `visible` turns off,
 * the Modal stays up while `open` runs back to 0 the same way. It goes from the animation's callback, or after
 * `CLOSE_BACKSTOP_MS` if that never comes, and then `onGone` runs: reset what the next open starts from there, not
 * before, or the leaving frames jump. Opened again while leaving, it stays, and the open plays from where the close got to.
 *
 * Returns `up`, the Modal's wanted state, and `leaving`: take no touches then.
 */
export function useCloseReverses(
  visible: boolean,
  open: SharedValue<number>,
  { travel, reduceMotion, onGone }: { travel: boolean; reduceMotion: boolean; onGone?: () => void },
) {
  const [up, setUp] = useState(visible)
  // Opened: up at once (state adjusted in render, not in an effect).
  if (visible && !up) setUp(true)
  const gone = useLatest(onGone)
  const wasUp = useRef(visible)

  useEffect(() => {
    const duration = motionTokens(reduceMotion).duration.base
    // Never `ReduceMotion.System`: on that setting Reanimated skips the animation, and the Reduce Motion fade is a cut.
    const toward = (to: number, done?: (finished?: boolean) => void) =>
      travel
        ? withSpring(to, { ...SPRING.travel, reduceMotion: ReduceMotion.Never }, done)
        : withTiming(
            to,
            {
              duration,
              easing: Easing.bezier(...EASING.gentle),
              reduceMotion: ReduceMotion.Never,
            },
            done,
          )
    if (visible) {
      wasUp.current = true
      open.set(toward(1))
      return
    }
    if (!wasUp.current) return
    let settled = false
    const hide = () => {
      if (settled) return
      settled = true
      wasUp.current = false
      setUp(false)
      gone.current?.()
    }
    const done = (finished?: boolean) => {
      'worklet'
      if (finished) scheduleOnRN(hide)
    }
    open.set(toward(0, done))
    const timer = setTimeout(hide, CLOSE_BACKSTOP_MS)
    return () => {
      // Opened again before it went: an interrupted close never hides it.
      settled = true
      clearTimeout(timer)
    }
    // On opening and closing only: the rest is read as it stood then.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible])

  return { up: up || visible, leaving: up && !visible }
}

/**
 * What a viewer showed while it was open, held while it leaves: its owner usually clears the photo, the sender and the
 * thumbnail's frame as it closes, and the leaving frames must still draw them (and travel back to that frame). Pass props
 * as they come; a value built in the same render would never settle.
 */
export function useKeptWhileOpen<T>(visible: boolean, value: T): T {
  const [kept, setKept] = useState(value)
  if (visible && !Object.is(kept, value)) setKept(value)
  return visible ? value : kept
}

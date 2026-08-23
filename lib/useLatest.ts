import { useEffect, useRef, type MutableRefObject } from 'react'

/**
 * A ref that always holds the newest value, for handlers that *read* state
 * rather than render it.
 *
 * ## The bug this exists for
 *
 * Every action handler on the Pulse listed the volatile maps in its dependency
 * array — `checkinStatuses`, `proximityData`, `interestStatuses`,
 * `interestCounts`, `checkedInEvents` — because each reads them to snapshot the
 * previous value before an optimistic update.
 *
 * `useCallback` therefore gave every handler a new identity whenever any of
 * those maps changed, and those handlers are props on **every card in the
 * list**. `EventCard` is `memo`'d, so it compares its props and bails when they
 * match — except `onCheckIn` and `onToggleInterest` never matched. So one person
 * checking in re-rendered every mounted card. Measured at 27 commits and 257ms
 * per visit to the tab.
 *
 * The distinction that fixes it: those maps are **inputs to a decision**, taken
 * at the moment of a tap, not inputs to a render. A ref carries the newest value
 * without participating in identity, so the handler becomes stable and the
 * `memo` starts working — while `renderEventItem` keeps the maps in its own deps,
 * because there they really are render inputs and are what makes a card update.
 *
 * Synced in an effect rather than during render: an effect has committed before
 * any tap can reach a handler, and writing a ref during a render that React then
 * discards is the one way this pattern goes wrong.
 */
export function useLatest<T>(value: T): MutableRefObject<T> {
  const ref = useRef(value)
  useEffect(() => {
    ref.current = value
  }, [value])
  return ref
}

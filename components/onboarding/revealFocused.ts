import { createContext, useCallback, useRef, type RefObject } from 'react'
import { ScrollView, TextInput, View, type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native'

/** Room kept above the field for its label, and below it for the hint (two or three lines of small print). */
export const REVEAL_ABOVE = 32
export const REVEAL_BELOW = 72

/**
 * Where a field must end up so it is all visible: the scroll offset that brings
 * its box (with `padding` either side) inside the viewport, or null when it
 * already is. Pure, so it is tested.
 */
export function revealOffset(field: { top: number; bottom: number }, scrollY: number, viewport: number): number | null {
  const top = field.top - REVEAL_ABOVE
  const bottom = field.bottom + REVEAL_BELOW
  if (bottom > scrollY + viewport) return Math.max(0, bottom - viewport)
  if (top < scrollY) return Math.max(0, top)
  return null
}

/** What `EmberField` calls when it takes focus: bring me into view. Absent outside an onboarding screen. */
export const RevealOnFocus = createContext<(() => void) | null>(null)

/**
 * The onboarding page's scroll, taught to follow the focused field.
 *
 * The page shrinks above the keyboard (an avoiding view), and a ScrollView does
 * not move on its own when focus lands below its new, shorter viewport — "Next"
 * to the birth date typed into a box nobody could see. This scrolls the focused
 * input into view when focus moves, and again when the viewport changes (the
 * keyboard arriving after the focus did).
 */
export function useRevealFocused(): {
  scrollRef: RefObject<ScrollView | null>
  bodyRef: RefObject<View | null>
  reveal: () => void
  onScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => void
  onViewportLayout: (e: LayoutChangeEvent) => void
  onBodyLayout: (e: LayoutChangeEvent) => void
} {
  const scrollRef = useRef<ScrollView>(null)
  const bodyRef = useRef<View>(null)
  const scrollY = useRef(0)
  const viewport = useRef(0)
  const bodyY = useRef(0)

  const reveal = useCallback(() => {
    const field = TextInput.State.currentlyFocusedInput?.()
    const body = bodyRef.current
    if (!field || !body || viewport.current === 0) return
    field.measureLayout(
      body,
      (_x, y, _w, height) => {
        const to = revealOffset({ top: bodyY.current + y, bottom: bodyY.current + y + height }, scrollY.current, viewport.current)
        if (to !== null) scrollRef.current?.scrollTo({ y: to, animated: true })
      },
      () => {}
    )
  }, [])

  return {
    scrollRef,
    bodyRef,
    reveal,
    onScroll: (e) => {
      scrollY.current = e.nativeEvent.contentOffset.y
    },
    onViewportLayout: (e) => {
      viewport.current = e.nativeEvent.layout.height
      reveal()
    },
    onBodyLayout: (e) => {
      bodyY.current = e.nativeEvent.layout.y
    },
  }
}

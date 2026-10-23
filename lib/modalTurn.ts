import { createContext, useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { AppState, Platform } from 'react-native'

import { Logger } from './logger'
import { useLatest } from './useLatest'

/**
 * One Modal on screen at a time on iOS, across the whole app (RC drive 4 D-9, D-8).
 *
 * The app's Modals live in hosts that know nothing of each other: the presence monitor's "Checked out", Go Live's
 * "Your live time is up", `showSheet`'s host, the share tray, a ⋯ menu, a photo viewer, a router modal (the paywall).
 * iOS refuses a Modal presented while another is on screen or still leaving, and React Native 0.86 marks it presented
 * before asking and never asks again (`RCTModalHostViewComponentView ensurePresentedOnlyIfNeeded`): the sheet never
 * draws, its owner thinks it was shown, and on drive 4 the app took no taps until it was relaunched.
 *
 * So a Modal asks for the turn before it is drawn, and gives it back once it has gone; one asked for while another holds
 * it waits, in order. A Modal iOS refuses anyway (no `onShow` within `SHOW_WATCHDOG_MS`) is taken down, gives the turn
 * up, and asks again, backing off, for as long as it is wanted. A Modal drawn inside
 * another Modal or a router modal presents from it, and does not queue (`PresentsHere`). Android presents a Modal over
 * another: nothing queues there.
 */
export type Turn = object

let holder: Turn | null = null
let queue: readonly Turn[] = []
/** Turns that are whole screens (a router modal, a native picker or browser), not a Modal drawn over one. */
const screens = new WeakSet<Turn>()
/** Turns whose Modal has been closed and is on its way out (waiting for iOS to say it has gone). */
const leaving = new WeakSet<Turn>()
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((listener) => listener())

/** Told of every new ask (`afterSheetDismissed`'s hand-off ends when what it waited for asks). */
const askListeners = new Set<(turn: Turn) => void>()
export function onTurnRequested(listener: (turn: Turn) => void): () => void {
  askListeners.add(listener)
  return () => {
    askListeners.delete(listener)
  }
}

/** Ask for the screen. Free, it is yours at once; held, you wait behind whoever asked first (`front`: ahead of them). */
export function requestTurn(turn: Turn, { front = false, screen = false }: { front?: boolean; screen?: boolean } = {}): void {
  if (screen) screens.add(turn)
  if (holder === turn || queue.includes(turn)) return
  if (holder === null) {
    holder = turn
    emit()
  } else {
    queue = front ? [turn, ...queue] : [...queue, turn]
  }
  // In line first, then told: a hand-off that lets go on this ask hands the screen to it, not past it.
  askListeners.forEach((listener) => listener(turn))
}

/** Gone (or never wanted after all): the next in line gets the screen. Idempotent; a waiter that gives up leaves the line. */
export function releaseTurn(turn: Turn): void {
  leaving.delete(turn)
  if (holder !== turn) {
    queue = queue.filter((t) => t !== turn)
    return
  }
  const [next = null, ...rest] = queue
  holder = next
  queue = rest
  emit()
}

export const holdsTurn = (turn: Turn): boolean => holder === turn

export function subscribeTurns(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Whether `turn` holds the screen now. */
export function useHoldsTurn(turn: Turn): boolean {
  return useSyncExternalStore(subscribeTurns, () => holder === turn, () => holder === turn)
}

/** Tests only: nobody holds the screen and nobody waits. */
export function resetModalTurns(): void {
  holder = null
  queue = []
  emit()
}

/** Inside a Modal or a router modal: a Modal drawn here presents from it, so it does not wait for the screen. */
export const PresentsHere = createContext(false)

/**
 * iOS says a Modal is on screen with `onShow`; one that has not said so by now was refused. The clock starts as React
 * draws it, before the native mount, so a Modal that fades in (`animationType="fade"`) adds its fade: iOS sends onShow
 * at the end of it (review MED-A).
 */
export const SHOW_WATCHDOG_MS = 500
/** React Native's own Modal fade, with room to spare: what a fading Modal adds to the watchdog. */
export const MODAL_FADE_MS = 400
/** A watchdog that fires this much past its time was held up (a JS stall), not refused: it looks once more. */
const LATE_FIRE_MS = 250
/** iOS answers a dismissal with `onDismiss`; if it never does, the next in line goes after this. */
export const MODAL_GONE_FALLBACK_MS = 600
/**
 * A refused Modal asks again after it was taken down: 0.5 s, then 1 s, then every 2 s, for as long as it is wanted. It
 * is never closed for being refused: its owner wanted it, and closing it said nothing (review MED-B).
 */
const RETRY_FIRST_MS = 500
const RETRY_MAX_MS = 2000
export const retryDelay = (refusals: number) => Math.min(RETRY_FIRST_MS * 2 ** Math.max(0, refusals - 1), RETRY_MAX_MS)

export type TurnGate = ReturnType<typeof useTurnGate>

/** May a Modal that is `wanted` be drawn now (`allowed`)? Asks for the turn while it is wanted. */
export function useTurnGate(wanted: boolean) {
  const nested = useContext(PresentsHere)
  const queued = Platform.OS === 'ios' && !nested
  const [turn] = useState<Turn>(() => ({}))
  const holds = useHoldsTurn(turn)
  /** Taken down after a refusal, until it asks again. */
  const [backoff, setBackoff] = useState(false)
  // No longer wanted: whatever a refusal left is forgotten (state adjusted in render).
  if (!wanted && backoff) setBackoff(false)
  useEffect(() => {
    if (wanted && queued && !backoff) requestTurn(turn)
  }, [wanted, queued, backoff, turn])
  return { turn, queued, wanted, allowed: wanted && !backoff && (!queued || holds), setBackoff }
}

/**
 * The Modal's side of the turn: `modalUp` is whether the owner's Modal is drawn (it may stay a moment after `allowed`
 * goes, for its own exit). Returns `refused` (draw the Modal off: iOS refused it) and the Modal's `onShow`/`onDismiss`.
 */
export function useTurnWatch(gate: TurnGate, modalUp: boolean, { animationMs = 0 }: { animationMs?: number } = {}) {
  const { turn, queued, wanted, setBackoff } = gate
  const shown = useRef(false)
  const presented = useRef(false)
  const wantedNow = useLatest(wanted)
  const refusals = useRef(0)
  const [refused, setRefused] = useState(false)
  if (!wanted && refused) setRefused(false)
  useEffect(() => {
    if (!wanted) refusals.current = 0
  }, [wanted])
  useEffect(() => {
    if (modalUp && !refused) presented.current = true
    if (!modalUp) shown.current = false
  }, [modalUp, refused])

  /*
   * The watchdog: drawn, and iOS has not said it is on screen. Not a strike: a timer that fired late (a JS stall can
   * put it after onShow's delivery) looks once more; and nothing counts while the app is not in the foreground.
   */
  useEffect(() => {
    if (!queued || !modalUp || refused || shown.current) return
    const budget = SHOW_WATCHDOG_MS + animationMs
    let timer: ReturnType<typeof setTimeout>
    let lookedAgain = false
    let armedAt = Date.now()
    const arm = () => {
      armedAt = Date.now()
      timer = setTimeout(fire, budget)
    }
    const fire = () => {
      if (shown.current) return
      if (!lookedAgain && Date.now() - armedAt > budget + LATE_FIRE_MS) {
        lookedAgain = true
        return arm()
      }
      if (AppState.currentState === 'background' || AppState.currentState === 'inactive') return arm()
      refusals.current += 1
      Logger.warn('navigation', 'iOS did not present a modal; taking it down', { refusals: refusals.current })
      presented.current = false
      setRefused(true)
      setBackoff(true)
      releaseTurn(turn)
    }
    arm()
    return () => clearTimeout(timer)
  }, [queued, modalUp, refused, turn, setBackoff, animationMs])

  // Refused and taken down: ask again, backing off, while it is wanted.
  useEffect(() => {
    if (!refused || modalUp) return
    const timer = setTimeout(() => {
      setRefused(false)
      setBackoff(false)
    }, retryDelay(refusals.current))
    return () => clearTimeout(timer)
  }, [refused, modalUp, setBackoff])

  // Closed while it holds the screen: it is leaving, which a native screen opened now waits for (`holdTurnWhile`).
  useEffect(() => {
    if (queued && !wanted && holder === turn) leaving.add(turn)
  }, [queued, wanted, turn])

  // Not wanted and not drawn: the turn goes back once iOS says the Modal has gone (or at once if it never reached it).
  useEffect(() => {
    if (!queued || wanted || modalUp) return
    if (!presented.current) {
      releaseTurn(turn)
      return
    }
    const timer = setTimeout(() => {
      presented.current = false
      releaseTurn(turn)
    }, MODAL_GONE_FALLBACK_MS)
    return () => clearTimeout(timer)
  }, [queued, wanted, modalUp, turn])

  /*
   * Unmounted: given back at once. A Modal unmounted on screen sends no onDismiss, and the next may ask while it is
   * still being taken down; if iOS refuses that one, the watchdog takes it down and it asks again.
   */
  useEffect(() => () => releaseTurn(turn), [turn])

  const onShow = useCallback(() => {
    shown.current = true
  }, [])
  const onDismiss = useCallback(() => {
    shown.current = false
    // Re-opened while it was leaving: it still holds the screen, and it is still on it.
    if (wantedNow.current) return
    presented.current = false
    releaseTurn(turn)
  }, [turn, wantedNow])
  return { refused, onShow, onDismiss }
}

/** A plain Modal (no exit of its own) that takes its turn: pass `visible`, `onShow` and `onDismiss` to it. */
export function useQueuedModal(wanted: boolean, options: { animationMs?: number } = {}) {
  const gate = useTurnGate(wanted)
  const watch = useTurnWatch(gate, gate.allowed, options)
  return { visible: gate.allowed && !watch.refused, onShow: watch.onShow, onDismiss: watch.onDismiss }
}

/** A native screen's own dismissal (the photo picker sliding down) is given this long before the next Modal asks. */
export const NATIVE_GONE_MS = 350

/**
 * A native screen that is not a Modal (the photo picker, the share sheet, the in-app browser) holds the screen while it
 * is up: it waits for a Modal on its way out (its onDismiss, at most `waitMs`), so it is not dropped, and a sheet that
 * comes due under it waits rather than being refused (review MED-B). Ahead of anyone already waiting: it was asked for.
 *
 * A Modal that stays up (the sheet a link was opened from, the paywall) is presented over at once, as before.
 * `afterClosing`: the caller has just closed the Modal holding the screen (the photo source sheet), which React may not
 * have drawn closed yet: wait for whatever Modal holds it.
 */
export async function holdTurnWhile<T>(
  work: () => Promise<T>,
  { afterClosing = false, waitMs = MODAL_GONE_FALLBACK_MS }: { afterClosing?: boolean; waitMs?: number } = {}
): Promise<T> {
  if (Platform.OS !== 'ios') return work()
  const turn: Turn = {}
  const waitingOn = holder !== null && !screens.has(holder) && (afterClosing || leaving.has(holder)) ? holder : null
  requestTurn(turn, { front: true, screen: true })
  if (waitingOn) {
    await new Promise<void>((resolve) => {
      const done = () => {
        off()
        clearTimeout(timer)
        resolve()
      }
      const timer = setTimeout(done, waitMs)
      const off = subscribeTurns(() => {
        if (holder !== waitingOn) done()
      })
    })
  }
  try {
    return await work()
  } finally {
    setTimeout(() => releaseTurn(turn), NATIVE_GONE_MS)
  }
}

import { useFocusEffect } from 'expo-router'
import { createContext, useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Platform } from 'react-native'

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
 * up, and asks again, `MAX_REFUSALS` times, then is dropped with a log rather than hold the screen. A Modal drawn inside
 * another Modal or a router modal presents from it, and does not queue (`PresentsHere`). Android presents a Modal over
 * another: nothing queues there.
 */
export type Turn = object

let holder: Turn | null = null
let queue: readonly Turn[] = []
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
export function requestTurn(turn: Turn, { front = false }: { front?: boolean } = {}): void {
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

/** iOS says a Modal is on screen with `onShow`; one that has not said so by now was refused. */
export const SHOW_WATCHDOG_MS = 500
/** iOS answers a dismissal with `onDismiss`; if it never does, the next in line goes after this. */
export const MODAL_GONE_FALLBACK_MS = 600
/** A refused Modal asks again this soon after it was taken down, and this many times in all. */
const RETRY_MS = 400
export const MAX_REFUSALS = 3

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
 * `onGiveUp`: refused `MAX_REFUSALS` times; the owner should close it.
 */
export function useTurnWatch(gate: TurnGate, modalUp: boolean, onGiveUp?: () => void) {
  const { turn, queued, wanted, setBackoff } = gate
  const shown = useRef(false)
  const presented = useRef(false)
  const wantedNow = useLatest(wanted)
  const giveUp = useLatest(onGiveUp)
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

  // The watchdog: drawn, and iOS has not said it is on screen.
  useEffect(() => {
    if (!queued || !modalUp || refused || shown.current) return
    const timer = setTimeout(() => {
      if (shown.current) return
      refusals.current += 1
      Logger.warn('navigation', 'iOS did not present a modal; taking it down', { refusals: refusals.current })
      presented.current = false
      setRefused(true)
      setBackoff(true)
      releaseTurn(turn)
      if (refusals.current >= MAX_REFUSALS) {
        Logger.error('navigation', 'a modal iOS kept refusing was dropped', { refusals: refusals.current })
        giveUp.current?.()
      }
    }, SHOW_WATCHDOG_MS)
    return () => clearTimeout(timer)
  }, [queued, modalUp, refused, turn, setBackoff, giveUp])

  // Refused and taken down: ask again, unless it was dropped.
  useEffect(() => {
    if (!refused || modalUp || refusals.current >= MAX_REFUSALS) return
    const timer = setTimeout(() => {
      setRefused(false)
      setBackoff(false)
    }, RETRY_MS)
    return () => clearTimeout(timer)
  }, [refused, modalUp, setBackoff])

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
export function useQueuedModal(wanted: boolean, onGiveUp?: () => void) {
  const gate = useTurnGate(wanted)
  const watch = useTurnWatch(gate, gate.allowed, onGiveUp)
  return { visible: gate.allowed && !watch.refused, onShow: watch.onShow, onDismiss: watch.onDismiss }
}

/**
 * A router modal (the paywall, Make a crew, a friend link, event preferences) holds the screen while it is focused:
 * a sheet that comes due under it waits, rather than being refused. Ahead of anyone already waiting, because it is on
 * screen. Wrap its content in `PresentsHere` so its own sheets present from it.
 */
export function useRouteModalTurn(): void {
  const [turn] = useState<Turn>(() => ({}))
  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== 'ios') return
      requestTurn(turn, { front: true })
      return () => releaseTurn(turn)
    }, [turn])
  )
}

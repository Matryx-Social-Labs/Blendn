import type { ReactNode } from 'react'
import { useSyncExternalStore } from 'react'
import { Platform } from 'react-native'

/**
 * One bottom sheet for the whole app, opened from anywhere.
 *
 * ## Why not `Alert.alert`
 *
 * The safety flows were built on `Alert.alert` with four to seven buttons.
 * Android draws at most three and drops the rest without a word, so "Block and
 * report", "Hate speech" and "Other" simply did not exist on half the phones —
 * the report reasons most likely to be needed were the ones cut. This is an
 * `ActionTray`, which draws every option on both platforms.
 *
 * ## Why a store, not a hook
 *
 * `showUserSafetyActions(name, id)` is called from a profile, a friend, the
 * Room's person card and a DM header, none of which render a sheet of their
 * own — they just want one to appear. A module-level store keeps that call
 * shape: the functions in `lib/safetyUtils.ts` stay plain functions, and
 * `components/SheetHost.tsx` (mounted once in `app/_layout.tsx`) draws
 * whatever is here.
 *
 * ## Why one sheet, and steps replace it
 *
 * A flow is several steps — pick an action, confirm it, pick a reason. Each
 * step replaces the sheet's content in place rather than closing one `Modal`
 * and opening another: iOS will not present a modal while the last one is
 * still animating away, so a chained second sheet can silently never appear.
 */

/** What a step that does something reports back. */
export type SheetOutcome =
  /** Done: the sheet closes and `toast` says what happened. */
  | { ok: true; toast?: string }
  /** Failed: the sheet stays, says why, and the button becomes "Try again". */
  | { ok: false; error: string }

export type SheetAction = {
  label: string
  variant?: 'primary' | 'secondary' | 'destructive'
} & (
  | { cancel: true }
  /** Another step, drawn in place of this one. */
  | { next: () => Sheet }
  /** Runs, with the button showing progress until it settles. */
  | { run: () => Promise<SheetOutcome> }
  /** Something instant — copy, reply — after which the sheet closes. */
  | { then: () => void }
)

export type ActionSheet = {
  kind: 'actions'
  title: string
  message?: string
  /** Drawn above the actions — the message menu's emoji row. */
  content?: ReactNode
  actions: SheetAction[]
  /**
   * Called when the sheet goes away without an action being chosen: Cancel,
   * the backdrop, the drag, Android back. A caller awaiting a choice needs
   * this, or a sheet swiped away leaves its promise pending for ever.
   */
  onDismiss?: () => void
}

export type ReasonSheet = {
  kind: 'reasons'
  title: string
  message?: string
  reasons: { value: string; label: string }[]
  submitLabel: string
  /** Every report endpoint takes an optional description; this is it. */
  run: (reason: string, note?: string) => Promise<SheetOutcome>
}

export type Sheet = ActionSheet | ReasonSheet

type State = { sheet: Sheet | null; key: number }

let state: State = { sheet: null, key: 0 }
const listeners = new Set<() => void>()

const emit = () => listeners.forEach((listener) => listener())

/** Open a sheet, or replace the one that is open. */
export function showSheet(sheet: Sheet): void {
  state = { sheet, key: state.key + 1 }
  emit()
}

export function closeSheet(): void {
  if (!state.sheet) return
  state = { sheet: null, key: state.key }
  emit()
}

/** Close without a choice: tells the sheet's `onDismiss`, then closes. */
export function dismissSheet(): void {
  const sheet = state.sheet
  closeSheet()
  if (sheet?.kind === 'actions') sheet.onDismiss?.()
}

/**
 * Resolves once a closing sheet is off screen on iOS.
 *
 * iOS will not present a native view controller — the photo picker, the
 * camera — while a `Modal` is still fading out; the presentation is dropped
 * without an error. A flow that closes the sheet and then opens the picker
 * waits for this first. Android starts an activity over a closing dialog
 * without complaint, so there it is immediate.
 */
export function sheetClosed(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Platform.OS === 'ios' ? SHEET_FADE_MS : 0))
}

/** The Modal's fade (`animationType="fade"`), with a frame to spare. */
const SHEET_FADE_MS = 350

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

const snapshot = () => state

/** For `SheetHost` only. `key` changes with every step, so step state resets. */
export function useSheet(): State {
  return useSyncExternalStore(subscribe, snapshot, snapshot)
}

/*
 * What the P0 components share: the accessibility settings they read, the Bold
 * Text weight step, the focus ring, and the few values the component pages
 * draw that `design/tokens.json` does not carry yet (each named here once, with
 * the page it comes from, rather than as a literal in a component).
 */
import { useEffect, useState } from 'react'
import { AccessibilityInfo, Platform, type AccessibilityChangeEventName, type ViewStyle } from 'react-native'

import { COLOR, FONT_FAMILY, MATERIAL, SIZE, SPACE, TYPE } from '../../lib/design/tokens'
import { tint } from '../../lib/theme'

/**
 * Fixed-height controls (a button's label) cap Dynamic Type at 1.3×, and past
 * it a banner's action wraps (the Button and Banner pages, guidelines/a11y,
 * DESIGN-BRIEF §14). The tokens' `MAX_FONT_SCALE.button` reads 2, the
 * reading-text cap.
 */
export const CONTROL_FONT_CAP = 1.3

/** A spinner replaces a label only after this grace: a quick answer never flashes one (motion #45). */
export const SPINNER_GRACE_MS = 300

/** The pressed wash: the iOS row highlight and the Android ripple (Button, IconButton, SettingsRow pages). */
export const PRESSED_WASH = {
  ios: tint(COLOR.textPrimary, 0.06),
  android: tint(COLOR.textPrimary, 0.12),
} as const

/** The 44 pt (iOS) / 48 dp (Android) minimum target (§7). */
export const minTarget = () => (Platform.OS === 'android' ? SIZE.targetAndroid : SIZE.targetIos)

/**
 * Bold Text steps a weight up one (§14): 400 and 500 → 700, 700 → 900, as the
 * export's `fnt()` does. Geist Mono ships no 900, so it stops at 700. Custom
 * fonts are never bolded by the system, so this is the only way it happens.
 */
const BOLDER: Record<string, string> = {
  [FONT_FAMILY.brand[400]]: FONT_FAMILY.brand[700],
  [FONT_FAMILY.brand[500]]: FONT_FAMILY.brand[700],
  [FONT_FAMILY.brand[700]]: FONT_FAMILY.brand[900],
  [FONT_FAMILY.mono[500]]: FONT_FAMILY.mono[700],
}

/** A type role, with its family swapped (`family`) and stepped up under Bold Text. */
export function font(role: keyof typeof TYPE, bold: boolean, family: string = TYPE[role].fontFamily) {
  return { ...TYPE[role], fontFamily: (bold && BOLDER[family]) || family }
}

function useSetting(query: () => Promise<boolean>, event: AccessibilityChangeEventName) {
  const [on, setOn] = useState(false)
  useEffect(() => {
    let live = true
    query().then(
      (value) => live && setOn(value),
      () => {}
    )
    const sub = AccessibilityInfo.addEventListener(event, (value) => live && setOn(Boolean(value)))
    return () => {
      live = false
      sub.remove()
    }
  }, [query, event])
  return on
}

const boldText = () => AccessibilityInfo.isBoldTextEnabled()
const darkerColors = () => AccessibilityInfo.isDarkerSystemColorsEnabled()
const highTextContrast = () => AccessibilityInfo.isHighTextContrastEnabled()
const screenReader = () => AccessibilityInfo.isScreenReaderEnabled()

/** iOS Bold Text (Android has no API for it; custom fonts are not bolded there either). */
export const useBoldText = () => useSetting(boldText, 'boldTextChanged')

/** Increase Contrast on iOS, high-contrast text on Android. */
export function useIncreaseContrast() {
  const ios = Platform.OS === 'ios'
  return useSetting(ios ? darkerColors : highTextContrast, ios ? 'darkerSystemColorsChanged' : 'highTextContrastChanged')
}

export const useScreenReader = () => useSetting(screenReader, 'screenReaderChanged')

/** Increase Contrast's 50% hairline (§14), the same on every surface that draws one. */
export const IC_HAIRLINE = { borderWidth: 1, borderColor: MATERIAL.hairlineIncreaseContrast } as const

/**
 * The focus ring (§12): 2 pt white outside a 2 pt gap in the page colour, for
 * a keyboard, Switch Control or Voice Control. Two absolutely placed views;
 * the control's container must not clip them.
 */
export function focusRing(radius: number): ViewStyle[] {
  const ring = (inset: number, color: string): ViewStyle => ({
    position: 'absolute',
    top: -inset,
    bottom: -inset,
    left: -inset,
    right: -inset,
    borderRadius: radius + inset,
    borderWidth: SPACE.xxs,
    borderColor: color,
  })
  return [ring(SPACE.xs, COLOR.focusRing), ring(SPACE.xxs, COLOR.ink)]
}

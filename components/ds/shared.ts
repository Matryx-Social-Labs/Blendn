/*
 * What the P0 components share: the accessibility settings they read, the Bold
 * Text weight step, the focus ring, and the few values the component pages
 * draw that `design/tokens.json` does not carry yet (each named here once, with
 * the page it comes from, rather than as a literal in a component).
 */
import { createContext, useContext, useEffect, useState } from 'react'
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

/**
 * The last answer per setting, shared by every component, so one mounted after
 * the first starts right instead of drawing a frame without the setting (as
 * `<Material>` does for Reduce Transparency).
 */
const lastAnswer = new Map<AccessibilityChangeEventName, boolean>()

function useSetting(query: () => Promise<boolean>, event: AccessibilityChangeEventName) {
  const [on, setOn] = useState(() => lastAnswer.get(event) ?? false)
  useEffect(() => {
    let live = true
    const update = (value: boolean) => {
      lastAnswer.set(event, value)
      if (live) setOn(value)
    }
    query().then(update, () => {})
    const sub = AccessibilityInfo.addEventListener(event, (value) => update(Boolean(value)))
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

const reduceTransparency = () => AccessibilityInfo.isReduceTransparencyEnabled()

/** iOS Reduce Transparency (Android has none: its fallbacks are already solid). */
export const useReduceTransparency = () => useSetting(reduceTransparency, 'reduceTransparencyChanged')

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

/**
 * An outcome that appears in place ("Your crew knows", "Copied"), said once:
 * announced on iOS; on Android the element that shows it carries
 * `accessibilityLiveRegion="polite"` (as `<Toast>` does), so it is not read twice.
 */
export function announceOutcome(text: string) {
  if (Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(text)
}

/**
 * What a control sits on (prompt 13 §0): the ink page, a surface card, or glass (a Sheet on iOS, the home drawer). Chip and
 * SegmentedControl read it, so a call site never passes a fill.
 */
export type Ground = 'ink' | 'surface' | 'glass'
const GroundContext = createContext<Ground>('ink')
export const GroundProvider = GroundContext.Provider
export const useGround = () => useContext(GroundContext)
/** The resting fill of a chip on this ground. */
export const chipRest = (ground: Ground) => (ground === 'glass' ? COLOR.chipFillOnGlass : ground === 'surface' ? COLOR.surfaceSunken : COLOR.surface)
/** A SegmentedControl's track: solid even on glass (§12). */
export const trackFill = (ground: Ground) => (ground === 'surface' ? COLOR.surfaceSunken : COLOR.surface)

/**
 * The hue of the world a screen is in (foundations, direction C "Lit from behind"): ember out there (Discover, the default),
 * rose together, violet you. One per screen, from `<HueProvider>` at the screen's root, never nested: Chip, SegmentedControl
 * and (later) RadioCard and ProgressBar light in it. The gradient stays the mark's and the one primary button's.
 */
export type Hue = 'ember' | 'rose' | 'violet'
export type Selection = { fill: string; edge: string; glyph: string }
export const SELECTION: Record<Hue, Selection> = {
  ember: { fill: COLOR.selectionEmberFill, edge: COLOR.brandOrange, glyph: COLOR.selectionEmberGlyph },
  rose: { fill: COLOR.selectionRoseFill, edge: COLOR.brandRose, glyph: COLOR.selectionRoseGlyph },
  violet: { fill: COLOR.selectionVioletFill, edge: COLOR.brandViolet, glyph: COLOR.selectionVioletGlyph },
}
const HueContext = createContext<Hue>('ember')
export const HueProvider = HueContext.Provider
export const useHue = () => useContext(HueContext)
export const useSelection = (): Selection => SELECTION[useHue()]

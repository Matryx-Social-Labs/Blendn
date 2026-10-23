/*
 * What the P0 components share: the accessibility settings they read, the Bold
 * Text weight step, the focus ring, and the few values the component pages
 * draw that `design/tokens.json` does not carry yet (each named here once, with
 * the page it comes from, rather than as a literal in a component).
 */
import { createContext, useContext, useEffect, useState } from 'react'
import { AccessibilityInfo, I18nManager, Platform, useWindowDimensions, type AccessibilityChangeEventName, type ViewStyle } from 'react-native'

import { COLOR, DURATION, EASING, FONT_FAMILY, MATERIAL, MAX_FONT_SCALE, REDUCE_MOTION, SIZE, SPACE, TYPE } from '../../lib/design/tokens'
import { tint } from '../../lib/theme'

/**
 * Fixed-height controls (a button's label) cap Dynamic Type at 1.3×, and past
 * it a banner's action wraps (the Button and Banner pages, guidelines/a11y,
 * DESIGN-BRIEF §14). The tokens' `MAX_FONT_SCALE.button` reads 2, the
 * reading-text cap.
 */
export const CONTROL_FONT_CAP = 1.3

/**
 * The accessibility text sizes start here (RC drive D2): iOS's largest standard size is 1.35× body (xxxLarge, 23 pt), its
 * first accessibility size 1.65× (AX Medium, 28 pt), up to 3.1× (AX XXXL, 53 pt).
 *
 * The rule per role, past it: reading text (body, meta, a row's lines) keeps growing to its `MAX_FONT_SCALE` and WRAPS: a
 * one- or two-line clamp is lifted (`useLargeText`), and a row's height is a `minHeight`, never a `height`. Headings and page
 * titles stop at their `MAX_FONT_SCALE`. Controls and tab labels stop at `CONTROL_FONT_CAP`, and the tab bar offers the large
 * content viewer instead.
 */
export const AX_FONT_SCALE = 1.5

/** The phone is at an accessibility text size: clamped lines open up, and layouts that sit side by side may stack. */
export function useLargeText(): boolean {
  return useWindowDimensions().fontScale >= AX_FONT_SCALE
}

/** The narrowest a line of text may be made beside a trailing piece, in ems of its role: about a dozen characters. */
export const MIN_MEASURE_EM = 6

/**
 * A text column's flex basis beside a trailing piece (a button, a "from your friends"), at the scale it is drawn: the two sit
 * in a row that wraps, so when the text's measure and the piece do not both fit, the piece moves under the text instead of
 * squeezing it. With `flex: 1` (a zero basis) beside a piece that never shrinks, 360 dp at 1.3 left the text one word per
 * line ("You're / anony / mous", "Make / a / crew": RC drive 3).
 */
export function useMinMeasure(role: keyof typeof TYPE, cap: number = MAX_FONT_SCALE[role]): number {
  const { fontScale } = useWindowDimensions()
  return Math.round(MIN_MEASURE_EM * TYPE[role].fontSize * Math.min(fontScale, cap))
}

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
 * A CSS transition over `quick` on the gentle curve for the given properties (Reanimated 4: off the JS thread, interruptible,
 * and never played on mount). The way a two-state flip crosses without a shared value: a fill, an opacity, a ring.
 */
export const quickTransition = (...properties: string[]): ViewStyle =>
  ({ transition: properties.map((property) => `${property} ${DURATION.quick}ms cubic-bezier(${EASING.gentle.join(', ')})`).join(', ') }) as unknown as ViewStyle

/**
 * The hue of the world a screen is in (foundations, direction C "Lit from behind"): ember out there (Discover, the default),
 * rose together, violet you. One per screen, from `<HueProvider>` at the screen's root, never nested: Chip, SegmentedControl
 * and (later) RadioCard and ProgressBar light in it. The gradient stays the mark's and the one primary button's.
 */
export type Hue = 'ember' | 'rose' | 'violet'
/** `flare` is the hue at 42% over `surface`: the light a lit button pours in on press and holds while busy. */
export type Selection = { fill: string; edge: string; glyph: string; flare: string }
export const SELECTION: Record<Hue, Selection> = {
  ember: { fill: COLOR.selectionEmberFill, edge: COLOR.brandOrange, glyph: COLOR.selectionEmberGlyph, flare: COLOR.selectionEmberFlare },
  rose: { fill: COLOR.selectionRoseFill, edge: COLOR.brandRose, glyph: COLOR.selectionRoseGlyph, flare: COLOR.selectionRoseFlare },
  violet: { fill: COLOR.selectionVioletFill, edge: COLOR.brandViolet, glyph: COLOR.selectionVioletGlyph, flare: COLOR.selectionVioletFlare },
}
const HueContext = createContext<Hue>('ember')
export const HueProvider = HueContext.Provider
export const useHue = () => useContext(HueContext)
export const useSelection = (): Selection => SELECTION[useHue()]

/**
 * Geist Mono at 15/20, tabular: the value the Flow 7 frames draw in a chip or a card (the version, the OS, the account,
 * the support address). The type scale has mono at 12 and 40 only, so this is the one design exception, named once here.
 */
export const monoValue = (bold: boolean) => ({
  ...font('meta', bold, FONT_FAMILY.mono[500]),
  // design-exception: Geist Mono at 15, the Flow 7 chip and card values (no mono role between 12 and 40)
  fontSize: 15,
  fontVariant: ['tabular-nums' as const],
})

/**
 * The light that pours in from the leading edge and drains back (Chip's selection, Button's press flare). Each state's style
 * carries its own `transition`, so the pour and the drain have different curves (CSS transitions, Reanimated 4: off the JS
 * thread, retargeted from the presented value on a quick re-press, and never played on mount). Under Reduce Motion nothing
 * translates: the opacity crosses over the Reduce Motion `quick`.
 *
 * Pouring in: the slide over `slideMs` on `curve`, the fade over `fadeMs`. Draining: both over `quick`, the slide on `standard`.
 */
const bezier = (curve: readonly number[]) => `cubic-bezier(${curve.join(', ')})`
const asStyle = (style: object) => style as unknown as ViewStyle
const GENTLE = bezier(EASING.gentle)
/**
 * Off the leading edge: the left in a left-to-right layout, the right under RTL (`I18nManager.isRTL` is fixed for the app's life;
 * a change of direction reloads it, so reading it when the styles are made is enough).
 */
const lightOffX = () => (I18nManager.isRTL ? '101%' : '-101%')
export function pourStyles(slideMs: number, fadeMs: number, curve: readonly number[]) {
  const reduced = `opacity ${REDUCE_MOTION.duration.quick}ms ${GENTLE}`
  return {
    pour: asStyle({ opacity: 1, transform: [{ translateX: '0%' }], transition: `transform ${slideMs}ms ${bezier(curve)}, opacity ${fadeMs}ms ${GENTLE}` }),
    drain: asStyle({
      opacity: 0,
      transform: [{ translateX: lightOffX() }],
      transition: `transform ${DURATION.quick}ms ${bezier(EASING.standard)}, opacity ${DURATION.quick}ms ${GENTLE}`,
    }),
    pourReduced: asStyle({ opacity: 1, transition: reduced }),
    drainReduced: asStyle({ opacity: 0, transition: reduced }),
  }
}

/** The hue's light as a chip, a settings tile or a switch's glyph tile takes it: in over `base` on `entrance`, back over `quick`. */
export const LIGHT = pourStyles(DURATION.base, DURATION.quick, EASING.entrance)

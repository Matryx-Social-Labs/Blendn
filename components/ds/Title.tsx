/*
 * The title role, in one place (SCRUM-1041, owner pick A, 2026-11-15): a title whose longest word is wider than its line
 * shrinks until that word fits, and never below the role's default size. Any other title draws exactly as the role says.
 *
 * Measured, never computed from the font scale, because the scale does not say how big the text is drawn:
 * - Android draws `sp` through `TypedValue.applyDimension`, which is nonlinear from API 34: at font 2.0 a 24 sp title is
 *   about 36 dp, not 48. Its `lineHeight` ignores `maxFontSizeMultiplier` altogether (`TextAttributeProps.lineHeight`
 *   calls `toPixelFromSP(value)` with no cap), so lowering the cap would shrink the glyphs and leave the line at 2.0.
 * - Where a line may break differs too: iOS breaks after a hyphen, Android does not ("Saint-Jean-s / ur-Richelieu" at
 *   font 2.0, SCRUM-1054). So the platform's own layout says whether a word was split (`onTextLayout`), not a word list.
 * - `adjustsFontSizeToFit` shrinks a whole block to a line count, so a 3-line title that wraps cleanly would shrink too.
 *
 * So: the title draws as today; when `onTextLayout` shows a line ending inside a word, that word is laid out once more,
 * hidden, at the role's 1× size with no font scaling, which gives its exact width per point of size. The title is then
 * drawn at the size that word fits the line, floored to the half point (the board's rounding) and never under 1×, with its
 * line height and tracking scaled to match. Nothing happens at 1× or below: the floor leaves nothing to shrink.
 */
import { isValidElement, useRef, useState, type ComponentPropsWithRef, type ReactNode } from 'react'
import { Platform, StyleSheet, Text, useWindowDimensions, type TextLayoutEvent, type TextStyle } from 'react-native'

import { androidSpToDp, NONLINEAR_FONT_API } from '../../lib/design/androidFontScale'
import { MAX_FONT_SCALE, TYPE } from '../../lib/design/tokens'
import { font, PAGE_TITLE, useBoldText } from './shared'

/**
 * `title` (the default): TYPE.title 24/30, cap 2×. `page`: the event and venue pages' 28/33, cap display's 1.5× (PAGE_TITLE).
 * Any other role for a title that is `title` on one surface and smaller on another (a compact card, a sheet's state).
 */
export type TitleRole = keyof typeof TYPE | 'page'

const capOf = (role: TitleRole) => (role === 'page' ? MAX_FONT_SCALE.display : MAX_FONT_SCALE[role])

/** The board rounds a shrunk size down to the half point (long-titles lt.js), so the word lands inside the line. */
const SIZE_STEP = 0.5
/** Wide enough that the hidden copy of a word never wraps: the widest title word at 1× is about 230 pt. */
const MEASURE_WIDTH = 4096

/** Characters a line may legitimately end on inside a token: a hyphen, a dash or a slash. */
const BREAKS_AFTER = /[-‐–—/]/
/** Scripts written without spaces break between characters, so a break there is not a split word. */
const NO_SPACES = /[฀-໿က-႟ក-៿぀-ヿ㐀-鿿가-힯豈-﫿]/
const SPACE_CHAR = /\s/

/** The whitespace-delimited token around position `at` in `text`. */
function tokenAt(text: string, at: number): string {
  let start = at
  let end = at
  while (start > 0 && !SPACE_CHAR.test(text[start - 1])) start -= 1
  while (end < text.length && !SPACE_CHAR.test(text[end])) end += 1
  return text.slice(start, end)
}

/**
 * Every word the layout split across two lines: a line that ends inside a word, not on a space, a hyphen or a dash. Given the whole
 * text (`full`), a word the line clamp cut is one too: iOS breaks after a hyphen, so at AX a 2-line name ended "Lefebvre-Desrosi…"
 * where Android split it (SCRUM-1041 A, names in rows).
 */
export function splitWords(lines: readonly { text: string }[], full?: string, clamp?: number): string[] {
  const text = lines.map((line) => line.text).join('')
  const words = new Set<string>()
  const cutInside = (whole: string, cut: number) =>
    cut > 0 && cut < whole.length && !SPACE_CHAR.test(whole[cut - 1]) && !SPACE_CHAR.test(whole[cut]) && !NO_SPACES.test(whole[cut])
  // iOS reports every line, the hidden ones too: the clamp cuts at the end of its last line, even after a hyphen.
  if (clamp && lines.length > clamp) {
    const cut = lines.slice(0, clamp).reduce((n, line) => n + line.text.length, 0)
    if (cutInside(text, cut)) words.add(tokenAt(text, cut))
  }
  // Or only the shown lines, the last ending where the clamp cut.
  const shown = text.replace(/…$/, '')
  if (full && full.startsWith(shown) && cutInside(full, shown.length)) words.add(tokenAt(full, shown.length))
  let at = 0
  for (const line of lines.slice(0, -1)) {
    at += line.text.length
    const before = text[at - 1]
    const after = text[at]
    if (!before || !after || SPACE_CHAR.test(before) || SPACE_CHAR.test(after) || BREAKS_AFTER.test(before)) continue
    if (NO_SPACES.test(before) || NO_SPACES.test(after)) continue
    words.add(tokenAt(text, at))
  }
  return [...words]
}

type Metrics = { fontSize: number; lineHeight: number; letterSpacing: number }

/**
 * The size at which a word `wordAtBase` wide at the role's 1× fits a `line`-wide line: floored to the half point, never under
 * 1×. `null` when the role's size already fits it.
 */
export function fittedSize(base: Metrics, wordAtBase: number, line: number): number | null {
  if (!(wordAtBase > 0) || !(line > 0)) return null
  const size = Math.floor((base.fontSize * line) / wordAtBase / SIZE_STEP) * SIZE_STEP
  return Math.max(base.fontSize, size)
}

/** The role's line height and tracking, scaled with the size, so a shrunk title keeps its proportions. */
export function metricsAt(base: Metrics, size: number): TextStyle {
  const ratio = size / base.fontSize
  return { fontSize: size, lineHeight: Math.round(base.lineHeight * ratio), letterSpacing: base.letterSpacing * ratio }
}

/** Android 14+ draws `sp` along its own curves (`androidFontScale`); elsewhere a size is multiplied by the scale. */
const curvedScaling = () => Platform.OS === 'android' && Number(Platform.Version) >= NONLINEAR_FONT_API

/** The size the phone draws a `size` role at `fontScale`, stopped at the role's cap as React Native stops it. */
export function drawnSize(size: number, fontScale: number, cap: number): number {
  return curvedScaling() ? Math.min(androidSpToDp(size, fontScale), size * cap) : size * Math.min(fontScale, cap)
}

type Fit = { key: string; size: number }
type Pending = { key: string; words: string[]; line: number }

/**
 * What the title says, from its children (strings, numbers, nested Text): a new title is judged afresh. Not the drawn lines'
 * text, which a clamp (`numberOfLines`) changes as the size does, so a shrunk title would reset itself and shrink again.
 */
function textOf(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join('')
  if (isValidElement<{ children?: ReactNode }>(node)) return textOf(node.props.children)
  return ''
}

export type TitleProps = ComponentPropsWithRef<typeof Text> & {
  variant?: TitleRole
  /** Swap the family (a mono figure set in the title's size); Bold Text still steps it. */
  family?: string
  children?: ReactNode
}

export function Title({ variant = 'title', family, maxFontSizeMultiplier, style, onLayout, onTextLayout, children, ...rest }: TitleProps) {
  const bold = useBoldText()
  const { fontScale, width } = useWindowDimensions()
  const cap = maxFontSizeMultiplier ?? capOf(variant)
  const roleType: TextStyle = variant === 'page' ? PAGE_TITLE : font(variant, bold, family)
  const flat = StyleSheet.flatten([roleType, style]) as TextStyle
  const base: Metrics = { fontSize: flat.fontSize ?? 0, lineHeight: flat.lineHeight ?? 0, letterSpacing: flat.letterSpacing ?? 0 }
  // The floor is 1×: at or under it there is nothing to shrink, so nothing is measured.
  const canShrink = Math.min(fontScale, cap) > 1 && base.fontSize > 0
  const key = `${fontScale}|${width}|${textOf(children)}`

  const [fit, setFit] = useState<Fit | null>(null)
  const [pending, setPending] = useState<Pending | null>(null)
  const line = useRef(0)
  const split = useRef<Omit<Pending, 'line'> | null>(null)
  const shrunk = canShrink && fit?.key === key ? fit : null
  const drawn = drawnSize(base.fontSize, fontScale, cap)
  // Android 14+ grows the line less than the glyphs in it (30 sp → 30 dp around 24 sp → 26.4 at 1.3), under Satoshi's 1.25 em,
  // and the last line lost its descenders (SCRUM-1109). Past 1× an Android title draws at the phone's own size, in dp, with the
  // role's line height in proportion, as a shrunk one does.
  const ownSize = shrunk?.size ?? (canShrink && curvedScaling() ? drawn : null)

  // The box and the lines arrive in either order: measure once both are in.
  const measureIfSplit = () => {
    if (split.current?.key !== key || line.current <= 0) return
    setPending({ ...split.current, line: line.current })
    split.current = null
  }

  const handleLayout: TitleProps['onLayout'] = (e) => {
    onLayout?.(e)
    // The line is read at the role's own size; a shrunk title hugging its text must not shrink the line it is fitted to.
    if (shrunk) return
    line.current = e.nativeEvent.layout.width
    measureIfSplit()
  }

  const handleTextLayout = (e: TextLayoutEvent) => {
    onTextLayout?.(e)
    const { lines } = e.nativeEvent
    let words = splitWords(lines, textOf(children), rest.numberOfLines)
    // iOS lays a clamped text out as its last line holding all the rest ("Lefebvre-Desrosiers", drawn "Lefebvre-Desr…"), with a
    // used width a glyph short of the box, so the width cannot say it was cut. A one-word last line at the clamp is measured, and
    // `handleMeasure` shrinks only a word that does not fit. ponytail: one-word last lines only; a cut inside a later word of a
    // longer last line still ellipsizes. Not once shrunk: the fitted word fills its line by design.
    const last = lines[lines.length - 1]
    if (!words.length && !shrunk && rest.numberOfLines && lines.length === rest.numberOfLines && last && /^\S+$/.test(last.text.trim())) {
      words = [last.text.trim()]
    }
    if (!words.length) return
    // Still split once shrunk (a glyph rounding the width past the line): one more step, down to the floor.
    if (shrunk) return shrunk.size - SIZE_STEP >= base.fontSize ? setFit({ ...shrunk, size: shrunk.size - SIZE_STEP }) : undefined
    split.current = { key, words }
    measureIfSplit()
  }

  const handleMeasure = (e: TextLayoutEvent) => {
    if (!pending) return
    const widest = Math.max(...e.nativeEvent.lines.map((l) => l.width))
    const size = fittedSize(base, widest, pending.line)
    setPending(null)
    // Only ever smaller than drawn: a word that already fits at the scaled size is left as it is.
    if (size !== null && size < drawn) setFit({ key: pending.key, size })
  }

  const measuring = canShrink && !shrunk && pending?.key === key
  return (
    <>
      <Text
        {...rest}
        maxFontSizeMultiplier={cap}
        allowFontScaling={ownSize === null ? rest.allowFontScaling : false}
        style={[roleType, style, ownSize !== null && metricsAt(base, ownSize)]}
        onLayout={canShrink ? handleLayout : onLayout}
        onTextLayout={canShrink ? handleTextLayout : onTextLayout}
      >
        {children}
      </Text>
      {measuring ? (
        <Text
          testID="title-measure"
          allowFontScaling={false}
          maxFontSizeMultiplier={cap}
          numberOfLines={pending.words.length}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          pointerEvents="none"
          style={[MEASURED(flat), styles.measure]}
          onTextLayout={handleMeasure}
        >
          {pending.words.join('\n')}
        </Text>
      ) : null}
    </>
  )
}

/**
 * The same measured word fit for text that is not a title but must never split a word either: a person's name in a row (SCRUM-1041
 * ruling A, extended to names 2026-11-17: Android at font 2.0 drew "Marc-André Lefebv / re-Desrosiers"). Pass the row's role as
 * `variant` (`bodyStrong`, `rowTitle`, `heading`) and its cap; nothing else about the text changes, and no header role is implied.
 */
export const FitText = Title

/** Only what sets a glyph's width, at the role's 1× size. */
const MEASURED = (flat: TextStyle): TextStyle => ({
  fontFamily: flat.fontFamily,
  fontSize: flat.fontSize,
  letterSpacing: flat.letterSpacing,
  fontVariant: flat.fontVariant,
})

const styles = StyleSheet.create({
  measure: { position: 'absolute', left: 0, top: 0, width: MEASURE_WIDTH, opacity: 0 },
})

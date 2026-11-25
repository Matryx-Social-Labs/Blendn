import { StyleSheet, Text, View } from 'react-native'

import { RadialWash } from '../ui/GradientFill'
import { COLOR, FONT_FAMILY } from '../../lib/design/tokens'
import { dateStamp } from '../../lib/eventFacts'
import { tint } from '../../lib/theme'

/*
 * The date stamp (Flow 4 `stamp()`, flow4.css `.stamp`): weekday, day and month in Geist Mono on the sunken surface, a
 * hairline round it. It leads Going's rows (56) and the venue's Coming up rows (48), in place of a cover, so a missing
 * cover can never show. `lit`: the world's light from below with an ember rim (Next up with no cover); `past`: the day
 * dimmed. Text, read as "Tuesday 17 November". The type is the stamp's own art and scales with its size.
 */

/** The board's 56 pt stamp: 14 corners, 11/14 words, a 22/24 day. Every size is these times size / 56. */
const BASE = 56
// design-exception: the stamp's type is drawn to its box (`stamp()` in flow4.js): 11/14 and 22/24 at 56, scaled with it.
const ART = { radius: 14, word: 11, wordLine: 14, day: 22, dayLine: 24, track: 0.6 } as const
const LIGHT = [{ color: COLOR.brandOrange, alpha: 0.35, at: [50, 100] as const, size: [90, 90] as const, reach: 0.7 }]

export function DateStamp({ iso, timeZone, size = BASE, lit = false, past = false, testID }: { iso: string | null | undefined; timeZone?: string | null; size?: number; lit?: boolean; past?: boolean; testID?: string }) {
  const s = dateStamp(iso, timeZone)
  if (!s) return null
  const k = size / BASE
  const word = { fontFamily: FONT_FAMILY.mono[500], fontSize: Math.round(ART.word * k), lineHeight: Math.round(ART.wordLine * k), letterSpacing: ART.track }
  return (
    <View
      testID={testID}
      accessible
      accessibilityLabel={s.spoken}
      style={[styles.stamp, { width: size, height: size, borderRadius: Math.round(ART.radius * k) }, lit && styles.lit]}
    >
      {lit ? <RadialWash layers={LIGHT} style={StyleSheet.absoluteFill} /> : null}
      <Text maxFontSizeMultiplier={1} style={[word, lit ? styles.litWord : styles.word]}>{s.dow}</Text>
      <Text maxFontSizeMultiplier={1} style={[{ fontFamily: FONT_FAMILY.mono[700], fontSize: Math.round(ART.day * k), lineHeight: Math.round(ART.dayLine * k) }, past ? styles.word : styles.day]}>
        {s.dd}
      </Text>
      <Text maxFontSizeMultiplier={1} style={[word, lit ? styles.litWord : styles.word]}>{s.mon}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  stamp: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden', backgroundColor: COLOR.surfaceSunken, borderWidth: StyleSheet.hairlineWidth, borderColor: COLOR.hairlineStrong },
  lit: { borderWidth: 1, borderColor: tint(COLOR.brandOrange, 0.55) },
  word: { color: COLOR.textSecondary },
  litWord: { color: COLOR.selectionEmberGlyph },
  day: { color: COLOR.textPrimary },
})

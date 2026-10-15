import { StyleSheet, Text, View } from 'react-native'

import { COLOR, FONT_FAMILY, RADIUS, SIZE, SPACE } from '../../lib/design/tokens'
import { tint } from '../../lib/theme'
import { CONTROL_FONT_CAP, font, useBoldText } from './shared'

export type OverlapLabel = { text: string; shared?: boolean }

/** ROUND3 G4: labels on a card, 2 before a reveal and 4 after (admin `lib/matching.ts`). */
const LABELS_BEFORE_REVEAL = 2
const LABELS_AFTER_REVEAL = 4
/** Flow 14: a shared label is the chip with a 1.5 pt edge at 35% white in place of its hairline. */
const SHARED_EDGE = 1.5
const SHARED_ALPHA = 0.35
const HAIRLINE = 0.5

/**
 * What two people (or your side and a crew) share, as one sentence, never a
 * score (guidelines/components/OverlapLine.html, Flow 14 · 14.1, Delta R3-G).
 * Under the name on a card. `line` is the server's sentence ("You both picked
 * {a} over {b}", "Both from {state}", "Both here to make friends"): the face
 * line is `overlaps[0]`. The labels under it are capped at 2 before a reveal
 * and 4 after; the shared ones are outlined. A crew's line is crew-held (tags
 * and intent, never a member's interests). The icebreaker stays a proposal.
 *
 * Nothing at all when the server sends no line. No haptic, no motion: the line
 * is recomputed when the room changes. The card reads the sentence as its
 * hint.
 */
export function OverlapLine({
  line,
  labels = [],
  revealed = false,
  testID,
}: {
  line: string | null | undefined
  labels?: OverlapLabel[]
  revealed?: boolean
  testID?: string
}) {
  const bold = useBoldText()
  if (!line) return null
  const shown = labels.slice(0, revealed ? LABELS_AFTER_REVEAL : LABELS_BEFORE_REVEAL)
  return (
    <View testID={testID} style={styles.column}>
      <Text style={[font('bodyStrong', bold), styles.ink]}>{line}</Text>
      {shown.length ? (
        <View style={styles.labels}>
          {shown.map((l) => (
            <View
              key={l.text}
              testID={testID && `${testID}-label`}
              accessible
              accessibilityLabel={l.shared ? `${l.text}, shared` : l.text}
              style={[styles.label, l.shared ? styles.shared : styles.hairline]}
            >
              <Text maxFontSizeMultiplier={CONTROL_FONT_CAP} numberOfLines={1} style={[font('meta', bold, FONT_FAMILY.brand[500]), styles.ink]}>
                {l.text}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  column: { gap: SPACE.md },
  ink: { color: COLOR.textPrimary },
  labels: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm },
  label: { height: SIZE.tag, justifyContent: 'center', paddingHorizontal: SPACE.md, borderRadius: RADIUS.capsule, backgroundColor: COLOR.surface },
  hairline: { borderWidth: HAIRLINE, borderColor: COLOR.hairline },
  shared: { borderWidth: SHARED_EDGE, borderColor: tint(COLOR.textPrimary, SHARED_ALPHA) },
})

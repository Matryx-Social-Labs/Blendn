import { forwardRef } from 'react'
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import Animated, { Easing, FadeIn } from 'react-native-reanimated'

import { Avatar } from '../ds/Avatar'
import { RadioRing } from '../ds/PlanCard'
import { font, quickTransition, useBoldText, useSelection } from '../ds/shared'
import { EventCover } from '../EventCover'
import { Icon } from '../ui/Icon'
import { COLOR, DURATION, EASING, FONT_FAMILY, MAX_FONT_SCALE, RADIUS, SIZE, SPACE } from '../../lib/design/tokens'
import { H } from '../../lib/haptics'
import type { PeerRatingIssue } from '../../lib/apiClient'

/*
 * The rows of Rate (Flow 4 `rate`, rose): the night or the person being rated, the issues as a radio list, and the
 * "Sent" line that answers the night's one tap. Drawn as the board draws them (flow4.css `.rev`, `.ro`, `.sent`).
 */

// design-exception: the board's row card is radius 20 with 10 inside (`.rev`), between the scale's 16/24 and 8/12
const ROW_RADIUS = 20
const ROW_PAD = 10
// design-exception: the cover thumb's corner is 12 (`.th56`), between `thumb` 8 and `rowInCard` 16
const THUMB_RADIUS = 12
/** An issue is 16/22 regular (`.ro`): `button`'s 16 at 400. It pads 14 at the sides. */
// design-exception: the line is 22, `button`'s is 20
const ISSUE_TYPE = { lineHeight: 22 }
// design-exception: 14 at the sides (`.ro`), between the 12 and 16 steps
const ISSUE_PAD = 14
// design-exception: the "Sent" check is 18 (`.sent`), between the inline 16 and control 20 icons
const SENT_ICON = 18
const RIM = 1
/** The accessibility text sizes (iOS AX1 is 1.8×; Android's largest steps start at 1.5×): a one-line name wraps from here. */
const WRAP_FROM_SCALE = 1.5
const FILL = quickTransition('backgroundColor', 'borderColor')
const SENT_IN = FadeIn.duration(DURATION.base).easing(Easing.bezier(...EASING.entrance))

/** The night being rated: its cover (or category plate) as a 56 pt thumb, the title in two lines, its day and venue. */
export function EventRow({
  title,
  day,
  venue,
  cover,
  category,
}: {
  title: string
  /** "Sat 8 Nov", in the event's own zone. */
  day: string
  venue: string | null
  cover: string | null
  category?: string
}) {
  const bold = useBoldText()
  return (
    <View testID="rate-event" accessible accessibilityLabel={[title, day, venue].filter(Boolean).join(', ')} style={styles.row}>
      <View style={styles.thumb}>
        <EventCover uri={cover} height={SIZE.primary} radius={THUMB_RADIUS} category={category} />
      </View>
      <View style={styles.text}>
        <Text testID="rate-event-title" numberOfLines={2} maxFontSizeMultiplier={MAX_FONT_SCALE.bodyStrong} style={[font('rowTitle', bold), styles.ink]}>
          {title}
        </Text>
        {day ? (
          <Text testID="rate-event-day" numberOfLines={1} maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), styles.secondary]}>
            {day}
          </Text>
        ) : null}
        {venue ? (
          <Text testID="rate-event-venue" numberOfLines={1} maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), styles.secondary]}>
            {venue}
          </Text>
        ) : null}
      </View>
    </View>
  )
}

/**
 * The person being rated: their face (or their creature) at 56 pt, the name they are known by in one line, and why they
 * are here. A header, and the card's focus target (M5): read as "<name>. You matched at this event".
 */
export const PersonRow = forwardRef<View, { name: string; photo: string | null }>(function PersonRow({ name, photo }, ref) {
  const bold = useBoldText()
  // One line as the board draws it; at the accessibility sizes, two, so the largest text still says who this is.
  const lines = useWindowDimensions().fontScale >= WRAP_FROM_SCALE ? 2 : 1
  return (
    <View ref={ref} testID="rate-person" accessible accessibilityRole="header" accessibilityLabel={`${name}. You matched at this event`} style={styles.row}>
      {photo ? <Avatar kind="photo" uri={photo} size={SIZE.primary} label={name} /> : <Avatar kind="creature" pseudonym={name} size={SIZE.primary} label={name} />}
      <View style={styles.text}>
        <Text testID="rate-person-name" numberOfLines={lines} maxFontSizeMultiplier={MAX_FONT_SCALE.bodyStrong} style={[font('rowTitle', bold), styles.ink]}>
          {name}
        </Text>
        <Text numberOfLines={lines} maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), styles.secondary]}>
          You matched at this event
        </Text>
      </View>
    </View>
  )
})

/** The issues, one radio list (`.rr`): each a 48 pt row, the pick lit in the hue. Harassment is a row, never a scale value. */
export function IssueList({
  options,
  value,
  onChoose,
}: {
  options: readonly { value: PeerRatingIssue; label: string }[]
  value: PeerRatingIssue
  onChoose: (value: PeerRatingIssue) => void
}) {
  const bold = useBoldText()
  const sel = useSelection()
  return (
    <View testID="rate-issues" accessibilityRole="radiogroup" accessibilityLabel="Did anything go wrong?" style={styles.issues}>
      {options.map((opt) => {
        const selected = value === opt.value
        return (
          <Pressable
            key={opt.value}
            testID={`rate-issue-${opt.value}`}
            accessibilityRole="radio"
            accessibilityLabel={opt.label}
            accessibilityState={{ checked: selected }}
            onPress={() => {
              if (selected) return
              H.select()
              onChoose(opt.value)
            }}
            style={[styles.issue, selected ? { backgroundColor: sel.fill, borderColor: sel.edge } : styles.issueRest, FILL]}
          >
            <RadioRing selected={selected} compact />
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE.body} style={[font('button', bold, FONT_FAMILY.brand[400]), ISSUE_TYPE, styles.ink, styles.fill]}>
              {opt.label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

/** "Sent. Only we see this.", in place under the scale once the night's tap has landed (IKEA): faded in, never celebrated. */
export function SentLine() {
  const bold = useBoldText()
  const sel = useSelection()
  return (
    <Animated.View testID="rate-sent" entering={SENT_IN} accessibilityLiveRegion="polite" style={styles.sent}>
      <Icon name="check" size={SENT_ICON} color={sel.glyph} active />
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE.bodyStrong} style={[font('control', bold), styles.ink, styles.fill]}>
        Sent. Only we see this.
      </Text>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
    padding: ROW_PAD,
    borderRadius: ROW_RADIUS,
    backgroundColor: COLOR.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLOR.hairline,
  },
  thumb: { width: SIZE.primary, height: SIZE.primary },
  text: { flex: 1, minWidth: 0, gap: SPACE.xxs },
  issues: { gap: SPACE.sm },
  issue: {
    minHeight: SIZE.control,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
    paddingHorizontal: ISSUE_PAD,
    paddingVertical: SPACE.xs,
    borderRadius: RADIUS.rowInCard,
    borderWidth: RIM,
  },
  issueRest: { backgroundColor: COLOR.surface, borderColor: 'transparent' },
  sent: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  fill: { flex: 1 },
  ink: { color: COLOR.textPrimary },
  secondary: { color: COLOR.textSecondary },
})

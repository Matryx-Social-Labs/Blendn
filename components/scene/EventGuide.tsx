import type { ReactNode } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'

import { font, useBoldText, useLargeText } from '../ds/shared'
import { Icon, type IconName } from '../ui/Icon'
import { COLOR, FONT_FAMILY, ICON, MATERIAL, MAX_FONT_SCALE, RADIUS, SPACE } from '../../lib/design/tokens'

/*
 * At the largest text a row's lines grow as the board's `.ax .gdt` does: the first as body, the second as meta (2×).
 *
 * Flow 4 E-B's facts (`flow4.js` guide, plain): what were four tiles, as three rows with one action each (Shazam's Concert
 * Guide, Partiful's facts). When + Add to calendar, Where + Directions, Who. Each row is one element to a screen reader,
 * its action a custom action. Variable lines each keep their own slot: the venue wraps to two lines, the area and the
 * host ellipsize.
 */

/** `.guide.plain .gd`: 56 at least. */
const ROW_MIN = SPACE.xxxl + SPACE.sm
// design-exception: the board's row glyph is 22 (`ic(icon,22)`) and sits 14 from its words (`.gd` gap); both off-scale.
const GLYPH = 22
const GLYPH_GAP = 14
// design-exception: the board pads a plain row 6 above and below (`.guide.plain .gd`).
const ROW_PAD = 6
/** `.ga`: a 40 pt circle on the glass fill. */
const ACTION = SPACE.xxl + SPACE.sm

export type GuideAction = { label: string; icon: IconName; onPress: () => void; testID?: string }

function GuideRow({
  icon,
  first,
  second,
  label,
  firstLines,
  action,
  testID,
}: {
  icon: IconName
  first: ReactNode
  second?: ReactNode
  /** The row as one sentence. */
  label: string
  firstLines: number
  action?: GuideAction
  testID?: string
}) {
  const bold = useBoldText()
  const large = useLargeText()
  return (
    <View
      testID={testID}
      accessible
      accessibilityLabel={label}
      accessibilityActions={action ? [{ name: 'activate', label: action.label }] : undefined}
      onAccessibilityAction={action ? () => action.onPress() : undefined}
      style={styles.row}
    >
      {large ? null : <Icon name={icon} size={GLYPH} color={COLOR.textPrimary} />}
      <View style={styles.words}>
        <Text numberOfLines={large ? undefined : firstLines} maxFontSizeMultiplier={MAX_FONT_SCALE.body} style={[font('rowTitle', bold), styles.ink]}>
          {first}
        </Text>
        {second ? (
          <Text numberOfLines={large ? undefined : 1} maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), styles.secondary]}>
            {second}
          </Text>
        ) : null}
      </View>
      {action && !large ? (
        <Pressable
          testID={action.testID}
          onPress={action.onPress}
          accessibilityRole="button"
          accessibilityLabel={action.label}
          hitSlop={SPACE.xs}
          style={({ pressed }) => [styles.action, pressed && styles.pressed]}
        >
          <Icon name={action.icon} size={ICON.control} color={COLOR.textPrimary} />
        </Pressable>
      ) : null}
    </View>
  )
}

// Inside a capped line: the line's cap holds (a nested Text takes its parent's).
const Mono = ({ children }: { children: ReactNode }) => <Text maxFontSizeMultiplier={MAX_FONT_SCALE.body} style={styles.mono}>{children}</Text>

export function EventGuide({
  when,
  where,
  who,
  testID = 'scene-guide',
}: {
  when: { day: string; time: string | null; until: string | null; add?: GuideAction }
  where: { venue: string; area: string | null; distance: string | null; directions?: GuideAction } | null
  who: { count: string | null; word: string; facts: readonly string[]; first: boolean; host: string | null } | null
  testID?: string
}) {
  const whoWords = who ? (who.first ? 'Be one of the first' : [who.count ? `${who.count} ${who.word}` : null, ...who.facts].filter(Boolean).join(' · ')) : ''
  const hostLine = who?.host ? `By ${who.host}` : null
  return (
    <View testID={testID}>
      <GuideRow
        testID={`${testID}-when`}
        icon="calendar"
        firstLines={2}
        first={
          when.time ? (
            <>
              {when.day} · <Mono>{when.time}</Mono>
            </>
          ) : (
            when.day
          )
        }
        second={when.until}
        label={[when.time ? `${when.day}, ${when.time}` : when.day, when.until].filter(Boolean).join('. ')}
        action={when.add}
      />
      {where ? (
        <GuideRow
          testID={`${testID}-where`}
          icon="map-pin"
          firstLines={2}
          first={where.venue}
          second={
            where.area || where.distance ? (
              <>
                {where.area}
                {where.area && where.distance ? ' · ' : null}
                {where.distance ? <Mono>{where.distance}</Mono> : null}
              </>
            ) : null
          }
          label={[where.venue, where.area, where.distance ? `${where.distance} away` : null].filter(Boolean).join('. ')}
          action={where.directions}
        />
      ) : null}
      {who && (whoWords || hostLine) ? (
        <GuideRow
          testID={`${testID}-who`}
          icon="users"
          firstLines={2}
          first={
            who.count && !who.first ? (
              <>
                <Mono>{who.count}</Mono> {who.word}
                {who.facts.map((f) => ` · ${f}`).join('')}
              </>
            ) : (
              whoWords
            )
          }
          second={hostLine}
          label={[whoWords, hostLine].filter(Boolean).join('. ')}
        />
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: GLYPH_GAP, minHeight: ROW_MIN, paddingVertical: ROW_PAD },
  words: { flex: 1, minWidth: 0 },
  action: { width: ACTION, height: ACTION, borderRadius: RADIUS.capsule, backgroundColor: MATERIAL.fillOnGlass, alignItems: 'center', justifyContent: 'center' },
  pressed: { backgroundColor: COLOR.hairlineStrong },
  mono: { fontFamily: FONT_FAMILY.mono[500] },
  ink: { color: COLOR.textPrimary },
  secondary: { color: COLOR.textSecondary },
})

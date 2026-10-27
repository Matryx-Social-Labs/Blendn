import { Fragment } from 'react'
import { StyleSheet, View } from 'react-native'

import { LookingForCard } from '../ds/LookingForCard'
import { SPACE } from '../../lib/design/tokens'

/**
 * "Why you go out" as the design system's picture tiles, two across, one choice (Flow 2 preferences 01; round 4 2.1,
 * "'Looking for' becomes intent"). The values are the server's `intent_default` enum, so the answer reaches matching and
 * the Board's "complete profile" gate rather than sitting in free text.
 *
 * The frame draws these as image tiles rather than chips, and the difference is doing work: five words in a row of pills is
 * a form, five pictures is a question about how you want to spend an evening.
 *
 * Images are committed rather than linked: Figma's URLs expire in about a week, so a build referencing one loses its artwork
 * seven days later.
 */
export type Intent = 'dating' | 'friendship' | 'networking' | 'just_here'

export const LOOKING_FOR_OPTIONS: readonly { value: Intent; label: string; art: number }[] = [
  { value: 'dating', label: 'Dating', art: require('../../assets/onboarding/looking-dating.jpg') },
  { value: 'friendship', label: 'Friendship', art: require('../../assets/onboarding/looking-friendship.jpg') },
  { value: 'networking', label: 'Networking', art: require('../../assets/onboarding/looking-networking.jpg') },
  { value: 'just_here', label: 'Just here for the event', art: require('../../assets/onboarding/looking-open.jpg') },
]

/** Each intent's tile word, for the places that say it back (the review step). */
export const INTENT_LABELS: Readonly<Record<Intent, string>> = Object.fromEntries(
  LOOKING_FOR_OPTIONS.map((option) => [option.value, option.label])
) as Record<Intent, string>

/** Two to a row. */
const PER_ROW = 2

export function LookingForCards({
  selected,
  onSelect,
  withoutDating = false,
}: {
  selected: Intent | null
  onSelect: (value: Intent) => void
  /** Under 18: dating is refused, so it is not offered (SCRUM-294). Not disabled: a minor never sees it. */
  withoutDating?: boolean
}) {
  const options = withoutDating ? LOOKING_FOR_OPTIONS.filter((option) => option.value !== 'dating') : LOOKING_FOR_OPTIONS
  const rows = Array.from({ length: Math.ceil(options.length / PER_ROW) }, (_, i) => options.slice(i * PER_ROW, (i + 1) * PER_ROW))
  return (
    <View style={styles.grid}>
      {rows.map((row) => (
        <View key={row[0].value} style={styles.row}>
          {row.map((option) => (
            <Fragment key={option.value}>
              <LookingForCard
                label={option.label}
                image={option.art}
                selected={selected === option.value}
                onPress={() => onSelect(option.value)}
                testID={`looking-for-${option.value}`}
              />
            </Fragment>
          ))}
          {/* An odd tile keeps its half of the row. */}
          {row.length < PER_ROW ? <View style={styles.filler} /> : null}
        </View>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  grid: { gap: SPACE.md },
  row: { flexDirection: 'row', gap: SPACE.md },
  filler: { flex: 1 },
})

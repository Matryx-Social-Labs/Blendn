import { Fragment } from 'react'
import { StyleSheet, View } from 'react-native'

import { LookingForCard } from '../ds/LookingForCard'
import { SPACE } from '../../lib/design/tokens'

/**
 * "What brings you to Blend'n today?" as the design system's picture tiles, two across (Flow 2 preferences 01).
 *
 * The frame draws these as image tiles rather than chips, and the difference is doing work: five words in a row of pills is
 * a form, five pictures is a question about how you want to spend an evening.
 *
 * Images are committed rather than linked: Figma's URLs expire in about a week, so a build referencing one loses its artwork
 * seven days later.
 */
export const LOOKING_FOR_OPTIONS = [
  { value: 'Dating', art: require('../../assets/onboarding/looking-dating.jpg') },
  { value: 'Friendship', art: require('../../assets/onboarding/looking-friendship.jpg') },
  { value: 'Networking', art: require('../../assets/onboarding/looking-networking.jpg') },
  { value: 'Travel', art: require('../../assets/onboarding/looking-travel.jpg') },
  { value: 'Open', art: require('../../assets/onboarding/looking-open.jpg') },
]

/** Two to a row. */
const PER_ROW = 2

export function LookingForCards({
  selected,
  onToggle,
  withoutDating = false,
}: {
  selected: readonly string[]
  onToggle: (value: string) => void
  /** Under 18: dating is refused, so it is not offered (SCRUM-294). Not disabled: a minor never sees it. */
  withoutDating?: boolean
}) {
  const options = withoutDating ? LOOKING_FOR_OPTIONS.filter((option) => option.value !== 'Dating') : LOOKING_FOR_OPTIONS
  const rows = Array.from({ length: Math.ceil(options.length / PER_ROW) }, (_, i) => options.slice(i * PER_ROW, (i + 1) * PER_ROW))
  return (
    <View style={styles.grid}>
      {rows.map((row) => (
        <View key={row[0].value} style={styles.row}>
          {row.map((option) => (
            <Fragment key={option.value}>
              <LookingForCard
                label={option.value}
                image={option.art}
                selected={selected.includes(option.value)}
                onPress={() => onToggle(option.value)}
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

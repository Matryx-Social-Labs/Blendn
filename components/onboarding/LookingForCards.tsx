import { StyleSheet, View } from 'react-native'

import { LookingForCard } from '../ds/LookingForCard'
import { RadioCard } from '../ds/RadioCard'
import { INTENTS, type Intent } from '../profile/MatchingFields'
import { SPACE } from '../../lib/design/tokens'

/**
 * "What brings you out?" (direction A): Edit profile's intents, in its words (`INTENTS`), so onboarding and the editor write
 * the same `intent_default` values. Friendship and Networking are photo tiles in one row, half the width each, either or both;
 * "Just here" (no matching) is the plain answer under them, and it is exclusive (`toggleIntent`: the server refuses the mix).
 * No Dating tile: dating is not an intent in 1.0 (register D-002).
 *
 * Images are committed rather than linked: Figma's URLs expire in about a week, so a build referencing one loses its artwork
 * seven days later.
 */

export type { Intent }

const ART: Record<Exclude<Intent, 'just_here'>, number> = {
  friendship: require('../../assets/onboarding/looking-friendship.jpg'),
  networking: require('../../assets/onboarding/looking-networking.jpg'),
}
/** The tiles, in the step's order. */
const TILES: readonly Exclude<Intent, 'just_here'>[] = ['friendship', 'networking']
const labelOf = (value: Intent) => INTENTS.find((i) => i.value === value)
const JUST_HERE = labelOf('just_here')

export function LookingForCards({ selected, onToggle }: { selected: readonly Intent[]; onToggle: (value: Intent) => void }) {
  return (
    <View style={styles.list}>
      <View style={styles.row}>
        {TILES.map((value) => (
          <LookingForCard
            key={value}
            label={labelOf(value)?.label ?? value}
            image={ART[value]}
            selected={selected.includes(value)}
            onPress={() => onToggle(value)}
            testID={`looking-for-${value}`}
          />
        ))}
      </View>
      <RadioCard
        title={JUST_HERE?.label ?? 'Just here'}
        hint={JUST_HERE?.hint}
        deselectable
        selected={selected.includes('just_here')}
        onPress={() => onToggle('just_here')}
        testID="looking-for-just_here"
      />
    </View>
  )
}

const styles = StyleSheet.create({
  list: { gap: SPACE.md },
  // A row, so each tile's own `flex: 1` takes half the width.
  row: { flexDirection: 'row', gap: SPACE.sm },
})

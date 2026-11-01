import { StyleSheet, View } from 'react-native'

import { LookingForCard } from '../ds/LookingForCard'
import { RadioCard } from '../ds/RadioCard'
import { SPACE } from '../../lib/design/tokens'

/**
 * "What brings you out?" (direction A, the flow walk's "friends, networking, both"): two photo cards, one under the other, and
 * "Both, depends on the night" as a plain third. The values are the server's `intent_default` enum, so the answer reaches
 * matching and the Board's "complete profile" gate rather than sitting in free text. Dating and "just here for the event"
 * are not asked here; Edit profile offers all four.
 *
 * Images are committed rather than linked: Figma's URLs expire in about a week, so a build referencing one loses its artwork
 * seven days later.
 */

export type Intent = 'dating' | 'friendship' | 'networking' | 'just_here'
/** The step's three answers. */
export type Outing = 'friendship' | 'networking' | 'both'

const CARDS: readonly { value: Exclude<Outing, 'both'>; label: string; art: number }[] = [
  { value: 'friendship', label: 'Making friends', art: require('../../assets/onboarding/looking-friendship.jpg') },
  { value: 'networking', label: 'Networking', art: require('../../assets/onboarding/looking-networking.jpg') },
]

/** What an answer stores. */
export function intentsOf(outing: Outing): Intent[] {
  return outing === 'both' ? ['friendship', 'networking'] : [outing]
}

/** The answer a stored list reads as, or `null` when it holds something this step does not offer (dating, just here). */
export function outingOf(intents: readonly Intent[] | undefined): Outing | null {
  const set = new Set(intents ?? [])
  if (set.size === 2 && set.has('friendship') && set.has('networking')) return 'both'
  if (set.size === 1 && (set.has('friendship') || set.has('networking'))) return [...set][0] as Outing
  return null
}

export function LookingForCards({ selected, onSelect }: { selected: Outing | null; onSelect: (value: Outing) => void }) {
  return (
    <View style={styles.list}>
      {CARDS.map((card) => (
        // A row, so the card's own `flex: 1` takes the width rather than a share of an unmeasured height.
        <View key={card.value} style={styles.row}>
          <LookingForCard
            label={card.label}
            image={card.art}
            selected={selected === card.value}
            onPress={() => onSelect(card.value)}
            testID={`looking-for-${card.value}`}
          />
        </View>
      ))}
      <RadioCard title="Both, depends on the night" selected={selected === 'both'} onPress={() => onSelect('both')} testID="looking-for-both" />
    </View>
  )
}

const styles = StyleSheet.create({
  list: { gap: SPACE.md },
  row: { flexDirection: 'row' },
})

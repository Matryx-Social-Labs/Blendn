import { useEffect, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import {
  EmberChip,
  EmberChipRow,
  EmberField,
  EmberFieldGroup,
} from '../../components/onboarding/EmberControls'
import { OnboardingScreen } from '../../components/onboarding/OnboardingScreen'
import { apiClient } from '../../lib/apiClient'
import { toPickerTree, type CategoryGroup, type CategoryNode } from '../../lib/categories'
import { EMBER, EMBER_RADIUS, EMBER_TYPE } from '../../lib/theme'
import { useOnboarding } from '../../lib/useOnboarding'

/**
 * Writing prompts, not a feature — they exist to unstick a blank textarea,
 * so tapping one is not wired to anything. Copy is the frame's own.
 */
const BIO_PROMPTS = [
  'A perfect Sunday involves curated playlists and vintage bookstore hopping.',
  'Currently mastering the art of the perfect pour-over coffee.',
  'I thrive at the intersection of technology and human connection.',
]

/**
 * Step six — interests, and a few sentences about yourself.
 *
 * The interest chips in the frame are invented labels — Web3, AI Synthesis,
 * Ceramics — grouped under headings that do not exist. The real list is the
 * server's category tree, the same one the event feed and matching read, and
 * that is what this renders. An interest typed into the client is an interest
 * nothing can ever match on: `profiles.interests` was free text and "Software"
 * versus "software engineering" never met, which took two PRs to unpick.
 *
 * `toPickerTree` is reused rather than reimplemented — it already handles the
 * childless-parent case, where a top-level category with no leaves has to
 * contribute itself or a whole branch silently disappears from the picker.
 */

const BIO_LIMIT = 300

export default function DetailsScreen() {
  const { draft, loaded, saving, commit, skip, goBack } = useOnboarding('details')

  const [groups, setGroups] = useState<CategoryGroup[]>([])
  /*
   * Names and ids, together.
   *
   * The picker has had `item.id` all along and this screen toggled on
   * `item.name` alone — so onboarding wrote `profiles.interests` (the free-text
   * array every surface renders) and never a single `user_interests` row (the
   * graph every decision reads). Measured on staging: the two sets were
   * disjoint, and nobody who completed onboarding could post on the board.
   */
  const [interests, setInterests] = useState<string[]>([])
  const [interestIds, setInterestIds] = useState<string[]>([])
  const [bio, setBio] = useState('')

  useEffect(() => {
    if (!loaded) return
    setInterests(draft.interests ?? [])
    setInterestIds(draft.interestIds ?? [])
    setBio(draft.bio ?? '')
  }, [loaded]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    apiClient.getCategories().then((result) => {
      if (result.success && result.data) {
        setGroups(toPickerTree(result.data as unknown as CategoryNode[]))
      }
    })
  }, [])

  const toggle = (id: string, name: string) => {
    setInterests((current) =>
      current.includes(name) ? current.filter((i) => i !== name) : [...current, name]
    )
    setInterestIds((current) =>
      current.includes(id) ? current.filter((i) => i !== id) : [...current, id]
    )
  }

  return (
    <OnboardingScreen
      step="details"
      title="The finer "
      titleAccent="details"
      subtitle="Tell the circle who you are beyond the profile picture. Light up your presence."
      ctaLabel="Complete Profile"
      ctaBusy={saving}
      onContinue={() => void commit({ interests, interestIds, bio: bio.trim() })}
      secondaryLabel="Skip"
      onSecondary={() => void skip()}
      onBack={goBack}
    >
      {/*
        Before the interest chips, not after.
        
        The chips are a long, scrolling wall of choices; a text field below them
        is a field most people never reach. This is also the more personal
        question, and asking it first means it gets answered while attention is
        still fresh.
      */}
      <EmberField
        label="About me"
        placeholder="Ask me about… surprise experiences, the best hidden coffee in the city, or the recent obsession with blockchain architecture."
        helper={`${bio.length}/${BIO_LIMIT}`}
        value={bio}
        onChangeText={(text) => setBio(text.slice(0, BIO_LIMIT))}
        multiline
        maxLength={BIO_LIMIT}
        style={styles.bio}
      />

      <View style={styles.prompts}>
        {BIO_PROMPTS.map((prompt) => (
          <View key={prompt} style={styles.promptCard}>
            <Text style={styles.promptText}>&ldquo;{prompt}&rdquo;</Text>
          </View>
        ))}
      </View>

      {groups.map((group) => (
        <EmberFieldGroup key={group.id} label={group.name}>
          <EmberChipRow pack>
            {group.items.map((item) => (
              <EmberChip
                key={item.id}
                label={item.name}
                selected={interests.includes(item.name)}
                onPress={() => toggle(item.id, item.name)}
              />
            ))}
          </EmberChipRow>
        </EmberFieldGroup>
      ))}


    </OnboardingScreen>
  )
}

const styles = StyleSheet.create({
  bio: {
    height: 160,
    borderRadius: EMBER_RADIUS.card,
    paddingTop: 20,
    paddingBottom: 20,
    textAlignVertical: 'top',
  },
  prompts: { gap: 12 },
  promptCard: {
    backgroundColor: EMBER.surfaceMedia,
    borderLeftWidth: 4,
    borderLeftColor: 'rgba(255,144,109,0.4)',
    borderRadius: EMBER_RADIUS.card,
    paddingVertical: 16,
    paddingHorizontal: 20,
  },
  promptText: { ...EMBER_TYPE.helper, fontSize: 14, color: EMBER.textSecondary, lineHeight: 22 },
})

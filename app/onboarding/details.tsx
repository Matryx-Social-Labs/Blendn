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
import { previousStep } from '../../lib/onboarding'
import { EMBER, EMBER_RADIUS, EMBER_TYPE } from '../../lib/theme'
import { useOnboarding } from '../../lib/useOnboarding'

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

const BIO_LIMIT = 500

export default function DetailsScreen() {
  const { draft, loaded, saving, commit, skip, goTo } = useOnboarding('details')

  const [groups, setGroups] = useState<CategoryGroup[]>([])
  const [interests, setInterests] = useState<string[]>([])
  const [bio, setBio] = useState('')

  useEffect(() => {
    if (!loaded) return
    setInterests(draft.interests ?? [])
    setBio(draft.bio ?? '')
  }, [loaded]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    apiClient.getCategories().then((result) => {
      if (result.success && result.data) {
        setGroups(toPickerTree(result.data as unknown as CategoryNode[]))
      }
    })
  }, [])

  const toggle = (name: string) =>
    setInterests((current) =>
      current.includes(name) ? current.filter((i) => i !== name) : [...current, name]
    )

  return (
    <OnboardingScreen
      step="details"
      title="The finer "
      titleAccent="details"
      subtitle="Tell the circle who you are beyond the profile picture. Light up your presence."
      ctaLabel="Complete Profile"
      ctaBusy={saving}
      onContinue={() => void commit({ interests, bio: bio.trim() })}
      secondaryLabel="Skip"
      onSecondary={() => void skip()}
      onBack={() => goTo(previousStep('details')!)}
    >
      {groups.map((group) => (
        <EmberFieldGroup key={group.id} label={group.name}>
          <EmberChipRow>
            {group.items.map((item) => (
              <EmberChip
                key={item.id}
                label={item.name}
                selected={interests.includes(item.name)}
                onPress={() => toggle(item.name)}
              />
            ))}
          </EmberChipRow>
        </EmberFieldGroup>
      ))}

      <EmberFieldGroup label="About me">
        <EmberField
          label="About me"
          placeholder="Ask me about… surprise experiences, the best hidden coffee in the city, or the recent obsession with blockchain architecture."
          value={bio}
          onChangeText={(text) => setBio(text.slice(0, BIO_LIMIT))}
          multiline
          maxLength={BIO_LIMIT}
          style={styles.bio}
        />
        {/*
         * A live count rather than a silent truncation at the limit. The field
         * caps at 500 to match the API, and someone typing past it with no
         * indication would think the keyboard had stopped working.
         */}
        <View style={styles.counterRow}>
          <Text style={styles.counter}>
            {bio.length}/{BIO_LIMIT}
          </Text>
        </View>
      </EmberFieldGroup>
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
  counterRow: { alignItems: 'flex-end' },
  counter: { ...EMBER_TYPE.helper, color: EMBER.textTertiary },
})

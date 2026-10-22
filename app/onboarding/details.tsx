import { useCallback, useEffect, useState } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'

import { Chip } from '../../components/ds/Chip'
import { ChipSet } from '../../components/ds/ChipSet'
import { monoCaption } from '../../components/ds/MonoFamily'
import { TextArea } from '../../components/ds/TextField'
import { font, useBoldText } from '../../components/ds/shared'
import { MAX_INTERESTS } from '../../components/InterestPicker'
import { ListLoadState, type ListStatus } from '../../components/onboarding/ListLoadState'
import { OnboardingScreen } from '../../components/onboarding/OnboardingScreen'
import { apiClient } from '../../lib/apiClient'
import { toPickerTree, type CategoryGroup, type CategoryNode } from '../../lib/categories'
import { COLOR, SPACE } from '../../lib/design/tokens'
import { Logger } from '../../lib/logger'
import { bioWithPrompt, promptFits } from '../../lib/onboarding'
import { useOnboarding } from '../../lib/useOnboarding'
import { overCapMessage, PROFILE_LIMITS, serverLength } from '../../lib/profileLimits'

/**
 * Writing prompts: they exist to unstick a blank textarea, so a tap puts one in it. The frame's were filler ("I thrive
 * at the intersection of technology and human connection"); these are the
 * kind of line a stranger at an event can actually open with.
 */
const BIO_PROMPTS = ['A perfect Sunday for me is…', 'Lately I’ve been learning…', 'Ask me about…']

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

/**
 * 500, the server's cap (`lib/validations/profile.ts` on the API) and
 * `edit-profile.tsx`'s. This was 300 for a while to match a frame, with the
 * other two left at 500 — so a bio written on the profile screen opened here
 * reading "412/300" and was cut on the first keystroke (SCRUM-185). One
 * number, and the server owns it.
 */
const BIO_LIMIT = PROFILE_LIMITS.bio
const bioOverCap = overCapMessage(BIO_LIMIT)

export default function DetailsScreen() {
  const { draft, loaded, saving, commit, skip, goBack } = useOnboarding('details')
  const bold = useBoldText()

  const [groups, setGroups] = useState<CategoryGroup[]>([])
  const [groupsStatus, setGroupsStatus] = useState<ListStatus>('loading')
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

  // Prefilled once, in the render that first sees `loaded`.
  const [prefilled, setPrefilled] = useState(false)
  if (loaded && !prefilled) {
    setPrefilled(true)
    setInterests(draft.interests ?? [])
    setInterestIds(draft.interestIds ?? [])
    setBio(draft.bio ?? '')
  }

  const loadGroups = useCallback(async () => {
    setGroupsStatus('loading')
    try {
      const result = await apiClient.getCategories()
      if (result.success && result.data) {
        setGroups(toPickerTree(result.data as unknown as CategoryNode[]))
        setGroupsStatus('ready')
        return
      }
      Logger.warn('profile', 'Interest categories did not load', { error: result.error })
    } catch (error) {
      Logger.warn('profile', 'Interest categories threw', { error })
    }
    setGroupsStatus('error')
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the fetch's own loading flag
    void loadGroups()
  }, [loadGroups])

  /*
   * The server holds at most ten (`MAX_INTERESTS`): an eleventh was refused after Continue, as "Couldn't save your
   * interests". So the picker stops at ten, dims the rest and says so, rather than finding out on the way out.
   */
  const atCap = interestIds.length >= MAX_INTERESTS
  const toggle = (id: string, name: string) => {
    if (!interestIds.includes(id) && atCap) return
    setInterests((current) => (current.includes(name) ? current.filter((i) => i !== name) : [...current, name]))
    setInterestIds((current) => (current.includes(id) ? current.filter((i) => i !== id) : [...current, id]))
  }

  /*
   * Never cut for the person: a paste past the cap stays on screen, says by how much, and Continue waits. The cap is the
   * server's (`BIO_LIMIT`); a silent slice used to throw the end of a pasted paragraph away.
   */
  const overCap = serverLength(bio) > BIO_LIMIT

  return (
    <OnboardingScreen
      step="details"
      title="The finer "
      titleAccent="details"
      subtitle="A few lines about you and what you’re into. It’s what people read before they say hello."
      ctaLabel="Continue"
      ctaBusy={saving}
      ctaDisabled={overCap}
      onContinue={() => void commit({ interests, interestIds, bio: bio.trim() })}
      secondaryLabel="Skip"
      onSecondary={() => void skip()}
      onBack={goBack}
    >
      {(reveal) => (
        <>
          {/*
        Before the interest chips, not after.

        The chips are a long, scrolling wall of choices; a text field below them
        is a field most people never reach. This is also the more personal
        question, and asking it first means it gets answered while attention is
        still fresh.
      */}
          <View style={styles.bio}>
            <TextArea
              label="About me"
              placeholder="Ask me about… the best coffee in the city, a trip I’m planning, or what I’m reading."
              value={bio}
              onChangeText={setBio}
              limit={BIO_LIMIT}
              // The server's `max(500)` counts UTF-16 units of the trimmed text, not what a person sees as characters.
              measure={serverLength}
              error={overCap ? bioOverCap : undefined}
              testID="onboarding-bio"
              {...reveal}
            />
            {/* A tap puts the prompt in the bio (H.select, the chip's). */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.prompts}
            >
              {BIO_PROMPTS.map((prompt) => (
                <Chip
                  key={prompt}
                  label={prompt}
                  icon="plus"
                  dimmed={!promptFits(bio, prompt, BIO_LIMIT)}
                  onPress={() => setBio((current) => bioWithPrompt(current, prompt, BIO_LIMIT))}
                  testID={`onboarding-prompt-${prompt.slice(0, 6)}`}
                />
              ))}
            </ScrollView>
          </View>

          <View style={styles.interests}>
            <View style={styles.interestsHead}>
              <Text accessibilityRole="header" style={[font('heading', bold), styles.heading]}>
                Interests
              </Text>
              <Text
                accessibilityLabel={`${interestIds.length} of ${MAX_INTERESTS} chosen`}
                style={[monoCaption(bold), { color: atCap ? COLOR.warning : COLOR.textSecondary }]}
              >
                {`${interestIds.length} of ${MAX_INTERESTS}`}
              </Text>
            </View>

            {groupsStatus !== 'ready' ? <ListLoadState status={groupsStatus} what="interests" onRetry={() => void loadGroups()} /> : null}

            {groups.map((group) => (
              <ChipSet
                key={group.id}
                label={group.name}
                items={group.items.map((item) => ({ key: item.id, label: item.name, dimmed: atCap && !interestIds.includes(item.id) }))}
                selection="multi"
                selected={group.items.filter((item) => interests.includes(item.name)).map((item) => item.id)}
                capHint={`Up to ${MAX_INTERESTS}`}
                onToggle={(id) => {
                  const item = group.items.find((i) => i.id === id)
                  if (item) toggle(item.id, item.name)
                }}
                testID={`onboarding-interests-${group.id}`}
              />
            ))}
          </View>
        </>
      )}
    </OnboardingScreen>
  )
}

const styles = StyleSheet.create({
  bio: { gap: SPACE.md },
  prompts: { gap: SPACE.sm },
  interests: { gap: SPACE.lg },
  interestsHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  heading: { color: COLOR.textPrimary },
})

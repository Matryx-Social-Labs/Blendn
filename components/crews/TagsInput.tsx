import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import Animated, { FadeIn, LinearTransition } from 'react-native-reanimated'

import { COLOR, DURATION, REDUCE_MOTION, SPACE, SPRING } from '../../lib/design/tokens'
import { addTags, characters, CREW_MAX_TAGS, CREW_TAG_MAX, normaliseTag, TAG_CAP } from '../../lib/crews'
import { useReducedMotion } from '../../lib/motion'
import { Chip } from '../ds/Chip'
import { monoCaption } from '../ds/MonoFamily'
import { RollingNumber } from '../ds/RollingNumber'
import { CONTROL_FONT_CAP, useBoldText, useIncreaseContrast } from '../ds/shared'
import { FieldHeader, FieldLabel, TextField } from '../ds/TextField'

/** The counter counts the tag as the server will keep it, not the # and spaces typed. */
const tagLength = (typed: string) => characters(normaliseTag(typed))

/**
 * A crew's own hashtags (board crews/tags/01 A, owner pick): your tags as removable chips, a "# Add your own" field
 * (return or a comma adds; the line under it previews the tag as it will be kept — # stripped, spaces closed up), and the
 * server's ideas as dashed chips to tap. Up to 5, 24 characters each. A part the rule refuses stays in the field with the
 * server's own sentence; the server's moderation refusal (`error`) stands under the field too. Make and Edit crew share it.
 */
export function TagsInput({
  tags,
  onTags,
  ideas,
  error,
  testID,
}: {
  tags: readonly string[]
  onTags: (next: string[]) => void
  /** `GET /crews` → `tagIdeas`, without the #. */
  ideas: readonly string[]
  /** The server's refusal of the tags (`field: "tags"`), cleared by the owner when the tags change. */
  error?: string
  /** The field's: its input is `${testID}-input`, the set `${testID}s`. */
  testID: string
}) {
  const bold = useBoldText()
  const contrast = useIncreaseContrast()
  const reduceMotion = useReducedMotion()
  const [draft, setDraft] = useState('')
  const [problem, setProblem] = useState<string>()
  const atCap = tags.length >= CREW_MAX_TAGS
  const left = ideas.filter((idea) => !tags.some((t) => t.toLowerCase() === idea.toLowerCase()))
  const preview = normaliseTag(draft)
  // The chips glide as one comes or goes, as a ChipSet's do; Reduce Motion fades and moves nothing.
  const glide = reduceMotion ? undefined : LinearTransition.springify().stiffness(SPRING.settle.stiffness).damping(SPRING.settle.damping)
  const fade = FadeIn.duration(reduceMotion ? REDUCE_MOTION.duration.base : DURATION.quick)

  const commit = (typed: string) => {
    const entry = addTags(tags, typed)
    if (entry.tags.length !== tags.length) onTags(entry.tags)
    setDraft(entry.draft)
    setProblem(entry.problem)
  }
  const type = (typed: string) => {
    if (/[,\n]/.test(typed)) return commit(typed)
    setDraft(typed)
    setProblem(undefined)
  }

  return (
    <View testID={`${testID}s`} style={styles.group}>
      <FieldHeader
        label="Your tags · optional"
        counter={
          <View accessible accessibilityLabel={`${tags.length} of ${CREW_MAX_TAGS}`} style={styles.counter}>
            <RollingNumber value={tags.length} role="counter" color={COLOR.textSecondary} />
            <Text style={[monoCaption(bold), { color: COLOR.textSecondary }]} maxFontSizeMultiplier={CONTROL_FONT_CAP}>
              {` of ${CREW_MAX_TAGS}`}
            </Text>
          </View>
        }
      />
      {tags.length ? (
        <View style={styles.wrap}>
          {tags.map((tag) => (
            <Animated.View key={tag.toLowerCase()} entering={fade} layout={glide} style={styles.item}>
              <Chip
                label={`#${tag}`}
                selected
                lines={2}
                onRemove={() => {
                  onTags(tags.filter((t) => t !== tag))
                  setProblem(undefined)
                }}
                accessibilityLabel={`#${tag}, remove tag`}
                testID={`${testID}-tag-${tag.toLowerCase()}`}
              />
            </Animated.View>
          ))}
        </View>
      ) : null}
      <TextField
        value={draft}
        onChangeText={type}
        onSubmitEditing={() => commit(draft)}
        submitBehavior="submit"
        returnKeyType="done"
        placeholder="#  Add your own"
        autoCapitalize="none"
        autoCorrect={false}
        limit={CREW_TAG_MAX}
        measure={tagLength}
        error={problem ?? error}
        hint={preview && !problem && !error ? `Return or comma adds #${preview}` : undefined}
        testID={testID}
      />
      {left.length ? (
        <View style={styles.group}>
          <View style={styles.labelRow}>
            <FieldLabel text="Ideas · tap to add" bold={bold} contrast={contrast} />
          </View>
          <View style={styles.wrap}>
            {left.map((idea) => (
              <Animated.View key={idea} entering={fade} layout={glide} style={styles.item}>
                <Chip
                  label={`#${idea}`}
                  variant="dashed"
                  dimmed={atCap}
                  capHint={TAG_CAP}
                  onPress={() => commit(idea)}
                  testID={`${testID}-idea-${idea}`}
                />
              </Animated.View>
            ))}
          </View>
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  group: { gap: SPACE.sm },
  // FieldLabel carries the 4 pt left inset itself; the row adds only the right one.
  labelRow: { paddingRight: SPACE.xs },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm },
  item: { maxWidth: '100%' },
  counter: { flexDirection: 'row', alignItems: 'baseline' },
})

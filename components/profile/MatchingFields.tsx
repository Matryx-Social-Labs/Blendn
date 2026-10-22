import type { ReactNode } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'

import {
  GENDERS,
  GENDER_LABELS,
  ORIENTATIONS,
  ORIENTATION_LABELS,
  needsInterestedInPicker,
  orientationDisabled,
  toggleOrientation,
  type Gender,
  type Orientation,
} from '../../lib/dating'
import { ChipSet } from '../ds/ChipSet'
import { font, minTarget, useBoldText, useIncreaseContrast } from '../ds/shared'
import { FieldLabel } from '../ds/TextField'
import { COLOR, SPACE } from '../../lib/design/tokens'

/**
 * The five fields matching runs on: intent, work field, and — only when dating
 * is ticked — gender, orientation and who you are interested in.
 *
 * ## Why this is a component and not two copies
 *
 * These fields were asked once at signup (`app/about-you.tsx`) and edited
 * nowhere except a row buried at Settings → Discovery → "You and matching".
 * So the app had **two profile editors**: `edit-profile` owned your photos, bio
 * and details, and this owned everything the matching engine actually reads,
 * three taps deep under a heading that did not name it.
 *
 * They are one editor now. This block is what both screens render, so the
 * onboarding question and the edit form cannot drift into asking differently.
 *
 * ## The conditional chain is the whole difficulty
 *
 * `dating` gates gender, which gates orientation, which gates
 * `interested_in` — and only sometimes. `needsInterestedInPicker` decides that
 * last one: "straight" plus "non-binary", or "queer", are identities rather
 * than lookup tables, so the target set has to be asked rather than derived.
 * Without it the server stores nothing, the dating tag never appears, and
 * nothing explains why.
 *
 * **A networking user is never asked their gender.** Less friction, and less
 * data held on somebody who had no reason to give it.
 *
 * ## Presentational only
 *
 * Every value and setter comes from the host screen, because the two hosts save
 * differently: onboarding writes once and moves on, the editor diffs against
 * what it loaded. Styles are `about-you`'s, copied exactly — extracting the
 * markup and restyling it in one step would have made an onboarding regression
 * impossible to tell from an intentional change.
 */

/** The server's own cap (`maxExpertise`), used until it has answered. */
const DEFAULT_MAX_EXPERTISE = 3

export type Intent = 'dating' | 'networking' | 'friendship' | 'just_here'

export const INTENTS: { value: Intent; label: string; hint?: string }[] = [
  { value: 'networking', label: 'Networking' },
  { value: 'friendship', label: 'Friendship' },
  { value: 'dating', label: 'Dating' },
  { value: 'just_here', label: 'Just here', hint: 'no matching' },
]

export interface MatchingFieldsProps {
  intents: Intent[]
  onToggleIntent: (value: Intent) => void
  workField: string | null
  onChangeWorkField: (slug: string | null) => void
  workFields: { slug: string; label: string }[]
  gender: Gender | null
  onChangeGender: (gender: Gender) => void
  orientations: Orientation[]
  onChangeOrientations: (next: Orientation[]) => void
  interestedIn: Gender[]
  onChangeInterestedIn: (next: Gender[]) => void
  /**
   * Rendered between "What are you open to?" and the dating block.
   *
   * Onboarding asks for an age there, and only there -- the editor already has
   * an age field of its own further up. A slot rather than a boolean, so this
   * component never has to know which host it is in.
   */
  afterIntents?: ReactNode
  /**
   * Step 2 of the field of work (Flow 14 · 14.3, served by `GET /work-fields`): what they do within it, up to `maxExpertise` chips from
   * their field's list. Offered only by a host that passes the list, so onboarding is unchanged; the host clears them silently when the
   * field changes. A field with no list (Something else) draws no step.
   */
  expertiseOptions?: { slug: string; label: string }[]
  expertise?: string[]
  maxExpertise?: number
  onChangeExpertise?: (next: string[]) => void
  /**
   * Whether this person may be offered dating (`mayDate`). Required, so every
   * host decides: when false, neither the Dating chip nor the gender and
   * orientation questions it opens are shown (SCRUM-294).
   */
  offerDating: boolean
  /**
   * The list of fields of work could not be read (6-3, Edit profile · 04): the heading stands with the failure line under it, and
   * the line is the retry. A heading alone says nothing. Only a host that can retry passes both; onboarding is unchanged.
   */
  workFieldsFailed?: boolean
  onRetryWorkFields?: () => void
  /** The retry is on its way: the line says so and holds still. */
  workFieldsRetrying?: boolean
}

/** Edit profile · 04: the failure line under the heading, in the frame's words. */
export const WORK_FIELDS_FAILED = 'Couldn’t load fields of work. Try again.'

function WorkFieldsFailed({ onRetry, retrying }: { onRetry?: () => void; retrying: boolean }) {
  const bold = useBoldText()
  const contrast = useIncreaseContrast()
  return (
    <View testID="matching-work-field-failed">
      <FieldLabel text="WHAT DO YOU DO?" bold={bold} contrast={contrast} />
      <Pressable
        onPress={onRetry}
        disabled={!onRetry || retrying}
        accessibilityRole="button"
        accessibilityLabel={retrying ? 'Trying again' : WORK_FIELDS_FAILED}
        accessibilityState={{ disabled: !onRetry || retrying, busy: retrying }}
        // The target is the line's own box, a full 44 tall; the slop reaches up and down only, so it never covers the field beside it.
        hitSlop={{ top: SPACE.xs, bottom: SPACE.xs }}
        style={styles.failed}
      >
        <Text style={[font('meta', bold), { color: contrast ? COLOR.textPrimary : COLOR.textTertiary }]}>{retrying ? 'Trying again…' : WORK_FIELDS_FAILED}</Text>
      </Pressable>
    </View>
  )
}

export function MatchingFields({
  intents,
  onToggleIntent,
  workField,
  onChangeWorkField,
  workFields,
  gender,
  onChangeGender,
  orientations,
  onChangeOrientations,
  interestedIn,
  onChangeInterestedIn,
  afterIntents,
  offerDating,
  expertiseOptions,
  expertise = [],
  maxExpertise = DEFAULT_MAX_EXPERTISE,
  onChangeExpertise,
  workFieldsFailed = false,
  onRetryWorkFields,
  workFieldsRetrying = false,
}: MatchingFieldsProps) {
  const wantsDating = offerDating && intents.includes('dating')
  const offered = offerDating ? INTENTS : INTENTS.filter((intent) => intent.value !== 'dating')
  const askInterestedIn = needsInterestedInPicker(gender, orientations, intents)

  return (
    <>
      {/* The first set sits straight under the card's own label: the gap (`set`) is between sets, not above the first. */}
      <View testID="matching-first-set">
        <ChipSet
          label="WHAT ARE YOU OPEN TO?"
          items={offered.map((intent) => ({ key: intent.value, label: `${intent.label}${intent.hint ? ` · ${intent.hint}` : ''}` }))}
          selection="multi"
          selected={intents}
          onToggle={(value) => onToggleIntent(value as Intent)}
          testID="matching-intents"
        />
      </View>

      {afterIntents}

      {wantsDating ? (
        <>
          {/*
            Only here, and only while dating is ticked. `blendn-admin/docs/DESIGN_HANDOFF.md`
            is explicit: a networking user is never asked their gender.
          */}
          <View style={styles.set}>
            <ChipSet
              label="YOU ARE"
              items={GENDERS.map((g) => ({ key: g, label: GENDER_LABELS[g] }))}
              selection="single"
              selected={gender ? [gender] : []}
              onToggle={(value) => onChangeGender(value as Gender)}
              testID="matching-gender"
            />
          </View>

          <View style={styles.set}>
            {/* Dimmed rather than removed at the cap: the chips you cannot reach are what tell you the limit exists. */}
            <ChipSet
              label="YOU IDENTIFY AS"
              hint="Select all that apply — up to three."
              items={ORIENTATIONS.map((o) => ({ key: o, label: ORIENTATION_LABELS[o], dimmed: orientationDisabled(orientations, o) }))}
              selection="multi"
              selected={orientations}
              capHint="Up to three"
              onToggle={(value) => onChangeOrientations(toggleOrientation(orientations, value as Orientation))}
              testID="matching-orientations"
            />
          </View>

          {askInterestedIn ? (
            // Shown when the pair does not imply a target set — "straight" plus "non-binary", or "queer", which are identities
            // rather than tables. Without this the server stores nothing and the dating tag never appears, with no explanation.
            <View style={styles.set}>
              <ChipSet
                label="INTERESTED IN"
                items={GENDERS.map((g) => ({ key: g, label: GENDER_LABELS[g] }))}
                selection="multi"
                selected={interestedIn}
                onToggle={(value) => {
                  const g = value as Gender
                  onChangeInterestedIn(interestedIn.includes(g) ? interestedIn.filter((x) => x !== g) : [...interestedIn, g])
                }}
                testID="matching-interested-in"
              />
            </View>
          ) : null}
        </>
      ) : null}

      <View style={styles.set}>
        {workFieldsFailed && workFields.length === 0 ? (
          <WorkFieldsFailed onRetry={onRetryWorkFields} retrying={workFieldsRetrying} />
        ) : (
          <ChipSet
            label="WHAT DO YOU DO?"
            items={workFields.map((f) => ({ key: f.slug, label: f.label }))}
            selection="single"
            selected={workField ? [workField] : []}
            onToggle={(slug) => onChangeWorkField(workField === slug ? null : slug)}
            testID="matching-work-field"
          />
        )}
      </View>

      {workField && expertiseOptions?.length && onChangeExpertise ? (
        <View style={styles.set}>
          {/* The same rule as interests: the rest dim at the cap and say why, rather than a tap that does nothing. */}
          <ChipSet
            label="WHAT KIND?"
            items={expertiseOptions.map((e) => ({ key: e.slug, label: e.label }))}
            selection="multi"
            selected={expertise}
            max={maxExpertise}
            capHint={`Up to ${maxExpertise}`}
            onToggle={(slug) => onChangeExpertise(expertise.includes(slug) ? expertise.filter((x) => x !== slug) : [...expertise, slug])}
            testID="matching-expertise"
          />
        </View>
      ) : null}
    </>
  )
}

const styles = StyleSheet.create({
  set: { marginTop: SPACE.xl },
  failed: { minHeight: minTarget(), justifyContent: 'center' },
})

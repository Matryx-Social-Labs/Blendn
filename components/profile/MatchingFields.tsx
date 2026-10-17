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
import { CONTROL, EMBER, EMBER_RADIUS, OPACITY, SPACE, TYPE } from '../../lib/theme'

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
   * Whether this person may be offered dating (`mayDate`). Required, so every
   * host decides: when false, neither the Dating chip nor the gender and
   * orientation questions it opens are shown (SCRUM-294).
   */
  offerDating: boolean
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
}: MatchingFieldsProps) {
  const wantsDating = offerDating && intents.includes('dating')
  const offered = offerDating ? INTENTS : INTENTS.filter((intent) => intent.value !== 'dating')
  const askInterestedIn = needsInterestedInPicker(gender, orientations, intents)

  return (
    <>
      <Text style={styles.section}>WHAT ARE YOU OPEN TO?</Text>
      <View style={styles.row}>
        {offered.map((intent) => (
          <Chip key={intent.value} on={intents.includes(intent.value)} onPress={() => onToggleIntent(intent.value)}>
            {intent.label}
            {intent.hint ? ` · ${intent.hint}` : ''}
          </Chip>
        ))}
      </View>

      {afterIntents}

      {wantsDating ? (
        <>
          {/*
            Only here, and only while dating is ticked. `blendn-admin/docs/DESIGN_HANDOFF.md`
            is explicit: a networking user is never asked their gender.
          */}
          <Text style={styles.section}>YOU ARE</Text>
          <View style={styles.row}>
            {GENDERS.map((g) => (
              <Chip key={g} on={gender === g} onPress={() => onChangeGender(g)}>
                {GENDER_LABELS[g]}
              </Chip>
            ))}
          </View>

          <Text style={styles.section}>YOU IDENTIFY AS</Text>
          <Text style={styles.hint}>Select all that apply — up to three.</Text>
          <View style={styles.row}>
            {ORIENTATIONS.map((o) => (
              // Dimmed rather than removed at the cap: the chips you cannot
              // reach are what tell you the limit exists.
              <Chip
                key={o}
                on={orientations.includes(o)}
                onPress={() => onChangeOrientations(toggleOrientation(orientations, o))}
                disabled={orientationDisabled(orientations, o)}
              >
                {ORIENTATION_LABELS[o]}
              </Chip>
            ))}
          </View>

          {askInterestedIn ? (
            <>
              {/*
                Shown when the pair does not imply a target set — "straight"
                plus "non-binary", or "queer", which are identities rather
                than tables. Without this the server stores nothing and the
                dating tag never appears, with no explanation.
              */}
              <Text style={styles.section}>INTERESTED IN</Text>
              <View style={styles.row}>
                {GENDERS.map((g) => {
                  const on = interestedIn.includes(g)
                  return (
                    <Chip
                      key={g}
                      on={on}
                      onPress={() => onChangeInterestedIn(on ? interestedIn.filter((x) => x !== g) : [...interestedIn, g])}
                    >
                      {GENDER_LABELS[g]}
                    </Chip>
                  )
                })}
              </View>
            </>
          ) : null}
        </>
      ) : null}

      <Text style={styles.section}>WHAT DO YOU DO?</Text>
      <View style={styles.row}>
        {workFields.map((f) => (
          <Chip key={f.slug} on={workField === f.slug} onPress={() => onChangeWorkField(workField === f.slug ? null : f.slug)}>
            {f.label}
          </Chip>
        ))}
      </View>
    </>
  )
}

/** One selectable chip. `disabled` is reported to screen readers only when it is given. */
function Chip({
  on,
  onPress,
  disabled,
  children,
}: {
  on: boolean
  onPress: () => void
  disabled?: boolean
  children: ReactNode
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[styles.chip, on ? styles.chipOn : styles.chipOff, disabled && styles.chipDisabled]}
      accessibilityRole="button"
      accessibilityState={disabled === undefined ? { selected: on } : { selected: on, disabled }}
    >
      <Text style={[styles.chipText, on && styles.chipTextOn]}>{children}</Text>
    </Pressable>
  )
}

/*
 * EMBER, now that the extraction itself is merged and verified.
 *
 * These were `about-you`'s raw hexes, copied character for character on
 * purpose: changing the markup and the palette in one step would have made an
 * onboarding regression impossible to tell from an intentional change. That
 * step is done, so this one is safe — and it lifts onboarding onto the app's
 * palette at the same time, which it was never on.
 *
 * A selected chip takes a white (`textPrimary`) *fill* with `bg` text rather
 * than a brighter grey. On a screen of a dozen chips, "which are on" has to be
 * answerable at a glance, and a 10% lightness step is not.
 */
const styles = StyleSheet.create({
  // `label` text: the strings above are written uppercase (no textTransform).
  section: {
    ...TYPE.label,
    marginTop: SPACE.xl,
    marginBottom: SPACE.md,
  },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.md },
  chip: { minHeight: CONTROL.md, justifyContent: 'center', paddingHorizontal: SPACE.lg, borderRadius: EMBER_RADIUS.pill, borderWidth: 1 },
  chipOff: { backgroundColor: EMBER.surface, borderColor: EMBER.separator },
  chipOn: { backgroundColor: EMBER.textPrimary, borderColor: EMBER.textPrimary },
  // Opacity only, so a chip that becomes unreachable keeps its width and the
  // row does not reflow under your thumb.
  chipDisabled: { opacity: OPACITY.disabled },
  chipText: { ...TYPE.bodyStrong },
  chipTextOn: { color: EMBER.bg },
  hint: {
    ...TYPE.meta,
    marginTop: SPACE.sm,
  },
})

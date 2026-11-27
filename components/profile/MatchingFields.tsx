import type { ReactNode } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'

import type { Intent } from '../../lib/intents'
import { ChipSet } from '../ds/ChipSet'
import { font, minTarget, useAnnounced, useBoldText, useIncreaseContrast } from '../ds/shared'
import { FieldLabel } from '../ds/TextField'
import { TIER_SEES } from '../../lib/matchingTiers'
import { WhoSees } from './WhoSees'
import { Swap } from '../motion/Swap'
import { COLOR, SPACE, MAX_FONT_SCALE } from '../../lib/design/tokens'
import { OPACITY } from '../../lib/theme'

/**
 * The fields matching runs on that a person picks: intent, and the field of work with what they do in it.
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
 * ## No dating, and nothing it asked (register D-002, SCRUM-1192)
 *
 * Dating is not an intent in 1.0. Gender, orientation and interested-in were asked only while it was ticked, for the
 * server's dating compatibility check, so they went with it: nobody is asked them, and the app neither loads nor sends them.
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

export type { Intent }

export const INTENTS: { value: Intent; label: string; hint?: string }[] = [
  { value: 'networking', label: 'Networking' },
  { value: 'friendship', label: 'Friendship' },
  { value: 'just_here', label: 'Just here', hint: 'no matching' },
]

export interface MatchingFieldsProps {
  intents: Intent[]
  onToggleIntent: (value: Intent) => void
  workField: string | null
  onChangeWorkField: (slug: string | null) => void
  workFields: { slug: string; label: string }[]
  /**
   * Rendered under "What are you open to?".
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
   * The list of fields of work could not be read (6-3, Edit profile · 04): the heading stands with the failure line under it, and
   * the line is the retry. A heading alone says nothing. Only a host that can retry passes both; onboarding is unchanged.
   */
  workFieldsFailed?: boolean
  onRetryWorkFields?: () => void
  /** The retry is on its way: the line says so and holds still. */
  workFieldsRetrying?: boolean
  /**
   * One half on its own, for Edit profile's rows (Me + settings A 03): `open` is intent, `work`
   * the field of work and its expertise. Omitted, both (onboarding asks them on one page).
   */
  part?: 'open' | 'work'
}

/** A row's summary of what it holds: "Riso, Jazz, Poutine +2". Null for nothing. */
export function listLine(labels: readonly string[], shown = 3): string | null {
  if (!labels.length) return null
  const rest = labels.length - shown
  return `${labels.slice(0, shown).join(', ')}${rest > 0 ? ` +${rest}` : ''}`
}

/** D20 (D-M14, 14.0): the matching chip is Tier B (people you match with, in rooms of 8 or more); the free "Job title" field is seen after a reveal. */
export const WORK_FIELD_HINT = TIER_SEES.B

/** Edit profile · 04: the failure line under the heading, in the frame's words. */
export const WORK_FIELDS_FAILED = 'Couldn’t load fields of work. Try again.'

function WorkFieldsFailed({ onRetry, retrying }: { onRetry?: () => void; retrying: boolean }) {
  const bold = useBoldText()
  const contrast = useIncreaseContrast()
  // Said when the fields fail, and again when a retry fails (M24).
  useAnnounced(!retrying && WORK_FIELDS_FAILED)
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
        style={({ pressed }) => [styles.failed, pressed && styles.pressed]}
      >
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} accessibilityLiveRegion="polite" style={[font('meta', bold), { color: contrast ? COLOR.textPrimary : COLOR.textTertiary }]}>{retrying ? 'Trying again…' : WORK_FIELDS_FAILED}</Text>
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
  afterIntents,
  expertiseOptions,
  expertise = [],
  maxExpertise = DEFAULT_MAX_EXPERTISE,
  onChangeExpertise,
  workFieldsFailed = false,
  onRetryWorkFields,
  workFieldsRetrying = false,
  part,
}: MatchingFieldsProps) {
  const showOpen = part !== 'work'
  const showWork = part !== 'open'

  return (
    <>
      {showOpen ? (
        <>
      {/* The first set sits straight under the card's own label: the gap (`set`) is between sets, not above the first. */}
      <View testID="matching-first-set">
        <ChipSet
          // In a sheet, its title heads the set (ChipSet: omit the label where a control above heads it).
          label={part ? undefined : 'WHAT ARE YOU OPEN TO?'}
          items={INTENTS.map((intent) => ({ key: intent.value, label: `${intent.label}${intent.hint ? ` · ${intent.hint}` : ''}` }))}
          selection="multi"
          selected={intents}
          onToggle={(value) => onToggleIntent(value as Intent)}
          testID="matching-intents"
        />
        <WhoSees field="intent" />
      </View>

      {afterIntents}
        </>
      ) : null}

      {showWork ? (
        <>
      <View style={showOpen ? styles.set : undefined}>
        {workFieldsFailed && workFields.length === 0 ? (
          <WorkFieldsFailed onRetry={onRetryWorkFields} retrying={workFieldsRetrying} />
        ) : (
          <ChipSet
            label={part ? undefined : 'WHAT DO YOU DO?'}
            // D20: who sees it, beside the job title below, which shows only once you reveal.
            hint={WORK_FIELD_HINT}
            items={workFields.map((f) => ({ key: f.slug, label: f.label }))}
            selection="single"
            selected={workField ? [workField] : []}
            onToggle={(slug) => onChangeWorkField(workField === slug ? null : slug)}
            testID="matching-work-field"
          />
        )}
      </View>

      <Swap>
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
      </Swap>
        </>
      ) : null}
    </>
  )
}

const styles = StyleSheet.create({
  set: { marginTop: SPACE.xl },
  failed: { minHeight: minTarget(), justifyContent: 'center' },
  pressed: { opacity: OPACITY.pressed },
})

import { type ComponentRef, type RefObject } from 'react'
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native'

import { COLOR, FONT_FAMILY, ICON, MATERIAL, RADIUS, SPACE } from '../../lib/design/tokens'
import { CONSENT_LINE, CREW_BIO_MAX, CREW_MAX_TAGS, CREW_NAME_MAX, CREW_TAGS, KEEP_ANONYMOUS_LABEL } from '../../lib/crews'
import { INTENT_CHOICES, stepLine, type IntentChoice, type MakeStep } from '../../lib/crewsScreens'
import type { Friend } from '../../lib/friends'
import { tint } from '../../lib/theme'
import { Avatar } from '../ds/Avatar'
import { Chip } from '../ds/Chip'
import { CrewCard } from '../ds/CrewCard'
import { CrewEmblem } from '../ds/CrewEmblem'
import { monoCaption } from '../ds/MonoFamily'
import { font, minTarget, useBoldText, useIncreaseContrast } from '../ds/shared'
import { FieldLabel, TextArea, TextField } from '../ds/TextField'
import { Toggle } from '../ds/Toggle'
import { Icon } from '../ui/Icon'

/** flow10.js `make`: the line about the crew is a one-liner's height. */
const BIO_MIN_HEIGHT = 72
const FRIEND_ROW = 64
const FRIEND_FACE = 48
/** The pick circle: 28, ringed at 35% white when off. */
const PICK = 28
const PICK_RING = 0.35
/** flow10.js `make`: a block inside the sheet is 8% white on iOS glass, sunken on Android's solid sheet. */
const SHEET_FILL = Platform.OS === 'android' ? COLOR.surfaceSunken : MATERIAL.fillOnGlass

/** The sheet's title row: "Make a crew" at the title role and "1 of 3 · Name and vibe" at its baseline. */
export function MakeHeader({ step, titleRef }: { step: MakeStep; titleRef: RefObject<ComponentRef<typeof Text> | null> }) {
  const bold = useBoldText()
  const contrast = useIncreaseContrast()
  const [position, ...rest] = stepLine(step).split(' of ')
  return (
    <View style={styles.header}>
      <Text ref={titleRef} accessibilityRole="header" style={[font('title', bold), styles.ink, styles.fill]}>
        Make a crew
      </Text>
      <Text accessibilityLabel={`Step ${stepLine(step)}`} style={[font('meta', bold), { color: contrast ? COLOR.textPrimary : COLOR.textSecondary }]}>
        <Text style={[monoCaption(bold), styles.ink]}>{position}</Text>
        {` of ${rest.join(' of ')}`}
      </Text>
    </View>
  )
}

export type NameStepProps = {
  name: string
  onName: (next: string) => void
  nameError?: string
  bio: string
  onBio: (next: string) => void
  bioError?: string
  choice: IntentChoice
  onChoice: (next: IntentChoice) => void
  tags: readonly string[]
  onTag: (slug: string) => void
  openToSolo: boolean
  onOpenToSolo: (next: boolean) => void
  /** The stand-in emblem: the server draws the real one, from its own seed, when the crew is made. */
  previewSeed: string
  intentText: string
}

/** Step 1 · Name and vibe, with the live preview of the card as strangers see it. */
export function NameStep(p: NameStepProps) {
  const bold = useBoldText()
  const contrast = useIncreaseContrast()
  const full = p.tags.length >= CREW_MAX_TAGS
  const secondary = contrast ? COLOR.textPrimary : COLOR.textSecondary
  const labels = CREW_TAGS.filter((t) => p.tags.includes(t.slug)).map((t) => t.label)
  return (
    <>
      <TextField
        label="Name"
        value={p.name}
        onChangeText={p.onName}
        limit={CREW_NAME_MAX}
        error={p.nameError}
        autoCapitalize="words"
        returnKeyType="next"
        testID="make-name"
      />
      <TextArea
        label="A line about the crew"
        value={p.bio}
        onChangeText={p.onBio}
        limit={CREW_BIO_MAX}
        minHeight={BIO_MIN_HEIGHT}
        error={p.bioError}
        testID="make-bio"
      />
      <View style={styles.group}>
        <View style={styles.labelRow}>
          <FieldLabel text="Here for" bold={bold} contrast={contrast} />
        </View>
        <View style={styles.chips} accessibilityRole="radiogroup">
          {INTENT_CHOICES.map((c) => (
            <Chip key={c.value} label={c.label} selected={p.choice === c.value} onPress={() => p.onChoice(c.value)} />
          ))}
        </View>
      </View>
      <View style={styles.group}>
        <View style={[styles.labelRow, styles.spread]}>
          <FieldLabel text="Tags" bold={bold} contrast={contrast} />
          <Text style={[font('meta', bold), styles.tertiary]}>{`${p.tags.length} of ${CREW_MAX_TAGS}`}</Text>
        </View>
        <View style={styles.chips}>
          {CREW_TAGS.map((t) => {
            const on = p.tags.includes(t.slug)
            return (
              <Chip
                key={t.slug}
                label={t.label}
                selected={on}
                dimmed={full && !on}
                capHint={`Up to ${CREW_MAX_TAGS}`}
                onPress={() => p.onTag(t.slug)}
              />
            )
          })}
        </View>
      </View>
      <View style={styles.toggleRow}>
        <View style={styles.fill}>
          <Text style={[font('bodyStrong', bold), styles.ink]}>Room for one more</Text>
          <Text style={[font('meta', bold), { color: secondary }]}>
            Solo people who opt in can be liked for the crew. Crews of 6 or fewer.
          </Text>
        </View>
        <Toggle value={p.openToSolo} onValueChange={p.onOpenToSolo} accessibilityLabel="Room for one more" />
      </View>
      <View style={styles.group}>
        <View style={styles.labelRow}>
          <FieldLabel text="As strangers will see it" bold={bold} contrast={contrast} />
        </View>
        <CrewCard
          compact
          onSheet
          crew={{
            name: p.name.trim() || 'Crew name',
            emblemSeed: p.previewSeed,
            size: 1,
            here: 0,
            bio: p.bio.trim() || 'A line about the crew',
            tags: labels.length ? labels : ['Tags'],
            intent: p.intentText,
          }}
        />
      </View>
    </>
  )
}

/** One friend in the picker: face, name, and a pick circle. A checkbox, the whole row the target. */
function FriendPick({ friend, picked, onToggle }: { friend: Friend; picked: boolean; onToggle: () => void }) {
  const bold = useBoldText()
  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: picked }}
      accessibilityLabel={`Ask ${friend.name}`}
      style={styles.friend}
    >
      {friend.photo ? (
        <Avatar kind="photo" uri={friend.photo} size={FRIEND_FACE} />
      ) : (
        <Avatar kind="creature" pseudonym={friend.name} size={FRIEND_FACE} />
      )}
      <Text numberOfLines={1} style={[font('bodyStrong', bold), styles.ink, styles.fill]}>
        {friend.name}
      </Text>
      <View style={[styles.pick, picked ? styles.pickOn : styles.pickOff]}>
        {picked ? <Icon name="check" size={ICON.inline} color={COLOR.selectionInk} active /> : null}
      </View>
    </Pressable>
  )
}

export type FriendsStepProps = {
  /** null while it loads; 'failed' is not "no friends". */
  friends: Friend[] | null | 'failed'
  picked: readonly string[]
  onToggle: (userId: string) => void
  onRetry: () => void
}

/** Step 2 · Invite friends: friends only, no search; the count says how many, never who was skipped. */
export function FriendsStep({ friends, picked, onToggle, onRetry }: FriendsStepProps) {
  const bold = useBoldText()
  const contrast = useIncreaseContrast()
  const secondary = contrast ? COLOR.textPrimary : COLOR.textSecondary
  const line = (text: string) => <Text style={[font('meta', bold), styles.centre, { color: secondary }]}>{text}</Text>
  return (
    <>
      <Text style={[font('body', bold), { color: secondary }]}>Friends only. The count says how many, never who was skipped.</Text>
      <View style={styles.list}>
        {friends === null ? (
          line('Loading your friends…')
        ) : friends === 'failed' ? (
          <Pressable onPress={onRetry} accessibilityRole="button" accessibilityLabel="Your friends didn’t load — try again" hitSlop={minTarget()}>
            {line('Your friends didn’t load — try again')}
          </Pressable>
        ) : friends.length === 0 ? (
          line('Add friends first — a crew is made from your friends.')
        ) : (
          friends.map((f, i) => (
            <View key={f.userId} style={i ? styles.divided : undefined}>
              <FriendPick friend={f} picked={picked.includes(f.userId)} onToggle={() => onToggle(f.userId)} />
            </View>
          ))
        )}
      </View>
      <View style={styles.footer} accessibilityLiveRegion="polite">
        <Text style={[font('body', bold), styles.ink]}>
          <Text style={[font('body', bold, FONT_FAMILY.mono[500]), styles.ink]}>{picked.length}</Text>
          {' invited'}
        </Text>
        <Text style={[font('meta', bold), { color: secondary }]}>Invites last 14 days</Text>
      </View>
    </>
  )
}

export type ConsentStepProps = {
  name: string
  summary: string
  previewSeed: string
  keepAnonymous: boolean
  onKeepAnonymous: (next: boolean) => void
}

/** Step 3 · Consent: the sentence, always on screen; Make the crew is the agreement. */
export function ConsentStep({ name, summary, previewSeed, keepAnonymous, onKeepAnonymous }: ConsentStepProps) {
  const bold = useBoldText()
  const contrast = useIncreaseContrast()
  const secondary = contrast ? COLOR.textPrimary : COLOR.textSecondary
  return (
    <>
      <View style={styles.consent}>
        <View style={styles.consentLine}>
          <Icon name="eye" size={ICON.control} />
          <Text style={[font('body', bold), styles.ink, styles.fill]}>{CONSENT_LINE}</Text>
        </View>
        <View style={styles.anon}>
          <View style={styles.fill}>
            <Text style={[font('bodyStrong', bold), styles.ink]}>{KEEP_ANONYMOUS_LABEL}</Text>
            <Text style={[font('meta', bold), { color: secondary }]}>You can change this later. It applies from then on.</Text>
          </View>
          <Toggle value={keepAnonymous} onValueChange={onKeepAnonymous} accessibilityLabel={KEEP_ANONYMOUS_LABEL} />
        </View>
      </View>
      <View style={styles.summary} accessible accessibilityLabel={`${name}, ${summary}`}>
        <CrewEmblem seed={previewSeed} size={56} />
        <View style={styles.fill}>
          <Text style={[font('bodyStrong', bold), styles.ink]}>{name}</Text>
          <Text style={[font('meta', bold), { color: secondary }]}>{summary}</Text>
        </View>
      </View>
      <Text style={[font('meta', bold), styles.tertiary]}>
        The emblem is drawn from a random seed. It never changes, so nobody can read the crew’s membership from it.
      </Text>
    </>
  )
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: SPACE.md },
  fill: { flex: 1 },
  ink: { color: COLOR.textPrimary },
  tertiary: { color: COLOR.textTertiary },
  centre: { textAlign: 'center' },
  group: { gap: SPACE.sm },
  labelRow: { paddingHorizontal: SPACE.xs },
  spread: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md, minHeight: minTarget() },
  list: { borderRadius: RADIUS.sheet, backgroundColor: SHEET_FILL, overflow: 'hidden', padding: 0 },
  friend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
    paddingVertical: SPACE.sm,
    paddingHorizontal: SPACE.lg,
    minHeight: FRIEND_ROW,
  },
  divided: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLOR.hairline },
  pick: { width: PICK, height: PICK, borderRadius: RADIUS.capsule, alignItems: 'center', justifyContent: 'center' },
  pickOn: { backgroundColor: COLOR.selectionFill },
  pickOff: { borderWidth: 1.5, borderColor: tint(COLOR.textPrimary, PICK_RING) },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  consent: { borderRadius: RADIUS.sheet, backgroundColor: SHEET_FILL, padding: SPACE.lg, gap: SPACE.md },
  consentLine: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACE.md },
  anon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
    paddingTop: SPACE.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLOR.hairline,
  },
  summary: { flexDirection: 'row', alignItems: 'center', gap: SPACE.lg },
})

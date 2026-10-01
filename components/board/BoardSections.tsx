import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native'

import { Text } from '../ui/Text'
import { boardMarkSeed, spacesLabel, type BoardPost } from '../../lib/board'
import { pseudonymAvatar } from '../../lib/pseudonymAvatar'
import { CONTROL, EMBER, EMBER_RADIUS, ICON, OPACITY, SPACE, TYPE } from '../../lib/theme'

/**
 * The board's pieces. PLACEHOLDER DESIGN — see docs/PLACEHOLDER_SCREENS.md §6
 * for the rules a redesign must keep; the layout is not one of them.
 */

/** The mark beside a handle. Smaller than the Banter's 56: a card is not a row. */
export const BOARD_MARK = 40

/** Up to this many spaces on an offer — the server's own bound. */
export const MAX_SPACES = 20

/**
 * A person on the board, drawn as their generated mark.
 *
 * Seeded on the handle (`boardMarkSeed`), never a user id — the board does not
 * send one — and never a photo: the board is pseudonymous, and a face would be
 * the one place identity is handed over before anybody agreed to it.
 */
export function BoardMark({ seed }: { seed: string }) {
  const { colors, character } = pseudonymAvatar(seed)
  return (
    <LinearGradient colors={colors} style={styles.mark}>
      {/* design-exception: an emoji glyph sized to the 40pt disc, fixed against Dynamic Type */}
      <Text style={styles.markGlyph} maxFontSizeMultiplier={1}>
        {character}
      </Text>
    </LinearGradient>
  )
}

/**
 * The way in, on the event screen. Before doors only — after them the room is
 * the place, and the board is closed.
 */
export function BoardEntry({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="The Board. Going alone? See who is looking for company, or offer a space."
      style={({ pressed }) => [styles.entry, pressed && styles.pressed]}
    >
      <Ionicons name="people-outline" size={ICON.lg} color={EMBER.textPrimary} />
      <View style={styles.entryText}>
        <Text variant="bodyStrong">The Board</Text>
        <Text variant="meta">Going alone? See who&apos;s looking for company — or offer a space.</Text>
      </View>
      <Ionicons name="chevron-forward" size={ICON.md} color={EMBER.textSecondary} />
    </Pressable>
  )
}

/** What a card you did not write shows where its action goes. */
export type AskState =
  | { kind: 'idle' }
  | { kind: 'asking' }
  /** A state, never an error: "Waiting on them", "Closed", a 409's sentence. */
  | { kind: 'settled'; line: string }
  /** The server said no, and said which gate. Shown with the button still there. */
  | { kind: 'refused'; line: string }

/**
 * One post.
 *
 * ## Two shapes, one accent
 *
 * An **offer** is a sunken panel with its spaces as the loudest thing on it —
 * the board's one real-time signal. A **seeking** (and a `chat`) is quieter and
 * text-first: no panel, no counter, the words before the name. Identical cards
 * would bury the counter and read as a stack of cards rather than a layout.
 *
 * The kind is also said in words ("Offering", "Looking"), so the counter is
 * never the only thing telling them apart — not to a screen reader, and not at
 * the largest text size, where every line here wraps rather than truncates.
 */
export function BoardPostCard({
  post,
  eventId,
  ask,
  onAsk,
  onTakeDown,
}: {
  post: BoardPost
  eventId: string
  ask: AskState
  onAsk: () => void
  onTakeDown: () => void
}) {
  const offer = post.kind === 'offer'
  const spaces = offer ? spacesLabel(post.spacesLeft) : null
  const kindWord = offer ? 'Offering' : post.kind === 'seeking' ? 'Looking' : 'Saying'
  const full = offer && post.spacesLeft !== null && post.spacesLeft <= 0

  const byline = (
    <View style={styles.byline}>
      <BoardMark seed={boardMarkSeed(post.author, eventId, post.id)} />
      <View style={styles.bylineText}>
        <Text variant="bodyStrong">{post.author}</Text>
        <Text variant="meta">{post.mine ? `${kindWord} · yours` : kindWord}</Text>
      </View>
    </View>
  )

  return (
    <View
      style={offer ? styles.offer : styles.seeking}
      accessibilityLabel={`${kindWord}${spaces ? `, ${spaces}` : ''}. ${post.author}: ${post.body}`}
    >
      {offer ? byline : null}
      {spaces ? (
        <Text variant="title" color={full ? EMBER.textSecondary : EMBER.textPrimary}>
          {spaces}
        </Text>
      ) : null}
      <Text variant="body">{post.body}</Text>
      {offer ? null : byline}

      {post.mine ? (
        <MineFooter count={post.requestCount} onTakeDown={onTakeDown} />
      ) : (
        <AskFooter ask={ask} full={full} author={post.author} onAsk={onAsk} />
      )}
    </View>
  )
}

function MineFooter({ count, onTakeDown }: { count: number; onTakeDown: () => void }) {
  return (
    <View style={styles.footer}>
      <Text variant="meta" style={styles.footerLine}>
        {count === 0 ? 'Nobody has asked yet' : `${count} asked — answer in the Banter`}
      </Text>
      <Pressable
        onPress={onTakeDown}
        accessibilityRole="button"
        accessibilityLabel="Take down your post"
        hitSlop={SPACE.md}
        style={({ pressed }) => [styles.textButton, pressed && styles.pressed]}
      >
        <Text variant="button" color={EMBER.textSecondary}>
          Take down
        </Text>
      </Pressable>
    </View>
  )
}

/**
 * Ask, then the answer in place.
 *
 * No confirm dialog: the ask is the moment somebody feels most exposed, and a
 * "Are you sure?" says it is dangerous. The button holds a spinner while the
 * request is out, then the card says what happened.
 */
function AskFooter({
  ask,
  full,
  author,
  onAsk,
}: {
  ask: AskState
  full: boolean
  author: string
  onAsk: () => void
}) {
  if (ask.kind === 'settled') {
    return (
      <Text variant="meta" accessibilityLiveRegion="polite">
        {ask.line}
      </Text>
    )
  }
  if (full) return <Text variant="meta">No spaces left</Text>

  const asking = ask.kind === 'asking'
  return (
    <View style={styles.askBlock}>
      {ask.kind === 'refused' ? (
        <Text variant="body" accessibilityLiveRegion="polite">
          {ask.line}
        </Text>
      ) : null}
      <Pressable
        onPress={onAsk}
        disabled={asking}
        accessibilityRole="button"
        accessibilityLabel={`Ask ${author} to join`}
        accessibilityState={{ busy: asking, disabled: asking }}
        style={({ pressed }) => [styles.askButton, (pressed || asking) && styles.pressed]}
      >
        {asking ? (
          <ActivityIndicator color={EMBER.bg} />
        ) : (
          <Text variant="button" color={EMBER.bg}>
            Ask to join
          </Text>
        )}
      </Pressable>
    </View>
  )
}

export type ComposeKind = 'offer' | 'seeking'

/**
 * Write a post. Two kinds, the two shapes the board draws.
 *
 * A refusal stays under the button until the next try — a toast is gone
 * before somebody has read which of three gates they missed.
 */
export function BoardComposer({
  kind,
  body,
  spaces,
  posting,
  refusal,
  onKind,
  onBody,
  onSpaces,
  onPost,
  onCancel,
}: {
  kind: ComposeKind
  body: string
  spaces: number
  posting: boolean
  refusal: string | null
  onKind: (kind: ComposeKind) => void
  onBody: (body: string) => void
  onSpaces: (spaces: number) => void
  onPost: () => void
  onCancel: () => void
}) {
  const empty = body.trim().length === 0
  return (
    <View style={styles.composer}>
      <View style={styles.kinds} accessibilityRole="radiogroup">
        {(
          [
            ['offer', 'I have space'],
            ['seeking', "I'm looking"],
          ] as const
        ).map(([value, label]) => {
          const selected = kind === value
          return (
            <Pressable
              key={value}
              onPress={() => onKind(value)}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={label}
              style={[styles.kind, selected && styles.kindSelected]}
            >
              <Text variant="button" color={selected ? EMBER.bg : EMBER.textSecondary}>
                {label}
              </Text>
            </Pressable>
          )
        })}
      </View>

      <TextInput
        value={body}
        onChangeText={onBody}
        multiline
        maxLength={500}
        placeholder={
          kind === 'offer'
            ? 'Driving over from Indiranagar at 8 — room for two.'
            : 'Going alone. Anyone heading over from Koramangala?'
        }
        placeholderTextColor={EMBER.textPlaceholder}
        accessibilityLabel="Your post"
        style={styles.input}
      />

      {kind === 'offer' ? (
        <View style={styles.spacesRow}>
          <Text variant="bodyStrong" style={styles.spacesLabel}>
            Spaces
          </Text>
          <Stepper
            label="space"
            value={spaces}
            onChange={onSpaces}
          />
        </View>
      ) : null}

      {refusal ? (
        <Text variant="body" accessibilityLiveRegion="polite">
          {refusal}
        </Text>
      ) : null}

      <Pressable
        onPress={onPost}
        disabled={posting || empty}
        accessibilityRole="button"
        accessibilityLabel="Post to the board"
        accessibilityState={{ busy: posting, disabled: posting || empty }}
        style={({ pressed }) => [
          styles.post,
          empty && styles.disabled,
          (pressed || posting) && styles.pressed,
        ]}
      >
        {posting ? (
          <ActivityIndicator color={EMBER.onGradient} />
        ) : (
          <Text variant="button" color={EMBER.onGradient}>
            Post
          </Text>
        )}
      </Pressable>
      <Pressable
        onPress={onCancel}
        accessibilityRole="button"
        accessibilityLabel="Cancel"
        style={({ pressed }) => [styles.cancel, pressed && styles.pressed]}
      >
        <Text variant="button" color={EMBER.textSecondary}>
          Cancel
        </Text>
      </Pressable>
    </View>
  )
}

function Stepper({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  const step = (by: number) => onChange(Math.min(MAX_SPACES, Math.max(1, value + by)))
  return (
    <View style={styles.stepper}>
      <Pressable
        onPress={() => step(-1)}
        disabled={value <= 1}
        accessibilityRole="button"
        accessibilityLabel={`One ${label} fewer`}
        style={[styles.stepButton, value <= 1 && styles.disabled]}
      >
        <Ionicons name="remove" size={ICON.md} color={EMBER.textPrimary} />
      </Pressable>
      <Text variant="bodyStrong" accessibilityLabel={`${value} ${label}${value === 1 ? '' : 's'}`}>
        {value}
      </Text>
      <Pressable
        onPress={() => step(1)}
        disabled={value >= MAX_SPACES}
        accessibilityRole="button"
        accessibilityLabel={`One ${label} more`}
        style={[styles.stepButton, value >= MAX_SPACES && styles.disabled]}
      >
        <Ionicons name="add" size={ICON.md} color={EMBER.textPrimary} />
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  pressed: { opacity: OPACITY.pressed },
  disabled: { opacity: OPACITY.disabled },

  mark: {
    width: BOARD_MARK,
    height: BOARD_MARK,
    borderRadius: EMBER_RADIUS.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // design-exception: an emoji glyph sized to fill the 40pt disc, not text
  markGlyph: { fontSize: 20, lineHeight: 26 },

  entry: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.lg,
    padding: SPACE.lg,
    borderRadius: EMBER_RADIUS.md,
    backgroundColor: EMBER.surfaceSunken,
  },
  entryText: { flex: 1, gap: SPACE.xxs },

  // An offer: a panel, the counter loud.
  offer: {
    gap: SPACE.md,
    padding: SPACE.lg,
    borderRadius: EMBER_RADIUS.md,
    backgroundColor: EMBER.surfaceSunken,
  },
  // A seeking: no panel, words first. Lined up with the panel's text.
  seeking: { gap: SPACE.md, paddingVertical: SPACE.md, paddingHorizontal: SPACE.lg },

  byline: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md },
  bylineText: { flex: 1 },

  footer: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: SPACE.md },
  footerLine: { flex: 1 },
  textButton: { minHeight: CONTROL.sm, justifyContent: 'center' },

  askBlock: { gap: SPACE.sm },
  // Strong-neutral, not the accent: the accent is the screen's one Post.
  askButton: {
    alignSelf: 'flex-start',
    minHeight: CONTROL.md,
    paddingHorizontal: SPACE.xl,
    borderRadius: EMBER_RADIUS.pill,
    backgroundColor: EMBER.textPrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },

  composer: {
    gap: SPACE.md,
    padding: SPACE.lg,
    borderRadius: EMBER_RADIUS.md,
    backgroundColor: EMBER.surfaceSunken,
  },
  kinds: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm },
  kind: {
    minHeight: CONTROL.md,
    paddingHorizontal: SPACE.lg,
    borderRadius: EMBER_RADIUS.pill,
    backgroundColor: EMBER.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kindSelected: { backgroundColor: EMBER.textPrimary },
  input: {
    ...TYPE.body,
    minHeight: CONTROL.lg * 2,
    padding: SPACE.md,
    borderRadius: EMBER_RADIUS.sm,
    backgroundColor: EMBER.surface,
    textAlignVertical: 'top',
  },
  spacesRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  spacesLabel: { flex: 1 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md },
  stepButton: {
    width: CONTROL.md,
    height: CONTROL.md,
    borderRadius: EMBER_RADIUS.pill,
    backgroundColor: EMBER.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  post: {
    minHeight: CONTROL.lg,
    borderRadius: EMBER_RADIUS.pill,
    backgroundColor: EMBER.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancel: { minHeight: CONTROL.md, alignItems: 'center', justifyContent: 'center' },
})

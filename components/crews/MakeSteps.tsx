import { useRef } from 'react'
import { FlatList, Platform, Pressable, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native'
import Animated from 'react-native-reanimated'

import { COLOR, FONT_FAMILY, ICON, MATERIAL, MAX_FONT_SCALE, RADIUS, SPACE, TYPE } from '../../lib/design/tokens'
import { CONSENT_LINE, CREW_BIO_MAX, CREW_MAX_MEMBERS, CREW_MAX_TAGS, CREW_NAME_MAX, CREW_TAGS, KEEP_ANONYMOUS_LABEL } from '../../lib/crews'
import { INTENT_CHOICES, type IntentChoice } from '../../lib/crewsScreens'
import type { Friend } from '../../lib/friends'
import { OPACITY, tint } from '../../lib/theme'
import { PagedFooter } from '../friends/PagedFooter'
import { SearchField } from '../ds/SearchField'
import { FRIEND_SEARCH_MAX } from '../../lib/friendsPaging'
import { Avatar } from '../ds/Avatar'
import { Button } from '../ds/Button'
import { ChipSet } from '../ds/ChipSet'
import { CrewCard } from '../ds/CrewCard'
import { CrewEmblem } from '../ds/CrewEmblem'
import { CONTROL_FONT_CAP, font, minTarget, quickTransition, useBoldText, useIncreaseContrast, useSelection } from '../ds/shared'
import { FieldLabel, TextArea, TextField } from '../ds/TextField'
import { Toggle } from '../ds/Toggle'
import { Glyph } from '../ui/Glyph'

/** flow10.js `make`: the line about the crew is a one-liner's height. */
const BIO_MIN_HEIGHT = 72
/** A friend's row is exactly this tall: the picker windows its rows (`getItemLayout`), so a thousand friends cost a screenful. */
const FRIEND_ROW = 64
/** The list's own height, as a share of the window, inside the tall sheet: it scrolls there and windows its rows. */
const LIST_SHARE = 0.5
/** Rows drawn before the first scroll: a whole crew's worth (25), so filling a crew never waits on a batch. */
const FIRST_ROWS = CREW_MAX_MEMBERS
const NO_FRIENDS = 'Add friends first — a crew is made from your friends.'
const FRIEND_FACE = 48
/** The pick circle: 28, ringed at 35% white when off. */
const PICK = 28
const PICK_FILL = quickTransition('background-color', 'border-color')
const PICK_RING = 0.35
/** flow10.js `make`: a block inside the sheet is 8% white on iOS glass, sunken on Android's solid sheet. */
const SHEET_FILL = Platform.OS === 'android' ? COLOR.surfaceSunken : MATERIAL.fillOnGlass

export type NameStepProps = {
  name: string
  onName: (next: string) => void
  /** The name field lost focus: the screen may refuse a name that is too short or long now, rather than at Next. */
  onNameBlur?: () => void
  nameError?: string
  bio: string
  onBio: (next: string) => void
  bioError?: string
  /** null: an intent the picker has no chip for, left as it is (Edit crew). */
  choice: IntentChoice | null
  onChoice: (next: IntentChoice) => void
  tags: readonly string[]
  onTag: (slug: string) => void
  openToSolo: boolean
  onOpenToSolo: (next: boolean) => void
  /** The emblem's seed: Make's own until the crew is made (Shuffle), then the crew's, fixed. */
  emblemSeed: string
  /** Make a crew only: a new look. Absent once the crew exists (Edit crew), as the look is fixed. */
  onShuffle?: () => void
  intentText: string
}

/** Step 1 · Name and vibe, with the live preview of the card as strangers see it. */
export function NameStep(p: NameStepProps) {
  const bold = useBoldText()
  const contrast = useIncreaseContrast()
  const secondary = contrast ? COLOR.textPrimary : COLOR.textSecondary
  const bioInput = useRef<TextInput>(null)
  const labels = CREW_TAGS.filter((t) => p.tags.includes(t.slug)).map((t) => t.label)
  return (
    <>
      <TextField
        label="Name"
        value={p.name}
        onChangeText={p.onName}
        onBlur={p.onNameBlur}
        limit={CREW_NAME_MAX}
        error={p.nameError}
        autoCapitalize="words"
        returnKeyType="next"
        // Next moves on to the line about the crew rather than closing the keyboard.
        onSubmitEditing={() => bioInput.current?.focus()}
        submitBehavior="submit"
        testID="make-name"
      />
      <TextArea
        label="A line about the crew"
        value={p.bio}
        onChangeText={p.onBio}
        limit={CREW_BIO_MAX}
        minHeight={BIO_MIN_HEIGHT}
        inputRef={bioInput}
        error={p.bioError}
        testID="make-bio"
      />
      <View style={styles.group}>
        <View style={styles.labelRow}>
          <FieldLabel text="Here for" bold={bold} contrast={contrast} />
        </View>
        {/*
          Chips, each the width of its word: "Friendship" in a third of a 360 dp segmented control at Android's 1.3 broke
          mid-word (R6-6). A set wraps to a second row rather than squeeze a word; an intent the picker has no chip for
          (Edit crew) picks nothing.
        */}
        <ChipSet
          items={INTENT_CHOICES.map((c) => ({ key: c.value, label: c.label }))}
          selection="single"
          selected={p.choice ? [p.choice] : []}
          onToggle={(key) => p.onChoice(key as IntentChoice)}
          testID="make-intent"
        />
      </View>
      <ChipSet
        label="Tags"
        items={CREW_TAGS.map((t) => ({ key: t.slug, label: t.label }))}
        selection="multi"
        selected={p.tags}
        max={CREW_MAX_TAGS}
        capHint={`Up to ${CREW_MAX_TAGS}`}
        onToggle={p.onTag}
        testID="make-tags"
      />
      <View style={styles.toggleRow}>
        <View style={styles.fill}>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE.bodyStrong} style={[font('bodyStrong', bold), styles.ink]}>Room for one more</Text>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), { color: secondary }]}>Solo people who opt in can be liked for the crew. Crews of 6 or fewer.</Text>
        </View>
        <Toggle value={p.openToSolo} onValueChange={p.onOpenToSolo} accessibilityLabel="Room for one more" />
      </View>
      <View style={styles.group}>
        <View style={[styles.labelRow, styles.previewLabelRow]}>
          <FieldLabel text="As strangers will see it" bold={bold} contrast={contrast} />
          {p.onShuffle ? <Button label="Shuffle" icon="shuffle" kind="tertiary" size="sm" onPress={p.onShuffle} accessibilityLabel="Shuffle the crew’s look" /> : null}
        </View>
        <CrewCard
          compact
          onSheet
          // Make's preview dances on every Shuffle (each new seed plays it once); Edit crew's stays still.
          emblemScene={p.onShuffle ? 'dance' : undefined}
          crew={{
            name: p.name.trim() || 'Crew name',
            emblemSeed: p.emblemSeed,
            size: 1,
            here: 0,
            bio: p.bio.trim() || 'A line about the crew',
            // No placeholder chip: an outlined "Tags" read as something to tap (D-L17).
            tags: labels,
            intent: p.intentText,
          }}
        />
      </View>
    </>
  )
}

/** One friend in the picker: face, name, and a pick circle. A checkbox, the whole row the target. */
function FriendPick({ friend, picked, capped, onToggle }: { friend: Friend; picked: boolean; capped: boolean; onToggle: () => void }) {
  const bold = useBoldText()
  const sel = useSelection()
  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: picked, disabled: capped }}
      accessibilityLabel={`Ask ${friend.name}`}
      style={[styles.friend, capped && styles.capped]}
    >
      {friend.photo ? (
        <Avatar kind="photo" uri={friend.photo} size={FRIEND_FACE} />
      ) : (
        <Avatar kind="creature" pseudonym={friend.name} size={FRIEND_FACE} />
      )}
      <Text numberOfLines={1} maxFontSizeMultiplier={CONTROL_FONT_CAP} style={[font('bodyStrong', bold), styles.ink, styles.fill]}>
        {friend.name}
      </Text>
      {/* The pick lights in the screen's hue: the disc fills as the ink check draws itself. */}
      <Animated.View
        style={[
          styles.pick,
          { backgroundColor: picked ? sel.glyph : 'transparent', borderColor: picked ? sel.glyph : tint(COLOR.textPrimary, PICK_RING) },
          PICK_FILL,
        ]}
      >
        <Glyph name="check" size={ICON.inline} color={COLOR.selectionInk} active play={picked} />
      </Animated.View>
    </Pressable>
  )
}

export type FriendsStepProps = {
  /** null while it loads; 'failed' is not "no friends". */
  friends: Friend[] | null | 'failed'
  picked: readonly string[]
  onToggle: (userId: string) => void
  onRetry: () => void
  /** What an empty list says; Make a crew and Invite differ ("Every friend of yours is in this crew…"). */
  none?: string
  /** How many can be asked at most (24 for a new crew: 25 with you). At it, the rest dim and the footer says why. */
  limit?: number
  /** The friends are read a page at a time: asking for the next, and what the foot says while it comes or when it did not. */
  paging?: { hasMore: boolean; loadingMore: boolean; moreFailed: boolean; onMore: () => void }
  /**
   * Search over your friends (a word of the name starts with it). Offered when there is more than a screen of them: a short list is
   * seen whole. `active` is the word the list is narrowed to, so an empty result says "no friend by that name", not "none to ask".
   * Whoever is picked stays picked through a search: the picks are ids, not rows.
   */
  search?: { query: string; onChange: (text: string) => void; searching: boolean; active: boolean; offered: boolean }
  /**
   * Make a crew (board 02 A): a field label over the list ("Friends to ask · 3 picked") in place of the note, and a foot only at the
   * cap. Absent: Invite's note and its "n invited" foot, as before.
   */
  label?: string
}

/**
 * Step 2 · Invite friends: friends only, no search; the count says how many, never who was skipped.
 *
 * The rows are a FlatList of fixed 64 pt rows with a height of its own inside the tall sheet (as the venue's "Coming up
 * here" is), asking for the next page of friends as the end comes into view: a person with a thousand friends scrolls a
 * windowed list, not a thousand views. A failed page keeps the rows and says so with Try again.
 */
export function FriendsStep({ friends, picked, onToggle, onRetry, none = NO_FRIENDS, limit = CREW_MAX_MEMBERS - 1, paging, search, label }: FriendsStepProps) {
  const bold = useBoldText()
  const contrast = useIncreaseContrast()
  const secondary = contrast ? COLOR.textPrimary : COLOR.textSecondary
  const windowHeight = useWindowDimensions().height
  const full = picked.length >= limit
  const line = (text: string) => <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), styles.centre, { color: secondary }]}>{text}</Text>
  // As tall as its rows up to its share of the screen, and past that it scrolls.
  const listHeight = Array.isArray(friends) ? Math.min(friends.length * FRIEND_ROW + (paging && (paging.loadingMore || paging.moreFailed) ? FRIEND_ROW : 0), Math.round(windowHeight * LIST_SHARE)) : 0
  return (
    <>
      {label ? (
        <View style={styles.labelRow}>
          <FieldLabel text={label} bold={bold} contrast={contrast} />
        </View>
      ) : (
        // The meta role and its cap: uncapped body text filled 55% of the screen at AX XXXL and left one row (RC drive 5 D-3).
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), { color: secondary }]} testID="make-friends-note">
          Friends only. The count says how many, never who was skipped.
        </Text>
      )}
      {search && (search.offered || search.query) ? (
        <SearchField
          value={search.query}
          onChangeText={search.onChange}
          placeholder="Search friends"
          busy={search.searching}
          inSheet
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          maxLength={FRIEND_SEARCH_MAX}
          testID="friend-pick-search"
        />
      ) : null}
      <View style={styles.list}>
        {friends === null ? (
          line('Loading your friends…')
        ) : friends === 'failed' ? (
          <Pressable onPress={onRetry} accessibilityRole="button" accessibilityLabel="Your friends didn’t load — try again" hitSlop={minTarget()}>
            {line('Your friends didn’t load — try again')}
          </Pressable>
        ) : friends.length === 0 ? (
          line(search?.active ? 'No friend by that name.' : none)
        ) : (
          <FlatList
            testID="friend-pick-list"
            data={friends}
            extraData={picked}
            keyExtractor={(f) => f.userId}
            style={{ height: listHeight }}
            nestedScrollEnabled
            getItemLayout={(_data, index) => ({ length: FRIEND_ROW, offset: FRIEND_ROW * index, index })}
            initialNumToRender={FIRST_ROWS}
            windowSize={7}
            removeClippedSubviews
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            onEndReachedThreshold={1.5}
            onEndReached={() => paging?.hasMore && paging.onMore()}
            ListFooterComponent={
              paging ? <PagedFooter loading={paging.loadingMore} failed={paging.moreFailed} onRetry={paging.onMore} testID="friend-pick-more" /> : null
            }
            renderItem={({ item: f, index }) => (
              <View style={[styles.cell, index ? styles.divided : null]}>
                <FriendPick
                  friend={f}
                  picked={picked.includes(f.userId)}
                  capped={full && !picked.includes(f.userId)}
                  onToggle={() => onToggle(f.userId)}
                />
              </View>
            )}
          />
        )}
      </View>
      {label ? (
        // The label counts the picks; the foot speaks only at the cap, saying why the rest dim.
        full ? <View accessibilityLiveRegion="polite">{line(`A crew has at most ${CREW_MAX_MEMBERS} people.`)}</View> : null
      ) : (
        <View style={styles.footer} accessibilityLiveRegion="polite">
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE.body} style={[font('body', bold), styles.ink]}>
            <Text style={[font('body', bold, FONT_FAMILY.mono[500]), styles.ink]}>{picked.length}</Text>
            {' invited'}
          </Text>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), full ? styles.ink : { color: secondary }, styles.note]}>
            {full ? `A crew has at most ${CREW_MAX_MEMBERS} people.` : 'Invites last 14 days'}
          </Text>
        </View>
      )}
    </>
  )
}

/** The emblem beside the name on Make's first step (board 02 A). */
const MAKE_EMBLEM = 56

export type NameAndFriendsStepProps = {
  name: string
  onName: (next: string) => void
  onNameBlur?: () => void
  nameError?: string
  emblemSeed: string
  onShuffle: () => void
  /** The friends list, as `FriendsStep` takes it, less the label (this step writes it from the picks). */
  friends: Omit<FriendsStepProps, 'label'>
}

/**
 * Make, step 1 · Name and friends (board 02 A): the emblem draws live beside the name, and the friends come on the same
 * screen, because they are the point of a crew. The windowed picker is `FriendsStep`, under "Friends to ask · n picked".
 */
export function NameAndFriendsStep(p: NameAndFriendsStepProps) {
  return (
    <>
      <View style={styles.nameRow}>
        <View style={styles.emblemColumn}>
          {/* Each Shuffle is a new seed, and a new seed dances once (SCRUM-1053). */}
          <CrewEmblem seed={p.emblemSeed} size={MAKE_EMBLEM} scene="dance" testID="make-emblem-live" />
          <Button label="Shuffle" icon="shuffle" kind="tertiary" size="sm" onPress={p.onShuffle} accessibilityLabel="Shuffle the crew’s look" />
        </View>
        <View style={styles.fill}>
          <TextField
            value={p.name}
            onChangeText={p.onName}
            onBlur={p.onNameBlur}
            placeholder="Crew name"
            limit={CREW_NAME_MAX}
            error={p.nameError}
            autoCapitalize="words"
            returnKeyType="done"
            testID="make-name"
          />
        </View>
      </View>
      <FriendsStep {...p.friends} label={`Friends to ask · ${p.friends.picked.length} picked`} />
    </>
  )
}

export type VibeStepProps = {
  choice: IntentChoice
  onChoice: (next: IntentChoice) => void
  tags: readonly string[]
  onTag: (slug: string) => void
  openToSolo: boolean
  onOpenToSolo: (next: boolean) => void
  keepAnonymous: boolean
  onKeepAnonymous: (next: boolean) => void
}

/**
 * Make, step 2 · Your crew's vibe (board 02 A): all of it optional — here for, tags, Room for one more — and the consent,
 * which the step's button ("Make Nebula · ask 3 friends") agrees to. The line about the crew is not on the board's Make: it is
 * written on the crew page (Edit crew), which keeps its 140 and its moderation.
 */
export function VibeStep(p: VibeStepProps) {
  const bold = useBoldText()
  const contrast = useIncreaseContrast()
  const secondary = contrast ? COLOR.textPrimary : COLOR.textSecondary
  return (
    <>
      <View style={styles.group}>
        <View style={styles.labelRow}>
          <FieldLabel text="Here for · optional" bold={bold} contrast={contrast} />
        </View>
        <ChipSet
          items={INTENT_CHOICES.map((c) => ({ key: c.value, label: c.label }))}
          selection="single"
          selected={[p.choice]}
          onToggle={(key) => p.onChoice(key as IntentChoice)}
          testID="make-intent"
        />
      </View>
      <ChipSet
        label="Tags · optional"
        items={CREW_TAGS.map((t) => ({ key: t.slug, label: t.label }))}
        selection="multi"
        selected={p.tags}
        max={CREW_MAX_TAGS}
        capHint={`Up to ${CREW_MAX_TAGS}`}
        onToggle={p.onTag}
        testID="make-tags"
      />
      <View style={[styles.block, styles.blockRow]}>
        <View style={styles.fill}>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE.bodyStrong} style={[font('bodyStrong', bold), styles.ink]}>Room for one more</Text>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), { color: secondary }]}>Solo people who opt in can find you. Crews of 6 or fewer.</Text>
        </View>
        <Toggle value={p.openToSolo} onValueChange={p.onOpenToSolo} accessibilityLabel="Room for one more" />
      </View>
      <View style={styles.block}>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), { color: secondary }]}>{CONSENT_LINE}</Text>
        <View style={styles.blockRow}>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold, TYPE.bodyStrong.fontFamily), styles.ink, styles.fill]}>{KEEP_ANONYMOUS_LABEL}</Text>
          <Toggle value={p.keepAnonymous} onValueChange={p.onKeepAnonymous} accessibilityLabel={KEEP_ANONYMOUS_LABEL} />
        </View>
      </View>
    </>
  )
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: SPACE.md,
  },
  fill: { flex: 1 },
  ink: { color: COLOR.textPrimary },
  centre: { textAlign: 'center' },
  group: { gap: SPACE.sm },
  // FieldLabel carries the 4 pt left inset itself; the row adds only the right one (a counter beside it), not a second left.
  labelRow: { paddingRight: SPACE.xs },
  previewLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SPACE.sm },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
    minHeight: minTarget(),
  },
  list: {
    borderRadius: RADIUS.sheet,
    backgroundColor: SHEET_FILL,
    overflow: 'hidden',
    padding: 0,
  },
  friend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
    paddingHorizontal: SPACE.lg,
    flex: 1,
  },
  // Fixed, never a minimum: the list places any row from its index alone. The divider is inside the 64, not on top of it.
  cell: { height: FRIEND_ROW },
  divided: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLOR.hairline,
  },
  pick: {
    width: PICK,
    height: PICK,
    borderRadius: RADIUS.capsule,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  capped: { opacity: OPACITY.disabled },
  note: { flexShrink: 1, textAlign: 'right' },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  nameRow: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACE.md },
  emblemColumn: { alignItems: 'center', gap: SPACE.xs },
  // A filled block in the sheet (Room for one more, the consent), as board 02 A draws them.
  block: {
    borderRadius: RADIUS.sheet,
    backgroundColor: SHEET_FILL,
    padding: SPACE.lg,
    gap: SPACE.md,
  },
  blockRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md },
})

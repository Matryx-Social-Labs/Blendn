import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'

import { Avatar } from '../ds/Avatar'
import { Button } from '../ds/Button'
import { Chip } from '../ds/Chip'
import { monoCaption } from '../ds/MonoFamily'
import { font, SELECTION, useBoldText } from '../ds/shared'
import { Icon } from '../ui/Icon'
import { lobbyChips, newPostsWords, postAge, readOnlyLine, type LobbyCounts, type LobbyFilter, type LobbyHostPost } from '../../lib/lobby'
import { COLOR, FONT_FAMILY, ICON, MAX_FONT_SCALE, RADIUS, SIZE, SPACE } from '../../lib/design/tokens'
import { OPACITY, tint } from '../../lib/theme'

/**
 * The Lobby's own parts (L-A, `mockups/redesign-2026-11/lobby/` lobby.css): the composer row, the gates and the doors
 * banner in its slot, the closed and live-empty cards, the two starts, the host's pin, the chips and the new-posts pill.
 * Each is drawn from DS pieces and Foundations C hues (rose for the Lobby, violet for you, ember for the host).
 */

const ROSE = SELECTION.rose
const EMBER = SELECTION.ember
/** lobby.css `.lp` / `.lpin` / `.lro`: the board's cards are 24, a step under the DS card's 32. */
const CARD_RADIUS = RADIUS.sheet
/** `.hlab` / `.you`: the Host and You capsules are 22 tall. */
const LABEL_HEIGHT = 22
/** `.lro .r1`: the doors glyph is 18, between the inline 16 and the control 20. */
const BANNER_GLYPH = 18
/** `.lcomp`: the composer row is a 52 pt capsule. */
const COMPOSER_HEIGHT = 52

function Line({ children, strong, lede, style, testID }: { children: string; strong?: 'group' | 'rowTitle' | 'heading'; lede?: boolean; style?: object; testID?: string }) {
  const bold = useBoldText()
  // A second line is 15 pt regular: 15/22 where the board draws it so (`.lro`, `.lend`: the lede role), else 15/20.
  const role = strong ? font(strong, bold) : lede ? font('lede', bold) : font('control', bold, FONT_FAMILY.brand[400])
  return (
    <Text testID={testID} maxFontSizeMultiplier={MAX_FONT_SCALE.body} style={[role, strong ? styles.ink : styles.secondary, style]}>
      {children}
    </Text>
  )
}

/** "Post something": the whole row opens the sheet; the photo well too, until C-A gives it the picker. */
export function LobbyComposerRow({ seed, onCompose }: { seed: string | null; onCompose: () => void }) {
  const bold = useBoldText()
  return (
    <Pressable
      testID="lobby-composer"
      onPress={onCompose}
      accessibilityRole="button"
      accessibilityLabel="Post something"
      style={({ pressed }) => [styles.composer, pressed && styles.pressed]}
    >
      <Avatar kind="creature" pseudonym={seed ?? 'you'} size={40} />
      <Text numberOfLines={1} maxFontSizeMultiplier={MAX_FONT_SCALE.body} style={[font('body', bold), styles.secondary, styles.flex]}>
        Post something
      </Text>
      <View style={styles.imageWell} importantForAccessibility="no-hide-descendants">
        <Icon name="image" size={ICON.control} color={COLOR.textPrimary} />
      </View>
    </Pressable>
  )
}

/** The composer's slot when posting needs one thing first: going, or a finished profile. */
export function LobbyGate({ gate, busy, refusal, onPress }: { gate: 'going' | 'profile'; busy?: boolean; refusal?: string | null; onPress: () => void }) {
  const going = gate === 'going'
  return (
    <View testID={`lobby-gate-${gate}`} style={styles.gate}>
      <Icon name={going ? 'calendar-check' : 'user'} size={ICON.control} color={going ? ROSE.glyph : SELECTION.violet.glyph} />
      <View style={styles.flex}>
        <Line strong="rowTitle">{going ? 'Say you’re going to post' : 'Finish your profile to post'}</Line>
        <Line>{going ? 'You can read along now; posting is for people going.' : 'A few words about you. People here only see your room name.'}</Line>
        {refusal ? <Line style={styles.refused}>{refusal}</Line> : null}
      </View>
      {/* The screen's one hue (rose) for both: the board draws Finish in violet, but a component never sets its own world. */}
      <Button kind="lit" size="md" label={going ? 'I’m going' : 'Finish'} loading={busy} onPress={onPress} />
    </View>
  )
}

/** At doors (start − 90): read-only, until when, and the room. */
export function ReadOnlyBanner({ closesAt, timeZone, onOpenRoom }: { closesAt?: string; timeZone?: string | null; onOpenRoom: () => void }) {
  return (
    <View testID="lobby-read-only" style={[styles.card, styles.readOnly]}>
      <View style={styles.row}>
        <Icon name="door-open" size={BANNER_GLYPH} color={ROSE.glyph} />
        <Line strong="group">The doors are open</Line>
      </View>
      <Line lede>{readOnlyLine(closesAt, timeZone)}</Line>
      <Button kind="primary" size="pill" icon="door-open" label="Open the room" onPress={onOpenRoom} style={styles.start} testID="lobby-open-room" />
    </View>
  )
}

/** 4b: a live Lobby nobody posted in says the room is the place now. */
export function LiveEmptyCard({ onOpenRoom }: { onOpenRoom: () => void }) {
  return (
    <View testID="lobby-live-empty" style={[styles.card, styles.readOnly]}>
      <View style={styles.row}>
        <Icon name="door-open" size={BANNER_GLYPH} color={ROSE.glyph} />
        <Line strong="group">Nobody posted in the Lobby.</Line>
      </View>
      <Line lede>The room is open.</Line>
      <Button kind="primary" size="pill" icon="door-open" label="Open the room" onPress={onOpenRoom} style={styles.start} testID="lobby-open-room" />
    </View>
  )
}

/** A day after the end the Lobby closes with the room: no way forward from here, and none is offered. */
export function ClosedCard() {
  return (
    <View testID="lobby-closed" style={[styles.card, styles.closed]}>
      <Icon name="door-closed" size={ICON.nav} color={ROSE.glyph} />
      <Line strong="heading" style={styles.closedTitle}>The Lobby has closed</Line>
      <Line lede>The Lobby and the room close a day after the event ends. Your friends, chats and crews are where they were.</Line>
    </View>
  )
}

/** Nobody posted yet: the two ways to start, then what posting means. */
export function LobbyStarts({ ticketsHidden, onStart }: { ticketsHidden?: boolean; onStart: (kind: 'offer' | 'seeking') => void }) {
  const start = (kind: 'offer' | 'seeking', icon: 'car' | 'search', title: string, hint: string) => (
    <Pressable
      testID={`lobby-start-${kind}`}
      onPress={() => onStart(kind)}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${hint}`}
      style={({ pressed }) => [styles.card, styles.startCard, pressed && styles.pressed]}
    >
      <Icon name={icon} size={ICON.nav} color={ROSE.glyph} />
      <Line strong="group">{title}</Line>
      <Line>{hint}</Line>
    </Pressable>
  )
  return (
    <View style={styles.startsWrap}>
      <View testID="lobby-starts" style={styles.starts}>
        {start('offer', 'car', 'I have spots', ticketsHidden ? 'A ride or a table.' : 'A ride, a table or a spare ticket.')}
        {start('seeking', 'search', 'I’m looking', 'Going alone? Find someone to go with.')}
      </View>
      <Line testID="lobby-starts-line">Nobody’s posted yet. Posts go up under your room name. Nobody sees who you are unless you both say yes.</Line>
    </View>
  )
}

/** The host's note, pinned first on All: ember, labelled Host, and the organizer's name, never a person's. */
export function PinnedPost({ pin }: { pin: LobbyHostPost }) {
  const bold = useBoldText()
  return (
    <View testID="lobby-pinned" style={[styles.card, styles.pinned]}>
      <View style={styles.pinLabel}>
        <Icon name="pin" size={ICON.inline} color={EMBER.glyph} />
        <Text accessibilityLabel="Pinned" maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[monoCaption(bold), styles.pinWord]}>
          PINNED
        </Text>
      </View>
      <View style={styles.row}>
        <View style={styles.hostMark} importantForAccessibility="no-hide-descendants">
          <Icon name="megaphone" size={ICON.control} color={EMBER.glyph} />
        </View>
        <View style={styles.flex}>
          <Text testID="lobby-pin-host" numberOfLines={1} maxFontSizeMultiplier={MAX_FONT_SCALE.bodyStrong} style={[font('rowTitle', bold), styles.ink]}>
            {pin.host}
          </Text>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[monoCaption(bold), styles.secondary]}>
            {postAge(pin.updatedAt || pin.createdAt)}
          </Text>
        </View>
        <Label text="Host" fill={EMBER.fill} ink={EMBER.glyph} testID="lobby-pin-label" />
      </View>
      <Text testID="lobby-pin-body" maxFontSizeMultiplier={MAX_FONT_SCALE.body} style={[font('body', bold), styles.ink]}>
        {pin.body}
      </Text>
    </View>
  )
}

/** A small capsule beside a name: "Host" in ember, "You" in violet. */
export function Label({ text, fill, ink, testID }: { text: string; fill: string; ink: string; testID?: string }) {
  const bold = useBoldText()
  return (
    <View testID={testID} style={[styles.label, { backgroundColor: fill }]}>
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('caption', bold), { color: ink }]}>
        {text}
      </Text>
    </View>
  )
}

/** One row that scrolls sideways; counts compact (1.2k), the screen reader hears them whole. */
export function LobbyChips({ counts, filter, onFilter }: { counts: LobbyCounts; filter: LobbyFilter; onFilter: (f: LobbyFilter) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} style={styles.chipsRow} testID="lobby-chips">
      {lobbyChips(counts).map((c) => (
        <Chip
          key={c.key}
          label={c.label}
          count={c.count}
          size="header"
          selection="single"
          selected={filter === c.key}
          // The board's selected chip leads with a check; the rest carry none (a single pick, not the + / ✓ slot).
          icon={filter === c.key ? 'check' : undefined}
          onPress={() => onFilter(c.key)}
          accessibilityLabel={`${c.label}, ${c.exact} ${c.exact === 1 ? 'post' : 'posts'}`}
          testID={`lobby-chip-${c.key}`}
        />
      ))}
    </ScrollView>
  )
}

/** New posts wait behind this, so the list never jumps under a reader's thumb. */
export function NewPostsPill({ count, top, onPress }: { count: number; top: number; onPress: () => void }) {
  const bold = useBoldText()
  const words = newPostsWords(count)
  return (
    <Pressable
      testID="lobby-new-posts"
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${words}. Show them`}
      accessibilityLiveRegion="polite"
      style={({ pressed }) => [styles.newPill, { top }, pressed && styles.pressed]}
    >
      <Icon name="arrow-up" size={ICON.inline} color={COLOR.textPrimary} />
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('control', bold), styles.ink]}>
        {words}
      </Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  ink: { color: COLOR.textPrimary },
  secondary: { color: COLOR.textSecondary },
  refused: { color: COLOR.destructive },
  pressed: { opacity: OPACITY.pressed },
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm + SPACE.xxs },
  card: { backgroundColor: COLOR.surface, borderRadius: CARD_RADIUS, borderWidth: StyleSheet.hairlineWidth, borderColor: COLOR.hairline },

  composer: {
    minHeight: COMPOSER_HEIGHT,
    borderRadius: RADIUS.capsule,
    backgroundColor: COLOR.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLOR.hairline,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.sm + SPACE.xxs,
    paddingLeft: SPACE.sm + SPACE.xxs,
    paddingRight: SPACE.xs + SPACE.xxs,
  },
  imageWell: { width: SIZE.circleButtonSm, height: SIZE.circleButtonSm, borderRadius: RADIUS.capsule, backgroundColor: COLOR.chipFillOnGlass, alignItems: 'center', justifyContent: 'center' },

  gate: { backgroundColor: COLOR.surface, borderRadius: CARD_RADIUS, flexDirection: 'row', alignItems: 'center', gap: SPACE.md, paddingVertical: SPACE.md + SPACE.xxs, paddingHorizontal: SPACE.lg },

  readOnly: { padding: SPACE.lg - 1, gap: SPACE.xs, borderWidth: 1, borderColor: tint(ROSE.edge, 0.55) },
  start: { alignSelf: 'flex-start', marginTop: SPACE.sm + SPACE.xxs },
  closed: { padding: SPACE.lg + SPACE.xs, gap: SPACE.xs + SPACE.xxs, alignItems: 'flex-start' },
  closedTitle: { marginTop: SPACE.xs + SPACE.xxs },

  startsWrap: { gap: SPACE.lg },
  starts: { flexDirection: 'row', gap: SPACE.md },
  startCard: { flex: 1, padding: SPACE.lg - 1, gap: SPACE.xs, borderWidth: 1, borderColor: tint(ROSE.edge, 0.45) },

  // A 1 pt edge sits inside the box, so the padding gives that point back (`.lpin` draws it as an inset shadow).
  pinned: { padding: SPACE.lg - 1, paddingTop: SPACE.md - 1, gap: SPACE.sm + SPACE.xxs, borderWidth: 1, borderColor: tint(EMBER.edge, 0.45) },
  pinLabel: { flexDirection: 'row', alignItems: 'center', gap: SPACE.xs + SPACE.xxs },
  pinWord: { color: EMBER.glyph, letterSpacing: 0.6 },
  hostMark: { width: 40, height: 40, borderRadius: RADIUS.capsule, backgroundColor: EMBER.fill, borderWidth: 1, borderColor: EMBER.edge, alignItems: 'center', justifyContent: 'center' },
  label: { minHeight: LABEL_HEIGHT, paddingHorizontal: SPACE.sm, borderRadius: RADIUS.capsule, justifyContent: 'center' },

  chipsRow: { marginHorizontal: -SPACE.gutter },
  chips: { gap: SPACE.sm, paddingHorizontal: SPACE.gutter },

  newPill: {
    position: 'absolute',
    alignSelf: 'center',
    zIndex: 5,
    minHeight: SIZE.tagHeader,
    paddingHorizontal: SPACE.md + SPACE.xxs,
    borderRadius: RADIUS.capsule,
    backgroundColor: ROSE.fill,
    borderWidth: 1,
    borderColor: ROSE.edge,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.xs + SPACE.xxs,
  },
})

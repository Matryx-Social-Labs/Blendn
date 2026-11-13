import { router } from 'expo-router'
import { Pressable, StyleSheet, Text, View } from 'react-native'

import { COLOR, ICON, RADIUS, SPACE, MAX_FONT_SCALE, TYPE } from '../../lib/design/tokens'
import { OPACITY } from '../../lib/theme'
import { crewBadge, stripCrewsFrom, type Crew, type CrewCard as CrewCardData, type CrewsAtEvent } from '../../lib/crews'
import { Button } from '../ds/Button'
import { CrewCard } from '../ds/CrewCard'
import { CrewStrip, type StripCrew } from '../ds/CrewStrip'
import { LikingAsChip } from '../ds/LikingAsChip'
import { Spinner } from '../ds/Loader'
import { SectionHeader } from '../ds/SectionHeader'
import { font, minTarget, useAnnounced, useBoldText } from '../ds/shared'
import { Icon } from '../ui/Icon'
import { Toggle } from '../ds/Toggle'
import { useOpenToCrews, type CrewActions, type CrewsHereState } from '../crews/CrewsView'
import { NO_LONGER_AVAILABLE } from '../../lib/noLongerAvailable'

type MyCrewHere = CrewsAtEvent['myCrews'][number]

/** Flow 10b `soloCard`: the words, on and off. */
const SOLO_ON = 'Crews with room for one more can see you until the night ends. Nobody else learns you turned this on.'
const SOLO_OFF = 'Crews with room for one more can see you; nobody else learns you turned this on.'

/**
 * Your crews here, under the visibility line in the People view and in the pass after your check-in (crews 4-A3): "Nebula ·
 * 3 of 5 in" and who came in with it, by first name. Nothing when nobody told any of your crews here. A row that names you
 * the first time it is drawn cheers once (your crew check-in moment; `cheerKey`, per crew per event).
 */
export function PeopleCrewStrip({
  eventId,
  myCrews,
  mine,
  eventTitle,
  inset = true,
}: {
  eventId: string
  myCrews: MyCrewHere[]
  mine: Crew[] | null
  eventTitle: string
  /** In the Room, between the gutters; in the pass, its own padding. */
  inset?: boolean
}) {
  const crews: StripCrew[] = stripCrewsFrom(myCrews, mine ?? [], eventTitle).map((row) => ({ ...row, cheerKey: `${eventId}|${row.id}` }))
  if (crews.length === 0) return null
  return (
    <View style={inset && styles.gutter}>
      <CrewStrip crews={crews} testID="room-crew-strip" />
    </View>
  )
}

/**
 * The Crews view's head (Flow 4 delta R2-D1 03′–04′, Flow 10 · 10.7): for a
 * solo person, "Open to joining a crew tonight?" first; then "Crews here · N"
 * with "Liking as" and its chip; then the state of the list. The cards are
 * rows of the Room's own list (virtualised).
 */
export function CrewsHead({
  eventId,
  checkInKey,
  crews,
  likingAs,
  pseudonym,
  onLikingAs,
}: {
  eventId: string
  /** The check-in this is about (its time): the switch is read once per check-in. */
  checkInKey: string
  crews: CrewsHereState
  /** The crew a like goes out as, null for "Just me"; undefined hides the chip (nothing to choose, or a like would still ask). */
  likingAs: { name: string; emblemSeed: string } | null | undefined
  /** Yours tonight, for "Just me"'s creature. */
  pseudonym: string
  onLikingAs: () => void
}) {
  const bold = useBoldText()
  const { state, reload } = crews
  const open = useOpenToCrews(eventId, checkInKey)
  const solo = state.status === 'ready' && state.data.myCrews.length === 0
  const ready = state.status === 'ready' && state.data.crewsEnabled

  return (
    <View style={[styles.gutter, styles.head]}>
      {solo ? (
        <View testID="room-solo-card" style={styles.solo}>
          <View style={styles.soloRow}>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE.bodyStrong} style={[font('bodyStrong', bold), styles.ink, styles.fill]}>Open to joining a crew tonight?</Text>
            <Toggle
              value={open.value ?? false}
              onValueChange={(v) => void open.set(v)}
              accessibilityLabel="Open to joining a crew tonight"
              disabled={open.busy || (open.value === null && !open.readFailed)}
              testID="room-solo-toggle"
            />
          </View>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), styles.secondary]}>{open.value ? SOLO_ON : SOLO_OFF}</Text>
          {open.readFailed ? (
            <Pressable
              onPress={() => void open.read()}
              accessibilityRole="button"
              hitSlop={(minTarget() - TYPE.meta.lineHeight) / 2}
              style={({ pressed }) => pressed && styles.pressed}
              testID="room-solo-retry"
            >
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), styles.secondary]}>Couldn’t check whether this is on. Tap to try again.</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <SectionHeader
        title="Crews here"
        count={ready ? state.data.total : undefined}
        testID="room-crews-head"
        right={
          ready && likingAs !== undefined ? (
            <View style={styles.likingAs}>
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), styles.secondary]}>Sending as</Text>
              <LikingAsChip crew={likingAs} pseudonym={pseudonym} onPress={onLikingAs} testID="room-liking-as" />
            </View>
          ) : undefined
        }
      />

      {state.status === 'loading' ? (
        <Spinner />
      ) : state.status === 'not_here' ? (
        <Line text="Check in to see the crews here." />
      ) : state.status === 'gone' ? (
        <Line text={NO_LONGER_AVAILABLE.line} />
      ) : state.status === 'error' ? (
        <Pressable
          onPress={() => void reload()}
          accessibilityRole="button"
          hitSlop={(minTarget() - TYPE.body.lineHeight) / 2}
          style={({ pressed }) => pressed && styles.pressed}
          testID="room-crews-retry"
        >
          <Line text="The crews didn’t load. Tap to try again." />
        </Pressable>
      ) : !state.data.crewsEnabled ? (
        <Line text="Crews are off at this event." />
      ) : state.data.crews.length === 0 ? (
        solo && open.value ? (
          // 10-7 · 16: nobody here to like, and you have no crew of your own: the way to one is your friends (Make a crew).
          <Pressable
            onPress={() => router.push('/crews/new')}
            accessibilityRole="button"
            accessibilityHint="Opens Make a crew"
            testID="room-no-crew"
            style={styles.noCrew}
          >
            <View style={styles.fill}>
              <Line text="No crew yet — make one from your friends." />
            </View>
            <Icon name="chevron-right" size={ICON.inline} color={COLOR.textTertiary} />
          </Pressable>
        ) : (
          <Line
            text={
              solo
                ? 'Turn on “Open to joining a crew tonight” to see crews with room for one more.'
                : 'No other crews here yet. A crew shows once two of them have checked in.'
            }
          />
        )
      ) : null}
    </View>
  )
}

function Line({ text }: { text: string }) {
  const bold = useBoldText()
  return <Text maxFontSizeMultiplier={MAX_FONT_SCALE.body} style={[font('body', bold), styles.secondary]}>{text}</Text>
}

/**
 * One crew here, as strangers see it: the compact CrewCard, liked as your side.
 * ponytail: no tap yet — R2-D1's "crew detail as a stranger" has no screen
 * (`/crews/[crewId]` is a member's); add `onPress` when one exists.
 */
export function RoomCrewCard({
  card,
  actions,
  as,
  index,
}: {
  card: CrewCardData
  actions: CrewActions
  as: string | null
  index: number
}) {
  return (
    <View style={styles.gutter}>
      <CrewCard
        compact
        crew={{ name: card.name, emblemSeed: card.emblemSeed, size: card.size, here: card.presentCount, bio: card.bio, tags: card.tags.map((t) => t.label), badge: crewBadge(card.badges) }}
        overlap={card.overlaps?.[0]?.text ?? null}
        // Liked: no crew named. Who sent it isn't known here, and the chip's current crew may not be it.
        like={{ liked: card.youLiked, as: card.youLiked ? null : as, onPress: () => void actions.like(card) }}
        onMore={() => actions.report(card)}
        testID={`room-crew-${index}`}
      />
    </View>
  )
}

const MORE_CREWS_FAILED = 'More crews didn’t load.'

/** Under the cards: the next page, or why it did not come. */
export function CrewsFoot({ crews }: { crews: CrewsHereState }) {
  const bold = useBoldText()
  const { state, loadMore, loadingMore, pageFailed } = crews
  useAnnounced(pageFailed && MORE_CREWS_FAILED)
  if (state.status !== 'ready' || !state.data.hasMore) return null
  return (
    <View style={[styles.gutter, styles.foot]}>
      {pageFailed ? (
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} accessibilityLiveRegion="polite" style={[font('meta', bold), styles.secondary]}>
          {MORE_CREWS_FAILED}
        </Text>
      ) : null}
      <Button kind="secondary" label={pageFailed ? 'Try again' : 'More crews'} onPress={() => void loadMore()} loading={loadingMore} />
    </View>
  )
}

const styles = StyleSheet.create({
  gutter: { paddingHorizontal: SPACE.gutter },
  head: { gap: SPACE.md },
  fill: { flex: 1 },
  // The line is a way to Make a crew: a full target tall, the line and a chevron.
  noCrew: { minHeight: minTarget(), flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  ink: { color: COLOR.textPrimary },
  secondary: { color: COLOR.textSecondary },
  solo: { borderRadius: RADIUS.sheet, backgroundColor: COLOR.surface, padding: SPACE.lg, gap: SPACE.sm },
  soloRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md },
  likingAs: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  foot: { gap: SPACE.sm, paddingTop: SPACE.md },
  pressed: { opacity: OPACITY.pressed },
})

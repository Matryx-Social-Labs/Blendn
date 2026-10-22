import { barHeight, barTop } from '../../lib/barGeometry'
import { Image } from 'expo-image'
import { router, useLocalSearchParams } from 'expo-router'
import React, { memo, useCallback, useEffect, useState } from 'react'
import { Animated, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { BrokenLink } from '../../components/chat/BrokenLink'
import { LeaveRoomSheet, leavePlaceLine, MuteSheet } from '../../components/chat/RoomSheets'
import { SenderCard, type Sender } from '../../components/chat/SenderCard'
import { Avatar } from '../../components/ds/Avatar'
import { IconButton } from '../../components/ds/IconButton'
import { ScrimPill, TimeBadge } from '../../components/ds/MonoFamily'
import { SectionHeader } from '../../components/ds/SectionHeader'
import { SettingsGroup, SettingsRow } from '../../components/ds/SettingsRow'
import { font, HueProvider, minTarget, useBoldText } from '../../components/ds/shared'
import { StateScreen } from '../../components/ds/StateScreen'
import { Icon } from '../../components/ui/Icon'
import { PhotoScrim, StatusScrim } from '../../components/ui/GradientFill'
import { apiClient } from '../../lib/apiClient'
import { COMMUNITY_GUIDELINES_URL } from '../../lib/communityGuidelines'
import { COLOR, FONT_FAMILY, ICON, RADIUS, SPACE, TYPE } from '../../lib/design/tokens'
import { liveNowWord } from '../../lib/home'
import { openInApp } from '../../lib/links'
import { printable } from '../../lib/pulseSections'
import { Logger } from '../../lib/logger'
import { markSeed } from '../../lib/pseudonymAvatar'
import { isMuted, muteLabel, useRoomMute } from '../../lib/roomMembership'
import { useRoomRow } from '../../lib/roomRow'
import { idParam, nameParam } from '../../lib/routeParams'
import { showRoomReportOptions } from '../../lib/safetyUtils'
import { subscribeToChatMemberLeft } from '../../lib/socketClient'
import { useAuth } from '../../lib/useAuth'
import { OPACITY } from '../../lib/theme'

type Member = { userId: string; name: string | null; role: string }

const PAGE = 100
/** The hero: the cover, 300 tall (Room info frame). */
const HERO_HEIGHT = 300
/** The hero's head scrim (Flow 5 Room info: 160 tall on the frame). */
const STATUS_SCRIM_HEIGHT = 160
/** The crowd grid: four across, 12 apart, the creature 8 smaller than its cell. */
const COLUMNS = 4
const CELL_GAP = SPACE.md
const FACE_INSET = SPACE.sm
/** A name and a role badge grow with the text size only this far, so a row's height holds. */
const NAME_SCALE_CAP = 1.3
/** The danger zone's row: 64 tall, a hint under its title. */
const LEAVE_HEIGHT = 64

/** Only the two roles that change what someone can do here get a badge. */
const roleLabel = (role: string) => (role === 'admin' ? 'Organiser' : role === 'moderator' ? 'Moderator' : null)

/**
 * The room's info (Flow 5 Room info frames, R3-D5 5.12): the cover as a
 * scrimmed hero with the title, a still Live badge and the bell-slash chip
 * when you muted it; Mute · Guidelines · Report; the room's people as a crowd
 * of creatures with their role badges, each opening their card; Leave apart,
 * in the danger zone.
 *
 * - **Mute** silences the room's pushes to you and nothing else; nobody is told.
 * - **Leave** is the one removal that is yours to undo, and the confirm says so.
 * - **Report this room** is for what no single message shows.
 *
 * Members are drawn exactly as their bubbles: the creature seeded on their
 * pseudonym (`markSeed`).
 */
export default function ChatInfo() {
  if (!idParam(useLocalSearchParams().id)) return <BrokenLink />
  // Rose world, as the room it is about.
  return (
    <HueProvider value="rose">
      <ChatInfoInner />
    </HueProvider>
  )
}

/** How many are live at the place, as a bucket ("5–9"); null below 5, and until the place answers. */
function usePlaceBucket(venueId: string | undefined): string | null {
  const [bucket, setBucket] = useState<string | null>(null)
  useEffect(() => {
    if (!venueId) return
    let live = true
    apiClient
      .getVenue(venueId)
      .then((result) => {
        const now = result.success ? result.data?.live?.liveNow : null
        if (live) setBucket(liveNowWord(now))
      })
      .catch((error) => Logger.warn('chat', 'Could not load the place for its room', { error }))
    return () => {
      live = false
    }
  }, [venueId])
  return bucket
}

function ChatInfoInner() {
  const params = useLocalSearchParams<{ id: string; roomName?: string; eventTitle?: string }>()
  const chatGroupId = String(params.id)
  const insets = useSafeAreaInsets()
  const { width } = useWindowDimensions()
  const bold = useBoldText()
  const { user } = useAuth()
  const row = useRoomRow(chatGroupId)
  const mute = useRoomMute(chatGroupId)
  const muted = isMuted(mute)

  const [members, setMembers] = useState<Member[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  /* A later page that did not come: the rest stays where it was, with its own retry. */
  const [moreFailed, setMoreFailed] = useState(false)
  const [sheet, setSheet] = useState<'mute' | 'leave' | null>(null)
  const [cardFor, setCardFor] = useState<Sender | null>(null)
  // One value for the screen's life; a lazy state, so nothing reads a ref while rendering.
  const [scrollY] = useState(() => new Animated.Value(0))
  // The inset, then the back button's row, then the 10 pt the glass reaches under it.
  const shieldHeight = barHeight(insets.top, Platform.OS === 'android')

  const loadMembers = useCallback(
    (offset = 0) =>
      apiClient
        .getChatParticipants(chatGroupId, { limit: PAGE, offset })
        .then((result) => {
          if (!result.success || !result.data) {
            if (offset === 0) setFailed(true)
            else setMoreFailed(true)
            return
          }
          const page = result.data.participants.map((p) => ({ userId: p.userId, name: p.name, role: p.role }))
          setFailed(false)
          setMoreFailed(false)
          setTotal(result.data.totalCount)
          setMembers((prev) => (offset === 0 ? page : [...prev, ...page.filter((p) => !prev.some((m) => m.userId === p.userId))]))
        })
        .catch((error) => {
          Logger.error('chat', 'Error loading room members', { error })
          if (offset === 0) setFailed(true)
          else setMoreFailed(true)
        }),
    [chatGroupId]
  )

  /* The next page as the end comes into view; one at a time, and not while a page is failing (its retry is the way on). */
  const fetchMore = () => {
    if (loading || failed || loadingMore || members.length >= total) return
    setLoadingMore(true)
    void loadMembers(members.length).finally(() => setLoadingMore(false))
  }
  const loadMore = () => {
    if (!moreFailed) fetchMore()
  }

  useEffect(() => {
    void loadMembers().finally(() => setLoading(false))
  }, [loadMembers])

  /* Somebody leaving takes their creature off the grid at once, and the count with them. */
  useEffect(
    () =>
      subscribeToChatMemberLeft(chatGroupId, ({ userId }) => {
        setMembers((prev) => prev.filter((m) => m.userId !== userId))
        setTotal((t) => Math.max(0, t - 1))
      }),
    [chatGroupId]
  )

  // The server's row wins; the route's names are a first paint and never an image (see app/chat/[id].tsx).
  /*
   * A place's room (R4-D5 5-2): titled "‹place› · tonight", its size a bucket
   * from the place ("5–9"), never the exact total the event room shows — a
   * count that ticks as people go live tells you who just walked in (D-19).
   */
  const place = row?.venueId ? row.title : undefined
  const bucket = usePlaceBucket(row?.venueId)
  const title = place ? `${place} · tonight` : row?.title || nameParam(params.roomName) || nameParam(params.eventTitle) || 'Event chat'
  const eventTitle = place ? undefined : row?.eventTitle || nameParam(params.eventTitle)
  const cover = row?.image || null
  // A place says a bucket; a room says how many from five up, and nothing under it (the owner's floor).
  const roomCount = printable(row?.memberCount ?? (total || null))
  const count = row?.venueId ? bucket : roomCount === null ? null : roomCount.toLocaleString('en-US')

  const leaveHint = place ? leavePlaceLine(place) : 'Rejoin by checking in at the event again.'

  const openGuidelines = () => {
    openInApp(COMMUNITY_GUIDELINES_URL).catch((error) => Logger.warn('chat', 'Could not open the community guidelines', { error }))
  }

  const cell = (width - 2 * SPACE.gutter - (COLUMNS - 1) * CELL_GAP) / COLUMNS
  const face = cell - FACE_INSET
  /* One height for every row at every text size: the face, the gap and a name capped at 1.3x on one line. */
  const rowHeight = face + SPACE.sm + Math.ceil(TYPE.caption.lineHeight * NAME_SCALE_CAP)
  const showPeople = !loading && !failed

  const renderMember = ({ item: m }: { item: Member }) => (
    <MemberCell member={m} you={m.userId === user?.id} chatGroupId={chatGroupId} cell={cell} face={face} height={rowHeight} onOpen={setCardFor} />
  )

  const header = (
    <View>
      <View style={styles.hero}>
        {cover ? <Image source={{ uri: cover }} contentFit="cover" style={StyleSheet.absoluteFill} accessible={false} /> : null}
        <StatusScrim style={styles.headScrim} />
        <PhotoScrim style={styles.scrim} />
        <View style={styles.heroText}>
          {row?.live || muted ? (
            <View style={styles.badges}>
              {row?.live ? <TimeBadge when="Live" /> : null}
              {muted ? (
                <ScrimPill testID="info-muted">
                  <Icon name="bell-off" size={ICON.inline} />
                  <Text style={[font('caption', bold), styles.ink]}>{muteLabel(mute)}</Text>
                </ScrimPill>
              ) : null}
            </View>
          ) : null}
          <Text accessibilityRole="header" numberOfLines={2} style={[font('title', bold), styles.ink]}>
            {title}
          </Text>
          {count || (eventTitle && eventTitle !== title) ? (
            <Text style={[font('meta', bold), styles.ink]}>
              {count ? (
                <>
                  <Text style={[font('meta', bold, FONT_FAMILY.mono[500]), styles.tabular]}>{count}</Text> in the room
                </>
              ) : null}
              {count && eventTitle && eventTitle !== title ? ' · ' : ''}
              {eventTitle && eventTitle !== title ? eventTitle : ''}
            </Text>
          ) : null}
        </View>
      </View>

      <View style={styles.body}>
        <View style={styles.rows}>
          <SettingsGroup>
            <SettingsRow
              icon={muted ? 'bell-off' : 'bell'}
              title={muted ? `Notifications · ${muteLabel(mute)?.replace(/^Muted/, 'muted')}` : 'Mute notifications'}
              hint="Only your pushes. Nobody is told."
              trail="chevron"
              onPress={() => setSheet('mute')}
              testID="info-mute"
            />
          </SettingsGroup>
          <SettingsGroup>
            <SettingsRow icon="shield" title="Community guidelines" trail="external" onPress={openGuidelines} testID="info-guidelines" />
          </SettingsGroup>
          <SettingsGroup>
            <SettingsRow
              icon="flag"
              title="Report this room"
              hint="For what no single message shows."
              trail="chevron"
              onPress={() => showRoomReportOptions(chatGroupId)}
              testID="info-report"
            />
          </SettingsGroup>
        </View>

        {/* The truthful total (five and up), never the number loaded so far; a place says no count at all. */}
        <SectionHeader title="In the room" count={loading || failed || place ? undefined : (printable(total) ?? undefined)} testID="info-members" />
        {loading ? (
          <View style={styles.grid}>
            {Array.from({ length: COLUMNS * 2 }, (_, i) => (
              <View key={i} style={{ width: cell, alignItems: 'center' }}>
                <View style={[styles.skeleton, { width: face, height: face }]} />
              </View>
            ))}
          </View>
        ) : failed ? (
          <StateScreen
            icon="cloud-off"
            title="Couldn’t load who’s in this room"
            actions={[
              {
                label: 'Try again',
                onPress: () => {
                  setFailed(false)
                  setLoading(true)
                  void loadMembers().finally(() => setLoading(false))
                },
              },
            ]}
            testID="info-members-failed"
          />
        ) : null}
      </View>
    </View>
  )

  const footer = (
    <View style={styles.body}>
      {showPeople && loadingMore ? (
        <Text accessibilityRole="progressbar" accessibilityLabel="Loading more people" style={[font('meta', bold), styles.secondary, styles.more]}>
          Loading…
        </Text>
      ) : null}
      {showPeople && moreFailed ? (
        <Pressable
          testID="info-members-more-failed"
          onPress={() => {
            setMoreFailed(false)
            fetchMore()
          }}
          accessibilityRole="button"
          accessibilityLabel="Couldn’t load more people. Try again"
          hitSlop={(minTarget() - SPACE.xl) / 2}
          style={styles.more}
        >
          <Text style={[font('meta', bold, FONT_FAMILY.brand[700]), styles.ink]}>Couldn’t load more · Try again</Text>
        </Pressable>
      ) : null}

      {/* The danger zone: apart, after a hairline, in the destructive tint. */}
      <View style={styles.hairline} />
      <Pressable
        testID="info-leave"
        onPress={() => setSheet('leave')}
        accessibilityRole="button"
        accessibilityLabel="Leave room"
        accessibilityHint={leaveHint}
        style={({ pressed }) => [styles.leave, pressed && styles.pressed]}
      >
        <Icon name="log-out" size={ICON.control} />
        <View style={styles.leaveText}>
          <Text style={[font('bodyStrong', bold), styles.ink]}>Leave room</Text>
          <Text style={[font('meta', bold), styles.secondary]}>{leaveHint}</Text>
        </View>
      </Pressable>
    </View>
  )

  return (
    <View style={styles.screen}>
      {/* First in the tree, so a screen reader reaches Back before the list; zIndex keeps it over the scroll and its shield. */}
      <View style={[styles.back, { top: barTop(insets.top) }]}>
        <IconButton icon={Platform.OS === 'android' ? 'arrow-left' : 'chevron-left'} tier="media" accessibilityLabel="Back" onPress={() => router.back()} testID="info-back" />
      </View>

      {/*
       * The people are a virtualised list, four across, a page of 100 at a time as the end comes near: a concert
       * room's thousands never mount at once. Everything above them is the list's header, so the hero still scrolls
       * away under the shield, and the leave zone is its footer.
       */}
      <Animated.FlatList
        testID="info-list"
        data={showPeople ? members : []}
        keyExtractor={(m: Member) => m.userId}
        renderItem={renderMember}
        numColumns={COLUMNS}
        columnWrapperStyle={styles.gridRow}
        ListHeaderComponent={header}
        ListFooterComponent={footer}
        onEndReached={loadMore}
        onEndReachedThreshold={1.5}
        initialNumToRender={6}
        maxToRenderPerBatch={6}
        windowSize={7}
        removeClippedSubviews
        contentContainerStyle={{ paddingBottom: insets.bottom + SPACE.xxl }}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true })}
        scrollEventThrottle={16}
      />

      {/*
       * The status bar's and the back button's shield: clear over the hero
       * (the design draws the cover under the clock, behind its head scrim),
       * solid ink by the time the rows reach it — no row or heading passes
       * behind the clock or the floating back button.
       */}
      <Animated.View
        pointerEvents="none"
        testID="info-status-shield"
        style={[styles.shield, { height: shieldHeight, opacity: scrollY.interpolate({ inputRange: [HERO_HEIGHT - 2 * shieldHeight, HERO_HEIGHT - shieldHeight], outputRange: [0, 1], extrapolate: 'clamp' }) }]}
      />

      <MuteSheet chatGroupId={sheet === 'mute' ? chatGroupId : null} onClose={() => setSheet(null)} />
      <LeaveRoomSheet chatGroupId={sheet === 'leave' ? chatGroupId : null} place={place} onClose={() => setSheet(null)} onLeft={() => router.dismissTo('/(tabs)/chat')} />

      <SenderCard sender={cardFor} eventId={row?.eventId ?? null} chatGroupId={chatGroupId} onClose={() => setCardFor(null)} onBlocked={() => {}} />
    </View>
  )
}

/**
 * One person in the crowd: their creature, a role badge for the two roles that change what someone can do, and their
 * name. A fixed height, so the list can window. It draws no presence of any kind: who is online is not part of this
 * list, so nobody's "Show online status" is read here.
 */
const MemberCell = memo(function MemberCell({
  member,
  you,
  chatGroupId,
  cell,
  face,
  height,
  onOpen,
}: {
  member: Member
  you: boolean
  chatGroupId: string
  cell: number
  face: number
  height: number
  onOpen: (sender: Sender) => void
}) {
  const bold = useBoldText()
  const name = member.name || 'Someone'
  const role = roleLabel(member.role)
  return (
    <Pressable
      testID={`info-member-${member.userId}`}
      // R3-D5 5.12: a member opens the same card a message's sender does; not you.
      onPress={you ? undefined : () => onOpen({ id: member.userId, name })}
      disabled={you}
      accessibilityRole={you ? 'text' : 'button'}
      accessibilityLabel={[you ? 'You' : name, role].filter(Boolean).join(', ')}
      style={[styles.member, { width: cell, height }]}
    >
      <View>
        <Avatar size={face} kind="creature" pseudonym={markSeed(member.name, `${chatGroupId}:${member.userId}`)} />
        {role ? (
          <View style={styles.roleBadgePlace} pointerEvents="none">
            <View style={styles.roleBadge}>
              <Text numberOfLines={1} maxFontSizeMultiplier={NAME_SCALE_CAP} style={[font('label', bold), styles.onWhite]}>
                {role.toUpperCase()}
              </Text>
            </View>
          </View>
        ) : null}
      </View>
      <Text numberOfLines={1} maxFontSizeMultiplier={NAME_SCALE_CAP} style={[font('caption', bold), styles.ink]}>
        {you ? 'You' : name}
      </Text>
    </Pressable>
  )
})

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLOR.ink },
  hero: { height: HERO_HEIGHT, backgroundColor: COLOR.surface, overflow: 'hidden', justifyContent: 'flex-end' },
  scrim: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '66%' },
  heroText: { paddingHorizontal: SPACE.gutter, paddingBottom: SPACE.xl, gap: SPACE.sm },
  badges: { flexDirection: 'row', gap: SPACE.sm },
  body: { paddingHorizontal: SPACE.gutter, paddingTop: SPACE.lg, gap: SPACE.lg },
  rows: { gap: SPACE.sm, marginBottom: SPACE.lg },
  grid: { flexDirection: 'row', flexWrap: 'wrap', columnGap: CELL_GAP, rowGap: SPACE.md },
  gridRow: { paddingHorizontal: SPACE.gutter, columnGap: CELL_GAP, marginBottom: SPACE.md },
  member: { alignItems: 'center', gap: SPACE.sm },
  skeleton: { borderRadius: RADIUS.capsule, backgroundColor: COLOR.surface },
  /*
   * The badge is wider than the face it sits on ("ORGANISER"): placed in a band
   * wider than the cell, sized to its words, never wrapped (Android drive 2
   * broke it "ORGANIS / ER" inside the face's width).
   */
  roleBadgePlace: { position: 'absolute', bottom: -SPACE.xs, left: -CELL_GAP, right: -CELL_GAP, alignItems: 'center' },
  roleBadge: {
    flexShrink: 0,
    paddingHorizontal: SPACE.sm,
    borderRadius: RADIUS.capsule,
    backgroundColor: COLOR.textPrimary,
    borderWidth: SPACE.xxs,
    borderColor: COLOR.ink,
  },
  onWhite: { color: COLOR.ink },
  more: { alignSelf: 'flex-start', paddingVertical: SPACE.sm },
  hairline: { height: StyleSheet.hairlineWidth, backgroundColor: COLOR.hairline, marginTop: SPACE.sm },
  leave: {
    minHeight: LEAVE_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
    paddingHorizontal: SPACE.lg,
    borderRadius: RADIUS.rowInCard,
    backgroundColor: COLOR.destructiveTint,
  },
  pressed: { opacity: OPACITY.pressed },
  leaveText: { flex: 1, paddingVertical: SPACE.md },
  back: { position: 'absolute', left: SPACE.lg, zIndex: 2 },
  shield: { position: 'absolute', left: 0, right: 0, top: 0, zIndex: 1, backgroundColor: COLOR.ink },
  headScrim: { position: 'absolute', left: 0, right: 0, top: 0, height: STATUS_SCRIM_HEIGHT },
  ink: { color: COLOR.textPrimary },
  secondary: { color: COLOR.textSecondary },
  tabular: { fontVariant: ['tabular-nums'] },
})

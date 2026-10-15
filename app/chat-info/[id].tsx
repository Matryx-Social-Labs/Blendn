import { Image } from 'expo-image'
import { router, useLocalSearchParams } from 'expo-router'
import React, { useCallback, useEffect, useState } from 'react'
import { Linking, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { LeaveRoomSheet, MuteSheet } from '../../components/chat/RoomSheets'
import { SenderCard, type Sender } from '../../components/chat/SenderCard'
import { Avatar } from '../../components/ds/Avatar'
import { IconButton } from '../../components/ds/IconButton'
import { ScrimPill, TimeBadge } from '../../components/ds/MonoFamily'
import { SectionHeader } from '../../components/ds/SectionHeader'
import { SettingsGroup, SettingsRow } from '../../components/ds/SettingsRow'
import { font, minTarget, useBoldText } from '../../components/ds/shared'
import { StateScreen } from '../../components/ds/StateScreen'
import { Icon } from '../../components/ui/Icon'
import { PhotoScrim } from '../../components/ui/GradientFill'
import { apiClient } from '../../lib/apiClient'
import { COMMUNITY_GUIDELINES_URL } from '../../lib/communityGuidelines'
import { COLOR, FONT_FAMILY, ICON, RADIUS, SPACE } from '../../lib/design/tokens'
import { Logger } from '../../lib/logger'
import { markSeed } from '../../lib/pseudonymAvatar'
import { isMuted, muteLabel, useRoomMute } from '../../lib/roomMembership'
import { useRoomRow } from '../../lib/roomRow'
import { showRoomReportOptions } from '../../lib/safetyUtils'
import { subscribeToChatMemberLeft } from '../../lib/socketClient'
import { useAuth } from '../../lib/useAuth'
import { OPACITY } from '../../lib/theme'

type Member = { userId: string; name: string | null; role: string }

const PAGE = 100
/** The hero: the cover, 300 tall (Room info frame). */
const HERO_HEIGHT = 300
/** The crowd grid: four across, 12 apart, the creature 8 smaller than its cell. */
const COLUMNS = 4
const CELL_GAP = SPACE.md
const FACE_INSET = SPACE.sm
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
  const params = useLocalSearchParams<{ id: string; roomName?: string; eventTitle?: string; eventImage?: string }>()
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
  const [sheet, setSheet] = useState<'mute' | 'leave' | null>(null)
  const [cardFor, setCardFor] = useState<Sender | null>(null)

  const loadMembers = useCallback(
    (offset = 0) =>
      apiClient
        .getChatParticipants(chatGroupId, { limit: PAGE, offset })
        .then((result) => {
          if (!result.success || !result.data) {
            if (offset === 0) setFailed(true)
            return
          }
          const page = result.data.participants.map((p) => ({ userId: p.userId, name: p.name, role: p.role }))
          setFailed(false)
          setTotal(result.data.totalCount)
          setMembers((prev) => (offset === 0 ? page : [...prev, ...page.filter((p) => !prev.some((m) => m.userId === p.userId))]))
        })
        .catch((error) => {
          Logger.error('chat', 'Error loading room members', { error })
          if (offset === 0) setFailed(true)
        }),
    [chatGroupId]
  )

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

  const title = params.roomName || row?.title || params.eventTitle || 'Event chat'
  const eventTitle = params.eventTitle || row?.eventTitle
  const cover = params.eventImage || row?.image || null
  const count = row?.memberCount ?? (total || null)

  const openGuidelines = () => {
    Linking.openURL(COMMUNITY_GUIDELINES_URL).catch((error) => Logger.warn('chat', 'Could not open the community guidelines', { error }))
  }

  const cell = (width - 2 * SPACE.gutter - (COLUMNS - 1) * CELL_GAP) / COLUMNS
  const face = cell - FACE_INSET

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + SPACE.xxl }}>
        <View style={styles.hero}>
          {cover ? <Image source={{ uri: cover }} contentFit="cover" style={StyleSheet.absoluteFill} accessible={false} /> : null}
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

          <SectionHeader title="In the room" count={loading || failed ? undefined : total} testID="info-members" />
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
          ) : (
            <View style={styles.grid}>
              {members.map((m) => {
                const you = m.userId === user?.id
                const name = m.name || 'Someone'
                const role = roleLabel(m.role)
                return (
                  <Pressable
                    key={m.userId}
                    testID={`info-member-${m.userId}`}
                    // R3-D5 5.12: a member opens the same card a message's sender does; not you.
                    onPress={you ? undefined : () => setCardFor({ id: m.userId, name })}
                    disabled={you}
                    accessibilityRole={you ? 'text' : 'button'}
                    accessibilityLabel={[you ? 'You' : name, role].filter(Boolean).join(', ')}
                    style={[styles.member, { width: cell }]}
                  >
                    <View>
                      <Avatar size={face} kind="creature" pseudonym={markSeed(m.name, `${chatGroupId}:${m.userId}`)} />
                      {role ? (
                        <View style={styles.roleBadge}>
                          <Text maxFontSizeMultiplier={1.3} style={[font('label', bold), styles.onWhite]}>
                            {role.toUpperCase()}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                    <Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={[font('caption', bold), styles.ink]}>
                      {you ? 'You' : name}
                    </Text>
                  </Pressable>
                )
              })}
            </View>
          )}
          {!loading && !failed && members.length < total ? (
            <Pressable
              onPress={() => {
                setLoadingMore(true)
                void loadMembers(members.length).finally(() => setLoadingMore(false))
              }}
              disabled={loadingMore}
              accessibilityRole="button"
              accessibilityState={{ busy: loadingMore }}
              hitSlop={(minTarget() - SPACE.xl) / 2}
              style={styles.more}
            >
              <Text style={[font('meta', bold, FONT_FAMILY.brand[700]), styles.ink]}>{loadingMore ? 'Loading…' : 'Show more'}</Text>
            </Pressable>
          ) : null}

          {/* The danger zone: apart, after a hairline, in the destructive tint. */}
          <View style={styles.hairline} />
          <Pressable
            testID="info-leave"
            onPress={() => setSheet('leave')}
            accessibilityRole="button"
            accessibilityLabel="Leave room"
            accessibilityHint="Rejoin by checking in at the event again."
            style={({ pressed }) => [styles.leave, pressed && styles.pressed]}
          >
            <Icon name="log-out" size={ICON.control} />
            <View style={styles.leaveText}>
              <Text style={[font('bodyStrong', bold), styles.ink]}>Leave room</Text>
              <Text style={[font('meta', bold), styles.secondary]}>Rejoin by checking in at the event again.</Text>
            </View>
          </Pressable>
        </View>
      </ScrollView>

      <View style={[styles.back, { top: insets.top + SPACE.sm }]}>
        <IconButton icon="chevron-left" tier="media" accessibilityLabel="Back" onPress={() => router.back()} testID="info-back" />
      </View>

      <MuteSheet chatGroupId={sheet === 'mute' ? chatGroupId : null} onClose={() => setSheet(null)} />
      <LeaveRoomSheet chatGroupId={sheet === 'leave' ? chatGroupId : null} onClose={() => setSheet(null)} onLeft={() => router.dismissTo('/(tabs)/chat')} />

      <SenderCard sender={cardFor} eventId={row?.eventId ?? null} chatGroupId={chatGroupId} onClose={() => setCardFor(null)} onBlocked={() => {}} />
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLOR.ink },
  hero: { height: HERO_HEIGHT, backgroundColor: COLOR.surface, overflow: 'hidden', justifyContent: 'flex-end' },
  scrim: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '66%' },
  heroText: { paddingHorizontal: SPACE.gutter, paddingBottom: SPACE.xl, gap: SPACE.sm },
  badges: { flexDirection: 'row', gap: SPACE.sm },
  body: { paddingHorizontal: SPACE.gutter, paddingTop: SPACE.lg, gap: SPACE.lg },
  rows: { gap: SPACE.sm, marginBottom: SPACE.lg },
  grid: { flexDirection: 'row', flexWrap: 'wrap', columnGap: CELL_GAP, rowGap: SPACE.md },
  member: { alignItems: 'center', gap: SPACE.sm },
  skeleton: { borderRadius: RADIUS.capsule, backgroundColor: COLOR.surface },
  roleBadge: {
    position: 'absolute',
    bottom: -SPACE.xs,
    alignSelf: 'center',
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
  back: { position: 'absolute', left: SPACE.lg },
  ink: { color: COLOR.textPrimary },
  secondary: { color: COLOR.textSecondary },
  tabular: { fontVariant: ['tabular-nums'] },
})

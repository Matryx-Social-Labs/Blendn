import { Ionicons } from '@expo/vector-icons'
import { router, Stack, useLocalSearchParams } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import React, { useCallback, useEffect, useState } from 'react'
import { FlatList, Linking, Pressable, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { AppHeader } from '../../components/AppHeader'
import { ChatLoadFailed } from '../../components/chat/ChatLoadFailed'
import { OptimizedImage } from '../../components/OptimizedImage'
import { SkeletonCircle, SkeletonLine } from '../../components/Skeleton'
import { DayHeading } from '../../components/ui/DayHeading'
import { apiClient } from '../../lib/apiClient'
import { COMMUNITY_GUIDELINES_URL } from '../../lib/communityGuidelines'
import { Logger } from '../../lib/logger'
import { pseudonymAvatar } from '../../lib/pseudonymAvatar'
import { showEventReportOptions } from '../../lib/safetyUtils'
import { CONTROL, EMBER, EMBER_RADIUS, GUTTER, ICON, SPACE, TYPE } from '../../lib/theme'
import { useAuth } from '../../lib/useAuth'

type Member = {
  userId: string
  name: string | null
  role: string
}

const PAGE = 100
const COVER = 56
const AVATAR = 40

/** Only the two roles that change what someone can do here get a word. */
const roleLabel = (role: string) => (role === 'admin' ? 'Organiser' : role === 'moderator' ? 'Moderator' : null)

/**
 * The room's info: what it is, who is in it, the guidelines, and a report.
 *
 * Reached from the options button in the room's header. Everyone is listed
 * as the room shows them — a pseudonym and a mark seeded exactly as the chat
 * bubble seeds it, so one person is one creature on both screens. Their id is
 * the room's handle for them (SCRUM-371), so tapping through opens the same
 * gated profile the Room's grid opens: the server decides what it shows.
 *
 * **No Leave and no Mute.** Neither has an endpoint — a button that could not
 * do what it says would be worse than none.
 */
function ChatInfoInner() {
  const params = useLocalSearchParams<{ id: string; roomName?: string; eventTitle?: string; eventImage?: string }>()
  const chatGroupId = String(params.id)
  const { user } = useAuth()

  const [members, setMembers] = useState<Member[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  // The event behind the room: the profile's Like needs it, and so does a report.
  const [event, setEvent] = useState<{ id: string; title: string; image: string | null } | null>(null)

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

  // Declared inside the effect: it sets state only after the request returns.
  useEffect(() => {
    const findEvent = async () => {
      // Cached by the Banter, so this is usually free. Same shapes it reads.
      const result = await apiClient.getChatGroups()
      if (!result.success || !result.data) return
      const data = result.data as unknown as Record<string, any>
      const rooms: Record<string, any>[] = Array.isArray(data) ? data : data.groups || data.rooms || data.data || []
      const room = rooms.find((g) => String(g.id || g.chat_room_id || g.chatRoomId || '') === chatGroupId)
      const id = room ? String(room.event_id || room.eventId || room.event?.id || '') : ''
      if (!room || !id) return
      setEvent({
        id,
        title: String(room.event?.title || room.event_title || room.eventTitle || params.eventTitle || ''),
        image: room.event?.coverImageUrl || room.event?.cover_image_url || room.coverImageUrl || room.cover_image_url || null,
      })
    }
    void findEvent()
  }, [chatGroupId, params.eventTitle])

  const title = params.roomName || params.eventTitle || event?.title || 'Event chat'
  const subtitle = params.eventTitle && params.eventTitle !== title ? params.eventTitle : null
  const cover = params.eventImage || event?.image || null

  const openMember = (member: Member) => {
    router.push({
      pathname: '/user/[id]',
      params: { id: member.userId, ...(event ? { eventId: event.id } : {}) },
    } as never)
  }

  const openGuidelines = () => {
    Linking.openURL(COMMUNITY_GUIDELINES_URL).catch((error) =>
      Logger.warn('chat', 'Could not open the community guidelines', { error })
    )
  }

  const header = (
    <View style={styles.header}>
      <View style={styles.room}>
        {cover ? (
          <OptimizedImage source={cover} recyclingKey={cover} style={styles.cover as never} width={COVER} height={COVER} contentFit="cover" />
        ) : (
          <View style={[styles.cover, styles.coverFallback]}>
            <Ionicons name="people" size={ICON.lg} color={EMBER.textPrimary} />
          </View>
        )}
        <View style={styles.roomText}>
          <Text style={styles.roomName} numberOfLines={2}>{title}</Text>
          {subtitle ? <Text style={styles.meta} numberOfLines={1}>{subtitle}</Text> : null}
        </View>
      </View>

      <View style={styles.rows}>
        <ActionRow icon="shield-checkmark-outline" label="Community guidelines" onPress={openGuidelines} trailing="open-outline" />
        {event ? (
          <ActionRow
            icon="flag-outline"
            label="Report this event"
            destructive
            onPress={() => showEventReportOptions(event.title || title, event.id)}
          />
        ) : null}
      </View>

      <DayHeading title="In the room" detail={loading || failed ? undefined : String(total)} />
    </View>
  )

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar style="light" />
      <AppHeader title="Room info" onBack={() => router.back()} />

      <FlatList
        data={loading || failed ? [] : members}
        keyExtractor={(m) => m.userId}
        ListHeaderComponent={header}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => {
          const you = item.userId === user?.id
          const mark = pseudonymAvatar(`${chatGroupId}:${item.userId}`)
          const role = roleLabel(item.role)
          const name = you ? 'You' : item.name || 'Attendee'
          return (
            <Pressable
              onPress={you ? undefined : () => openMember(item)}
              disabled={you}
              accessibilityRole={you ? 'text' : 'button'}
              accessibilityLabel={role ? `${name}, ${role}` : name}
              accessibilityHint={you ? undefined : 'Opens their profile'}
              style={({ pressed }) => [styles.member, pressed && styles.pressed]}
            >
              <View style={[styles.avatar, { backgroundColor: mark.colors[0] }]}>
                <Text style={styles.avatarGlyph} maxFontSizeMultiplier={1}>{mark.character}</Text>
              </View>
              <View style={styles.memberText}>
                <Text style={styles.memberName} numberOfLines={1}>{name}</Text>
                {role ? <Text style={styles.meta}>{role}</Text> : null}
              </View>
              {you ? null : <Ionicons name="chevron-forward" size={ICON.sm} color={EMBER.textTertiary} />}
            </Pressable>
          )
        }}
        ListEmptyComponent={
          loading ? (
            <View>
              {[0, 1, 2, 3].map((i) => (
                <View key={i} style={styles.member}>
                  <SkeletonCircle width={AVATAR} />
                  <SkeletonLine width="50%" />
                </View>
              ))}
            </View>
          ) : failed ? (
            <ChatLoadFailed
              what="who's in this room"
              onRetry={() => {
                setFailed(false)
                setLoading(true)
                void loadMembers().finally(() => setLoading(false))
              }}
            />
          ) : null
        }
        ListFooterComponent={
          !loading && !failed && members.length < total ? (
            <Pressable
              onPress={() => {
                setLoadingMore(true)
                void loadMembers(members.length).finally(() => setLoadingMore(false))
              }}
              disabled={loadingMore}
              accessibilityRole="button"
              style={styles.more}
            >
              <Text style={styles.moreText}>{loadingMore ? 'LOADING…' : 'SHOW MORE'}</Text>
            </Pressable>
          ) : null
        }
      />
    </SafeAreaView>
  )
}

function ActionRow({
  icon,
  label,
  onPress,
  trailing = 'chevron-forward',
  destructive = false,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name']
  label: string
  onPress: () => void
  trailing?: React.ComponentProps<typeof Ionicons>['name']
  destructive?: boolean
}) {
  const color = destructive ? EMBER.destructive : EMBER.textPrimary
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.action, pressed && styles.pressed]}
    >
      <Ionicons name={icon} size={ICON.md} color={color} />
      <Text style={[styles.actionLabel, { color }]}>{label}</Text>
      <Ionicons name={trailing} size={ICON.sm} color={EMBER.textTertiary} />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: EMBER.bg },
  list: { paddingHorizontal: GUTTER, paddingBottom: SPACE.xxl },
  header: { gap: SPACE.xxl, paddingTop: SPACE.sm, paddingBottom: SPACE.lg },

  // The Banter's "Live now" row: a square cover, the name beside it.
  room: { flexDirection: 'row', alignItems: 'center', gap: SPACE.lg },
  cover: { width: COVER, height: COVER, borderRadius: EMBER_RADIUS.sm },
  coverFallback: { backgroundColor: EMBER.surface, alignItems: 'center', justifyContent: 'center' },
  roomText: { flex: 1, gap: SPACE.xxs },
  roomName: TYPE.heading,
  meta: { ...TYPE.meta, color: EMBER.textSecondary },

  rows: { gap: SPACE.sm },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
    minHeight: CONTROL.lg,
    paddingHorizontal: SPACE.lg,
    borderRadius: EMBER_RADIUS.md,
    backgroundColor: EMBER.surfaceSunken,
  },
  actionLabel: { ...TYPE.bodyStrong, flex: 1 },

  member: { flexDirection: 'row', alignItems: 'center', gap: SPACE.lg, paddingVertical: SPACE.md },
  pressed: { opacity: 0.7 },
  avatar: { width: AVATAR, height: AVATAR, borderRadius: EMBER_RADIUS.pill, alignItems: 'center', justifyContent: 'center' },
  // design-exception: an emoji glyph sized to fill the 40pt disc, as in ChatBubble
  avatarGlyph: { fontSize: 20, lineHeight: 26 },
  memberText: { flex: 1, gap: SPACE.xxs },
  memberName: TYPE.bodyStrong,

  more: { alignItems: 'center', paddingVertical: SPACE.lg },
  moreText: { ...TYPE.label, color: EMBER.textPrimary },
})

export default function ChatInfo() {
  return <ChatInfoInner />
}

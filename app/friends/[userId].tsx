import { Ionicons } from '@expo/vector-icons'
import { router, useLocalSearchParams } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { LoadError, LoadState } from '../../components/LoadError'
import PhotoLightbox from '../../components/PhotoLightbox'
import { EmberButton } from '../../components/onboarding/EmberControls'
import {
  ProfileBio,
  ProfileDetail,
  ProfileGallery,
  ProfileHeading,
  ProfileHero,
  ProfileInterests,
} from '../../components/profile/ProfileSections'
import { useToast } from '../../components/Toast'
import { Text } from '../../components/ui/Text'
import { apiClient } from '../../lib/apiClient'
import { friendsSinceLabel, type FriendProfile } from '../../lib/friends'
import { isGone } from '../../lib/loadFailure'
import { showUserSafetyActions } from '../../lib/safetyUtils'
import { showSheet } from '../../lib/sheet'
import { CONTROL, EMBER, EMBER_RADIUS, GUTTER, ICON, SPACE } from '../../lib/theme'

/**
 * A friend's profile — opened from the friends list, never from a room.
 *
 * The identified profile, from `GET /friends/:userId`, which answers only for a
 * friend. It is deliberately not `app/user/[id].tsx`: that screen is what a
 * room card opens, and in a room a friend is still a pseudonym unless they
 * turned on "Friends can see who I am in rooms".
 *
 * Message opens (or finds) a DM that needs no shared event. Unfriend is quiet:
 * nobody is told, and the DM stays. Report or block is in the corner, as on
 * every profile.
 */
export default function FriendProfileScreen() {
  const { userId } = useLocalSearchParams<{ userId: string }>()
  const insets = useSafeAreaInsets()
  const { width } = useWindowDimensions()
  const { showToast } = useToast()
  const [friend, setFriend] = useState<FriendProfile | null>(null)
  const [gone, setGone] = useState(false)
  const [failed, setFailed] = useState(false)
  const [retrying, setRetrying] = useState(false)
  const [opening, setOpening] = useState(false)
  const [lightbox, setLightbox] = useState<number | null>(null)

  /*
   * 404 means not (or no longer) friends — the same answer whoever asks.
   * Anything else (no signal, a timeout, a 5xx) is a load that failed, and
   * used to tell somebody on a bad connection that their friend had removed
   * them.
   */
  const settle = useCallback((result: Awaited<ReturnType<typeof apiClient.getFriend>>) => {
    if (result.success && result.data) {
      setFriend(result.data)
      setFailed(false)
    } else if (isGone(result)) {
      setGone(true)
    } else {
      setFailed(true)
    }
  }, [])

  // State is set only once the request has settled, and not after leaving.
  useEffect(() => {
    let live = true
    apiClient.getFriend(String(userId)).then((result) => {
      if (live) settle(result)
    })
    return () => {
      live = false
    }
  }, [userId, settle])

  const retry = async () => {
    setRetrying(true)
    settle(await apiClient.getFriend(String(userId)))
    setRetrying(false)
  }

  const message = async () => {
    if (!friend) return
    setOpening(true)
    const conversationId = friend.conversationId ?? (await apiClient.openFriendConversation(friend.userId)).data?.conversationId
    setOpening(false)
    if (!conversationId) {
      showToast("The conversation didn't open. Try again.", 'error')
      return
    }
    router.push({
      pathname: '/private-chat/[conversationId]',
      params: {
        conversationId,
        otherUserName: friend.name,
        otherUserId: friend.userId,
        otherUserAvatar: friend.photos[0] ?? '',
      },
    })
  }

  /*
   * The app's one sheet (`lib/sheet.ts`), not a system alert: the same place
   * every other "are you sure" on a person lives (block, report, leave). A
   * refusal stays in the sheet and turns the button into Try again.
   */
  const confirmUnfriend = () => {
    if (!friend) return
    showSheet({
      kind: 'actions',
      title: `Remove ${friend.name}?`,
      message: "They won't be told. Your messages stay, and you can add each other again later.",
      actions: [
        {
          label: 'Remove friend',
          variant: 'destructive',
          run: async () => {
            const result = await apiClient.removeFriend(friend.userId)
            if (!result.success) return { ok: false, error: "That didn't go through. Try again." }
            router.back()
            return { ok: true, toast: `${friend.name} is no longer a friend` }
          },
        },
        { label: 'Cancel', cancel: true },
      ],
    })
  }

  if (gone) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <LoadState
          icon="person-outline"
          title="You're not friends with this person any more."
          action={{ label: 'Go back', onPress: () => router.back() }}
        />
      </View>
    )
  }

  if (!friend) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        {failed ? (
          <LoadError title="This profile didn't load" onRetry={() => void retry()} retrying={retrying} />
        ) : (
          <ActivityIndicator color={EMBER.textSecondary} />
        )}
        <View style={[styles.topBar, { paddingTop: insets.top + SPACE.md }]} pointerEvents="box-none">
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            hitSlop={SPACE.md}
            style={({ pressed }) => [styles.barButton, pressed && styles.pressed]}
          >
            <Ionicons name="chevron-back" size={ICON.lg} color={EMBER.textPrimary} />
          </Pressable>
        </View>
      </View>
    )
  }

  const title = friend.age ? `${friend.name}, ${friend.age}` : friend.name
  const subtitle = [friend.occupation, friend.location].filter(Boolean).join(' · ') || null

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + SPACE.xxxl }} showsVerticalScrollIndicator={false}>
        <ProfileHero width={width} photos={friend.photos} title={title} subtitle={subtitle} pseudonym={friend.name} />

        <View style={styles.canvas}>
          <View style={styles.section}>
            <Text variant="meta">{friendsSinceLabel(friend.friendsSince)}</Text>
            <EmberButton label="Message" onPress={() => void message()} busy={opening} />
          </View>

          {friend.bio ? (
            <View style={styles.section}>
              <ProfileHeading title="Bio" />
              <ProfileBio text={friend.bio} />
            </View>
          ) : null}

          {friend.interests.length > 0 ? (
            <View style={styles.section}>
              <ProfileHeading title="Interests" />
              <ProfileInterests interests={friend.interests.map((i) => i.name)} />
            </View>
          ) : null}

          {friend.occupation || friend.education ? (
            <View style={styles.details}>
              {friend.occupation ? <ProfileDetail label="OCCUPATION" value={friend.occupation} /> : null}
              {friend.education ? <ProfileDetail label="EDUCATION" value={friend.education} variant="ruled" /> : null}
            </View>
          ) : null}

          {friend.photos.length > 1 ? (
            <View style={styles.section}>
              <ProfileHeading title="Gallery" trailing={`${friend.photos.length} photos`} />
              {/*
                The photos beyond the hero's: the hero already cycles the first,
                so it is not repeated here. `+ 1` keeps the lightbox on the
                photo that was tapped.
              */}
              <ProfileGallery
                photos={friend.photos.slice(1)}
                columnWidth={(width - GUTTER * 2 - SPACE.lg) / 2}
                onPressPhoto={(i) => setLightbox(i + 1)}
              />
            </View>
          ) : null}

          <Pressable
            onPress={confirmUnfriend}
            accessibilityRole="button"
            accessibilityLabel={`Remove ${friend.name} from friends`}
            style={({ pressed }) => [styles.quiet, pressed && styles.pressed]}
          >
            <Text variant="bodyStrong" color={EMBER.textSecondary}>Remove friend</Text>
          </Pressable>
        </View>
      </ScrollView>

      <PhotoLightbox
        photos={friend.photos}
        initialIndex={lightbox ?? 0}
        visible={lightbox !== null}
        onClose={() => setLightbox(null)}
      />

      <View style={[styles.topBar, { paddingTop: insets.top + SPACE.md }]} pointerEvents="box-none">
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={SPACE.md}
          style={({ pressed }) => [styles.barButton, pressed && styles.pressed]}
        >
          <Ionicons name="chevron-back" size={ICON.lg} color={EMBER.textPrimary} />
        </Pressable>
        <Pressable
          onPress={() => showUserSafetyActions(friend.name, friend.userId, () => router.back())}
          accessibilityRole="button"
          accessibilityLabel="Report or block"
          hitSlop={SPACE.md}
          style={({ pressed }) => [styles.barButton, pressed && styles.pressed]}
        >
          <Ionicons name="ellipsis-horizontal" size={ICON.lg} color={EMBER.textPrimary} />
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: EMBER.bg },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACE.lg,
    paddingHorizontal: GUTTER,
    backgroundColor: EMBER.bg,
  },
  canvas: { paddingHorizontal: GUTTER, paddingTop: SPACE.xxl, gap: SPACE.xxl },
  section: { gap: SPACE.lg },
  details: { gap: SPACE.xl },
  quiet: { alignSelf: 'center', paddingVertical: SPACE.sm },
  topBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    paddingHorizontal: GUTTER,
    paddingBottom: SPACE.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  barButton: {
    width: CONTROL.md,
    height: CONTROL.md,
    borderRadius: EMBER_RADIUS.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: EMBER.scrim,
  },
  pressed: { opacity: 0.6 },
})

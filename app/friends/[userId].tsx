import { Ionicons } from '@expo/vector-icons'
import { router, useLocalSearchParams } from 'expo-router'
import { useEffect, useState } from 'react'
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

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
import { showUserSafetyActions } from '../../lib/safetyUtils'
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
  const [opening, setOpening] = useState(false)
  const [lightbox, setLightbox] = useState<number | null>(null)

  // State is set only once the request has settled, and not after leaving.
  useEffect(() => {
    let live = true
    apiClient.getFriend(String(userId)).then((result) => {
      if (!live) return
      if (result.success && result.data) setFriend(result.data)
      // 404 means not (or no longer) friends — the same answer whoever asks.
      else setGone(true)
    })
    return () => {
      live = false
    }
  }, [userId])

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

  const confirmUnfriend = () => {
    if (!friend) return
    Alert.alert(
      `Remove ${friend.name}?`,
      "They won't be told. Your messages stay, and you can add each other again later.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            const result = await apiClient.removeFriend(friend.userId)
            if (result.success) router.back()
            else showToast("That didn't go through. Try again.", 'error')
          },
        },
      ]
    )
  }

  if (gone) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <Text variant="body" color={EMBER.textSecondary} style={styles.centerText}>
          You&apos;re not friends with this person any more.
        </Text>
        <EmberButton label="Back" onPress={() => router.back()} />
      </View>
    )
  }

  if (!friend) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={EMBER.textSecondary} />
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
              <ProfileGallery
                photos={friend.photos}
                columnWidth={(width - GUTTER * 2 - SPACE.lg) / 2}
                onPressPhoto={setLightbox}
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
          accessibilityLabel="Back"
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
  centerText: { textAlign: 'center' },
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

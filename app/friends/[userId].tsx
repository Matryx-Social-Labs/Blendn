import { router, useLocalSearchParams } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import Animated, { useAnimatedScrollHandler, useSharedValue } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { Button } from '../../components/ds/Button'
import { font, HueProvider, useBoldText } from '../../components/ds/shared'
import { StateScreen } from '../../components/ds/StateScreen'
import { PhotoViewer } from '../../components/profile/PhotoViewer'
import { ProfileBar } from '../../components/profile/ProfileBar'
import { dockClearance, ProfileDock } from '../../components/profile/ProfileDock'
import { heroHeightFor, ProfileHeroStage } from '../../components/profile/ProfileHeroStage'
import { ProfileBio, ProfileDetail, ProfileGallery, ProfileInterests, ProfileSection, SECTION_GAP } from '../../components/profile/ProfileSections'
import type { Rect } from '../../components/ds/chatShared'
import { SkeletonBlock } from '../../components/Skeleton'
import { useToast } from '../../components/Toast'
import { apiClient } from '../../lib/apiClient'
import { COLOR, FONT_FAMILY, SPACE } from '../../lib/design/tokens'
import { friendsSinceParts, type FriendProfile } from '../../lib/friends'
import { noteFriendGone } from '../../lib/friendsGone'
import { isGone } from '../../lib/loadFailure'
import { showUserSafetyActions } from '../../lib/safetyUtils'
import { showSheet } from '../../lib/sheet'

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
function FriendProfileScreenContent() {
  const { userId } = useLocalSearchParams<{ userId: string }>()
  const insets = useSafeAreaInsets()
  const { width } = useWindowDimensions()
  const { showToast } = useToast()
  const [friend, setFriend] = useState<FriendProfile | null>(null)
  const [gone, setGone] = useState(false)
  const [failed, setFailed] = useState(false)
  const [retrying, setRetrying] = useState(false)
  const [opening, setOpening] = useState(false)
  const [viewer, setViewer] = useState<{ index: number; from: Rect | null } | null>(null)
  const bold = useBoldText()
  const [dockHeight, setDockHeight] = useState(0)
  // The page's scroll offset, written on the UI thread: the bar and the hero's stretch read it, React never renders for it.
  const scrollY = useSharedValue(0)
  const onScroll = useAnimatedScrollHandler((e) => {
    scrollY.set(e.contentOffset.y)
  })

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
      noteFriendGone(String(userId))
      setGone(true)
    } else {
      setFailed(true)
    }
  }, [userId])

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
      showToast("The conversation didn’t open. Try again.", 'error', { haptic: 'error' })
      return
    }
    router.push({
      pathname: '/private-chat/[conversationId]',
      params: {
        conversationId,
        otherUserName: friend.name,
        otherUserId: friend.userId,
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
      hue: 'rose',
      title: `Remove ${friend.name}?`,
      message: "They won’t be told. Your messages stay, and you can add each other again later.",
      actions: [
        {
          label: 'Remove friend',
          variant: 'destructive',
          run: async () => {
            const result = await apiClient.removeFriend(friend.userId)
            if (!result.success) return { ok: false, error: "That didn’t go through. Try again." }
            noteFriendGone(friend.userId)
            router.back()
            return { ok: true, toast: `${friend.name} is no longer a friend` }
          },
        },
        { label: 'Cancel', cancel: true },
      ],
    })
  }

  const back = () => router.back()

  if (gone) {
    return (
      <View style={styles.container}>
        <ProfileBar testID="friend-bar" scrollY={scrollY} onBack={back} />
        <View style={[styles.center, { paddingTop: insets.top }]}>
          <StateScreen
            icon="user"
            title="You’re not friends with this person any more."
            actions={[{ label: 'Go back', onPress: back, kind: 'secondary' }]}
            testID="friend-gone"
          />
        </View>
      </View>
    )
  }

  if (!friend) {
    return (
      <View style={styles.container}>
        <ProfileBar testID="friend-bar" scrollY={scrollY} onBack={back} overPhoto={!failed} />
        {failed ? (
          <View style={[styles.center, { paddingTop: insets.top }]}>
            <StateScreen
              icon="user"
              title="This profile didn’t load"
              body="Check your connection and try again."
              actions={[{ label: 'Try again', onPress: () => void retry(), loading: retrying }]}
              testID="friend-failed"
            />
          </View>
        ) : (
          // The hero's own shape, so the page does not jump when it lands (Flow 6 `friend` 05).
          <View testID="friend-skeleton" accessibilityLabel="Loading profile" accessibilityState={{ busy: true }}>
            <SkeletonBlock width={width} height={heroHeightFor(width)} borderRadius={0} />
          </View>
        )}
      </View>
    )
  }

  const subtitle = [friend.occupation, friend.location].filter(Boolean).join(' · ') || null
  const columnWidth = Math.floor((width - SPACE.gutter * 2 - SPACE.sm) / 2)
  // Flow 6 `friend`: the date alone in Geist Mono, the words in the page's face.
  const since = friendsSinceParts(friend.friendsSince)

  return (
    <View style={styles.container}>
      {/* First in the tree for the focus order; it draws over the scroll by zIndex. */}
      <ProfileBar
        testID="friend-bar"
        scrollY={scrollY}
        title={friend.name}
        overPhoto
        onBack={back}
        actions={[{ icon: 'ellipsis', label: 'Report or block', onPress: () => showUserSafetyActions(friend.name, friend.userId, back) }]}
      />
      <Animated.ScrollView
        testID="friend-scroll"
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingBottom: (dockHeight || dockClearance(insets.bottom)) + SPACE.xl }}
        showsVerticalScrollIndicator={false}
      >
        <ProfileHeroStage
          testID="friend-hero"
          width={width}
          scrollY={scrollY}
          photos={friend.photos}
          name={friend.name}
          age={friend.age}
          subtitle={subtitle}
          seed={friend.name}
          onPressPhoto={(i, from) => setViewer({ index: i, from })}
        />

        <View style={styles.canvas}>
          <Text style={[font('meta', bold), styles.since]}>
            {since.words}
            {since.date ? <Text style={[font('meta', bold, FONT_FAMILY.mono[500]), styles.sinceDate]}>{since.date}</Text> : null}
          </Text>

          {friend.bio ? (
            <ProfileSection title="About">
              <ProfileBio text={friend.bio} />
            </ProfileSection>
          ) : null}

          {friend.interests.length > 0 ? (
            <ProfileSection title="Interests">
              <ProfileInterests interests={friend.interests.map((i) => i.name)} />
            </ProfileSection>
          ) : null}

          {friend.occupation ? <ProfileDetail label="OCCUPATION" value={friend.occupation} /> : null}
          {friend.education ? <ProfileDetail label="EDUCATION" value={friend.education} variant="ruled" /> : null}

          {friend.photos.length > 1 ? (
            <ProfileSection title="Photos" trailing={`${friend.photos.length} photos`}>
              {/*
                The photos beyond the hero's: the hero already cycles the first,
                so it is not repeated here. `+ 1` keeps the viewer on the
                photo that was tapped.
              */}
              <ProfileGallery photos={friend.photos.slice(1)} columnWidth={columnWidth} onPressPhoto={(i, from) => setViewer({ index: i + 1, from })} />
            </ProfileSection>
          ) : null}

          <Button
            kind="tertiary"
            muted
            label="Remove friend"
            accessibilityLabel={`Remove friend ${friend.name}`}
            onPress={confirmUnfriend}
            style={styles.remove}
            testID="friend-remove"
          />
        </View>
      </Animated.ScrollView>

      {/* Message, where the thumb is: the page's one primary (Flow 6 `friend`, docked as the profile's tray is). */}
      <ProfileDock testID="friend-dock" onHeight={setDockHeight}>
        <Button kind="primary" icon="message-circle" label="Message" loading={opening} onPress={() => void message()} style={styles.flex} testID="friend-message" />
      </ProfileDock>

      <PhotoViewer
        photos={friend.photos}
        initialIndex={viewer?.index ?? 0}
        from={viewer?.from}
        visible={viewer !== null}
        onClose={() => setViewer(null)}
        testID="friend-viewer"
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLOR.ink },
  center: { flex: 1, justifyContent: 'center', paddingHorizontal: SPACE.gutter },
  // The frame's column starts 8 under the hero and keeps 28 between sections.
  canvas: { paddingHorizontal: SPACE.gutter, paddingTop: SPACE.sm, gap: SECTION_GAP },
  since: { color: COLOR.textSecondary },
  sinceDate: { color: COLOR.textPrimary },
  remove: { alignSelf: 'center' },
  flex: { flex: 1 },
})

/** Rose world: one hue on this screen (`HueProvider`). */
export default function FriendProfileScreen() {
  return (
    <HueProvider value="rose">
      <FriendProfileScreenContent />
    </HueProvider>
  )
}

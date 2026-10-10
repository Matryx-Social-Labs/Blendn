import { router, useLocalSearchParams } from 'expo-router'
import { useRef, useState } from 'react'
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { AppHeader } from '../../components/AppHeader'
import { BlendSideCard } from '../../components/crews/CrewParts'
import { LoadError } from '../../components/LoadError'
import { EmberButton } from '../../components/onboarding/EmberControls'
import { PlaceholderBanner } from '../../components/ui/PlaceholderBanner'
import { Text } from '../../components/ui/Text'
import { apiClient } from '../../lib/apiClient'
import {
  BLEND_CLOSED_LINE,
  blendSides,
  blendTitle,
  closesLine,
  crewMessage,
  REVEALED_LINE,
  type BlendPerson,
} from '../../lib/crews'
import { crewsApi } from '../../lib/crewsApi'
import { markRoomLeft } from '../../lib/roomMembership'
import { showSheet, type SheetOutcome } from '../../lib/sheet'
import { EMBER, GUTTER, SPACE } from '../../lib/theme'
import { useAuth } from '../../lib/useAuth'
import { useBlends } from '../../lib/useBlends'

/**
 * A Blend's people (placeholder design — docs/PLACEHOLDER_SCREENS.md §14).
 *
 * Both sides, as the server sends them: tonight's pseudonyms, and first names
 * only for whoever was revealed **in this Blend** — never anything the chat
 * says. From here: reveal your crew (one tap, for everyone in it who has not
 * kept themselves anonymous), block somebody by their handle in this Blend,
 * and leave it on your own.
 */
export default function BlendScreen() {
  const { blendId, fromChat } = useLocalSearchParams<{ blendId: string; fromChat?: string }>()
  const { user } = useAuth()
  const myId = user?.id
  const { blends, loaded, failed, reload } = useBlends()
  const [refreshing, setRefreshing] = useState(false)
  const [revealedLine, setRevealedLine] = useState<string | null>(null)
  /** One write at a time: a second tap while the first is in flight sends nothing. */
  const inFlight = useRef(false)
  const once = async (work: () => Promise<SheetOutcome>): Promise<SheetOutcome> => {
    if (inFlight.current) return { ok: true }
    inFlight.current = true
    try {
      return await work()
    } finally {
      inFlight.current = false
    }
  }

  const blend = blends.find((b) => b.blendId === String(blendId)) ?? null

  const onRefresh = async () => {
    setRefreshing(true)
    await reload()
    setRefreshing(false)
  }

  if (!blend) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <AppHeader title="Blend" onBack={() => router.back()} />
        <View style={styles.centred}>
          {failed ? (
            // A failed read is not a closed Blend: say so, and offer the retry.
            <LoadError title="This Blend didn't load" onRetry={() => void onRefresh()} retrying={refreshing} />
          ) : (
            // Not in my open Blends: closed, left, or a block across the sides. One line for all.
            <Text variant="bodyStrong">{loaded ? BLEND_CLOSED_LINE : 'Loading…'}</Text>
          )}
        </View>
      </SafeAreaView>
    )
  }

  const { mine, theirs } = blendSides(blend, myId)
  const isCrew = mine?.kind === 'crew'

  const reveal = () =>
    showSheet({
      kind: 'actions',
      title: isCrew ? 'Reveal your crew here?' : 'Reveal yourself here?',
      message: isCrew
        ? 'Everyone in your crew who is here and hasn’t switched on “keep me anonymous” is shown by first name and photo — to this Blend’s people only. A reveal can’t be undone.'
        : 'Your first name and photo are shown to this Blend’s people only. A reveal can’t be undone.',
      actions: [
        {
          label: 'Reveal',
          variant: 'primary',
          run: () =>
            once(async () => {
              const result = await crewsApi.reveal(blend.blendId)
              if (!result.success) {
                return { ok: false, error: crewMessage(result, 'blend', 'Couldn’t reveal. Try again.') }
              }
              // No count comes back, by design: never who on your crew kept private.
              setRevealedLine(isCrew ? REVEALED_LINE : 'You’re revealed in this Blend.')
              void reload()
              return { ok: true }
            }),
        },
        { label: 'Cancel', cancel: true },
      ],
    })

  /** Block by the handle this Blend gave them — the block route opens it for this Blend's people only. */
  const safety = (person: BlendPerson) => {
    const who = person.name ?? person.pseudonym
    showSheet({
      kind: 'actions',
      title: `Block ${who}?`,
      message: 'You won’t see each other here or anywhere else on Blend’n, and the Blend goes on for everyone else. They aren’t told. To report something said, long-press the message in the chat.',
      actions: [
        {
          label: 'Block',
          variant: 'destructive',
          run: () =>
            once(async () => {
              const result = await apiClient.blockUser(person.userId)
              if (!result.success) return { ok: false, error: crewMessage(result, 'blend', 'Couldn’t block them. Try again.') }
              void reload()
              return { ok: true, toast: `${who} is blocked` }
            }),
        },
        { label: 'Cancel', cancel: true },
      ],
    })
  }

  const leave = () =>
    showSheet({
      kind: 'actions',
      title: 'Leave this Blend?',
      message: 'Only you leave — it goes on for everyone else, and it leaves your Banter.',
      actions: [
        {
          label: 'Leave',
          variant: 'destructive',
          run: () => once(async () => {
            const result = await apiClient.leaveChatGroup(blend.chatGroupId)
            if (!result.success) return { ok: false, error: crewMessage(result, 'blend', 'Couldn’t leave. Try again.') }
            // The chat underneath must offer Rejoin, not "closed": a Blend's door
            // answers a leaver's read with the same 403 as somebody it took out.
            markRoomLeft(blend.chatGroupId)
            router.back()
            return { ok: true, toast: 'You left the Blend' }
          }),
        },
        { label: 'Cancel', cancel: true },
      ],
    })

  const title = blendTitle(blend, myId)

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <AppHeader title={title} onBack={() => router.back()} />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={EMBER.textSecondary} />}
      >
        <PlaceholderBanner />
        <Text variant="meta">{closesLine(blend.closesAt) ?? ''}</Text>
        <EmberButton
          label="Open the chat"
          onPress={() =>
            // Opened from the chat's (i): back to it, rather than a second copy on the stack.
            fromChat
              ? router.back()
              : router.push({
                  pathname: '/chat/[id]',
                  params: { id: blend.chatGroupId, roomName: title, kind: 'blend', blendId: blend.blendId } as never,
                })
          }
        />
        {theirs ? <BlendSideCard side={theirs} myId={myId} onPerson={safety} /> : null}
        {mine ? <BlendSideCard side={mine} myId={myId} /> : null}
        <EmberButton label={isCrew ? 'Reveal our crew' : 'Reveal me'} variant="secondary" onPress={reveal} />
        {revealedLine ? (
          <Text variant="body" accessibilityLiveRegion="polite">
            {revealedLine}
          </Text>
        ) : null}
        <EmberButton label="Leave this Blend" variant="secondary" onPress={leave} />
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: EMBER.bg },
  centred: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: GUTTER },
  content: { paddingHorizontal: GUTTER, paddingBottom: SPACE.xxxl, gap: SPACE.lg },
})

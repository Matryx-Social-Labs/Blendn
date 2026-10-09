import { router } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native'

import {
  CREW_REPORT_REASONS,
  OPEN_TO_CREWS_HELPER,
  OPEN_TO_CREWS_LABEL,
  crewMessage,
  hereLine,
  likeAs,
  mergeCrewPage,
  nextCrewOffset,
  type BlendRef,
  type Crew,
  type CrewCard,
  type CrewsAtEvent,
} from '../../lib/crews'
import { crewsApi } from '../../lib/crewsApi'
import { showSheet } from '../../lib/sheet'
import { EMBER, GUTTER, OPACITY, SPACE } from '../../lib/theme'
import { EmberButton, EmberToggle } from '../onboarding/EmberControls'
import { useToast } from '../Toast'
import { PlaceholderBanner } from '../ui/PlaceholderBanner'
import { Text } from '../ui/Text'
import { CrewCardView } from './CrewParts'

/** A page of cards: the server's default, well under its 50. */
const PAGE = 30

export type CrewsHere =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'not_here' }
  | { status: 'ready'; data: CrewsAtEvent; offset: number }

/**
 * The crews here now at this event, a page at a time (`GET /events/:id/crews`).
 *
 * Held by the Room rather than the Crews view, because the person card needs
 * `myCrews` too: a crew of yours here is what lets you like somebody on its
 * behalf.
 */
export function useCrewsHere(eventId: string | null) {
  const [state, setState] = useState<CrewsHere>({ status: 'loading' })
  const [loadingMore, setLoadingMore] = useState(false)

  /** One page's answer onto what is loaded. A failed later page leaves the list as it was. */
  const apply = useCallback((result: Awaited<ReturnType<typeof crewsApi.crewsAt>>, offset: number) => {
    if (!result.success || !result.data) {
      if (offset === 0) setState({ status: result.errorCode === 'NOT_CHECKED_IN' ? 'not_here' : 'error' })
      return
    }
    const page = result.data
    setState((prev) => ({
      status: 'ready',
      data: { ...page, crews: mergeCrewPage(prev.status === 'ready' ? prev.data.crews : [], page.crews, offset) },
      offset: nextCrewOffset(offset, page.crews),
    }))
  }, [])

  const load = useCallback(
    async (offset = 0) => {
      if (eventId) apply(await crewsApi.crewsAt(eventId, { limit: PAGE, offset }), offset)
    },
    [eventId, apply]
  )

  useEffect(() => {
    if (!eventId) return
    let live = true
    void crewsApi.crewsAt(eventId, { limit: PAGE, offset: 0 }).then((r) => live && apply(r, 0))
    return () => {
      live = false
    }
  }, [eventId, apply])

  const loadMore = useCallback(async () => {
    if (state.status !== 'ready' || !state.data.hasMore || loadingMore) return
    setLoadingMore(true)
    await load(state.offset)
    setLoadingMore(false)
  }, [state, loadingMore, load])

  /** A like landed: the card says so without a refetch. */
  const markLiked = useCallback((crewId: string) => {
    setState((prev) =>
      prev.status === 'ready'
        ? { ...prev, data: { ...prev.data, crews: prev.data.crews.map((c) => (c.crewId === crewId ? { ...c, youLiked: true } : c)) } }
        : prev
    )
  }, [])

  return { state, reload: () => load(0), loadMore, loadingMore, markLiked }
}

/** Into a Blend that a like just made. */
export function openBlend(blend: BlendRef, title: string) {
  router.push({
    pathname: '/chat/[id]',
    params: { id: blend.chatGroupId, roomName: title, kind: 'blend', blendId: blend.blendId } as never,
  })
}

/** Ask which of your crews here a like is from, when there are several. */
export function chooseCrew(myCrews: CrewsAtEvent['myCrews'], title: string): Promise<string | null> {
  return new Promise((resolve) =>
    showSheet({
      kind: 'actions',
      title,
      message: 'Your crew chat says who liked on its behalf.',
      onDismiss: () => resolve(null),
      actions: [
        ...myCrews.map((c) => ({ label: c.name, then: () => resolve(c.crewId) })),
        { label: 'Cancel', cancel: true as const },
      ],
    })
  )
}

/**
 * The Grid's Crews view (placeholder design — docs/PLACEHOLDER_SCREENS.md §13).
 *
 * Your crews, with "We're here"; then the crews here now as cards — counts,
 * never people — with Like and Report. Without a crew of your own here you
 * see crews only after "Open to joining a crew tonight", which lapses at the
 * end of the night, so it is read from the server each time, never kept.
 */
export function CrewsView({ eventId, crews }: { eventId: string; crews: ReturnType<typeof useCrewsHere> }) {
  const { showToast } = useToast()
  const [mine, setMine] = useState<Crew[] | null>(null)
  const [openToCrews, setOpenToCrews] = useState<boolean | null>(null)
  const [liking, setLiking] = useState<string | null>(null)
  const [hereBusy, setHereBusy] = useState<string | null>(null)
  const [hereLines, setHereLines] = useState<Record<string, string>>({})
  const { state, reload, loadMore, loadingMore, markLiked } = crews

  useEffect(() => {
    let live = true
    void crewsApi.myCrews().then((r) => live && setMine(r.success && r.data ? r.data.crews : []))
    // An empty PUT answers the current value: there is no GET, and it lapses on its own.
    void crewsApi.openToCrews(eventId).then((r) => live && r.success && r.data && setOpenToCrews(r.data.openToCrews))
    return () => {
      live = false
    }
  }, [eventId])

  const setOpen = async (next: boolean) => {
    setOpenToCrews(next)
    const result = await crewsApi.openToCrews(eventId, next)
    if (!result.success || !result.data) {
      setOpenToCrews(!next)
      showToast(crewMessage(result, 'card', 'Couldn’t save that. Try again.'), 'error')
      return
    }
    setOpenToCrews(result.data.openToCrews)
    void reload()
  }

  const here = async (crew: Crew) => {
    if (hereBusy) return
    setHereBusy(crew.crewId)
    const result = await crewsApi.here(crew.crewId, eventId)
    setHereBusy(null)
    const text = result.success && result.data ? hereLine(result.data) : crewMessage(result, 'crew', 'Couldn’t tell your crew. Try again.')
    setHereLines((l) => ({ ...l, [crew.crewId]: text }))
  }

  const like = async (card: CrewCard, myCrews: CrewsAtEvent['myCrews']) => {
    if (liking) return
    const as = likeAs(myCrews)
    const asCrewId = as.as === 'crew' ? as.crewId : as.as === 'choose' ? await chooseCrew(myCrews, `Like ${card.name} as…`) : undefined
    if (as.as === 'choose' && !asCrewId) return
    setLiking(card.crewId)
    const result = await crewsApi.likeCrew(eventId, card.crewId, asCrewId ?? undefined)
    setLiking(null)
    if (!result.success || !result.data) {
      showToast(crewMessage(result, 'card', 'Couldn’t send the like. Try again.'), 'error')
      if (result.errorCode === 'NOT_FOUND') void reload()
      return
    }
    markLiked(card.crewId)
    if (result.data.blend) {
      showToast("It's a Blend", 'success')
      openBlend(result.data.blend, `Blend with ${card.name}`)
    }
  }

  const report = (card: CrewCard) =>
    showSheet({
      kind: 'reasons',
      title: `Report ${card.name}`,
      message: 'What’s wrong with this crew’s name or bio? Nobody in the crew is told who reported it.',
      reasons: CREW_REPORT_REASONS.map((r) => ({ value: r.value, label: r.label })),
      submitLabel: 'Send report',
      run: async (reason, description) => {
        const result = await crewsApi.report(card.crewId, {
          reason: reason as (typeof CREW_REPORT_REASONS)[number]['value'],
          ...(description ? { description } : {}),
        })
        if (!result.success) return { ok: false, error: crewMessage(result, 'card', 'Couldn’t send the report. Try again.') }
        return { ok: true, toast: 'Thanks — our team will look at it' }
      },
    })

  const myCrewsHere = state.status === 'ready' ? state.data.myCrews : []

  return (
    <View style={styles.view}>
      <PlaceholderBanner />

      <View style={styles.block}>
        <Text variant="heading">Your crews</Text>
        {mine === null ? (
          <ActivityIndicator color={EMBER.textSecondary} />
        ) : mine.length === 0 ? (
          <Pressable onPress={() => router.push('/crews/new')} accessibilityRole="button" style={({ pressed }) => pressed && styles.pressed}>
            <Text variant="body" color={EMBER.textSecondary}>
              No crew yet — make one from your friends.
            </Text>
          </Pressable>
        ) : (
          mine.map((c) => (
            <View key={c.crewId} style={styles.mine}>
              <Text variant="bodyStrong" numberOfLines={1}>
                {c.name}
              </Text>
              <EmberButton
                label="We’re here"
                variant="secondary"
                onPress={() => void here(c)}
                busy={hereBusy === c.crewId}
                accessibilityHint="Tells your crew you’re here. It checks nobody else in."
              />
              {hereLines[c.crewId] ? (
                <Text variant="meta" accessibilityLiveRegion="polite">
                  {hereLines[c.crewId]}
                </Text>
              ) : null}
            </View>
          ))
        )}
      </View>

      {myCrewsHere.length === 0 && openToCrews !== null ? (
        <EmberToggle label={OPEN_TO_CREWS_LABEL} helper={OPEN_TO_CREWS_HELPER} value={openToCrews} onValueChange={(v) => void setOpen(v)} />
      ) : null}

      <View style={styles.block}>
        <Text variant="heading">Crews here</Text>
        {state.status === 'loading' ? (
          <ActivityIndicator color={EMBER.textSecondary} />
        ) : state.status === 'not_here' ? (
          <Text variant="body" color={EMBER.textSecondary}>
            Check in to see the crews here.
          </Text>
        ) : state.status === 'error' ? (
          <Pressable onPress={() => void reload()} accessibilityRole="button">
            <Text variant="body" color={EMBER.textSecondary}>
              The crews didn’t load. Tap to try again.
            </Text>
          </Pressable>
        ) : !state.data.crewsEnabled ? (
          <Text variant="body" color={EMBER.textSecondary}>
            The host has turned crews off for this event.
          </Text>
        ) : state.data.crews.length === 0 ? (
          <Text variant="body" color={EMBER.textSecondary}>
            {myCrewsHere.length === 0 && !openToCrews
              ? 'Turn on “Open to joining a crew tonight” to see crews with room for one more.'
              : 'No other crews here yet. A crew shows once two of them have checked in.'}
          </Text>
        ) : (
          <>
            {state.data.crews.map((card) => (
              <CrewCardView
                key={card.crewId}
                card={card}
                liking={liking === card.crewId}
                onLike={() => void like(card, myCrewsHere)}
                onMore={() => report(card)}
              />
            ))}
            {state.data.hasMore ? (
              <EmberButton label="More crews" variant="secondary" onPress={() => void loadMore()} busy={loadingMore} />
            ) : null}
          </>
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  view: { paddingHorizontal: GUTTER, gap: SPACE.xl },
  block: { gap: SPACE.md },
  mine: { gap: SPACE.sm },
  pressed: { opacity: OPACITY.pressed },
})

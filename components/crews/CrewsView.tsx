import { router, useFocusEffect } from 'expo-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native'

import { subscribeCheckInChanged } from '../../lib/checkIn'
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

/** A page of cards: the server's default, well under its 50. */
const PAGE = 30

export type CrewsHere =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'not_here' }
  | { status: 'ready'; data: CrewsAtEvent; offset: number }

/*
 * "Open to joining a crew tonight", as last read or written, per check-in.
 * The server has no GET for it, and the empty PUT that answers it counts
 * against the write limit — so it is read once per check-in (a new night is a
 * new check-in), not on every visit to the Crews view.
 */
const openToCrewsByCheckIn = new Map<string, boolean>()

/**
 * The crews here now at this event, a page at a time (`GET /events/:id/crews`),
 * and your own crews (`GET /crews`).
 *
 * Held by the Room rather than the Crews view, because the person card needs
 * `myCrews` too. Re-read on focus and whenever a check-in changes; a reload
 * starts a new generation, so a page from an older one never lands on top of
 * it; a new event starts over.
 */
export function useCrewsHere(eventId: string | null) {
  const [state, setState] = useState<CrewsHere>({ status: 'loading' })
  const [mine, setMine] = useState<Crew[] | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [pageFailed, setPageFailed] = useState(false)
  const generation = useRef(0)

  const reload = useCallback(async () => {
    if (!eventId) return
    const gen = ++generation.current
    setPageFailed(false)
    const [page, crews] = await Promise.all([crewsApi.crewsAt(eventId, { limit: PAGE, offset: 0 }), crewsApi.myCrews()])
    if (gen !== generation.current) return
    if (crews.success && crews.data) setMine(crews.data.crews)
    else setMine((prev) => prev ?? [])
    if (!page.success || !page.data) {
      setState({ status: page.errorCode === 'NOT_CHECKED_IN' ? 'not_here' : 'error' })
      return
    }
    const data = page.data
    setState({ status: 'ready', data: { ...data, crews: mergeCrewPage([], data.crews, 0) }, offset: nextCrewOffset(0, data.crews) })
  }, [eventId])

  // A different event is a different room: nothing of the last one carries over.
  // (Adjusted in render, on the change itself; the reload below starts a new generation.)
  const [forEvent, setForEvent] = useState(eventId)
  if (forEvent !== eventId) {
    setForEvent(eventId)
    setState({ status: 'loading' })
    setMine(null)
    setPageFailed(false)
  }

  useFocusEffect(
    useCallback(() => {
      void reload()
    }, [reload])
  )
  useEffect(() => subscribeCheckInChanged(() => void reload()), [reload])

  const loadMore = useCallback(async () => {
    if (!eventId || state.status !== 'ready' || !state.data.hasMore || loadingMore) return
    const gen = generation.current
    const offset = state.offset
    setLoadingMore(true)
    setPageFailed(false)
    const page = await crewsApi.crewsAt(eventId, { limit: PAGE, offset })
    setLoadingMore(false)
    if (gen !== generation.current) return
    if (!page.success || !page.data) {
      setPageFailed(true)
      return
    }
    const data = page.data
    setState((prev) =>
      prev.status === 'ready'
        ? { status: 'ready', data: { ...data, crews: mergeCrewPage(prev.data.crews, data.crews, offset) }, offset: nextCrewOffset(offset, data.crews) }
        : prev
    )
  }, [eventId, state, loadingMore])

  /** A like landed: the card says so without a refetch. */
  const markLiked = useCallback((crewId: string) => {
    setState((prev) =>
      prev.status === 'ready'
        ? { ...prev, data: { ...prev.data, crews: prev.data.crews.map((c) => (c.crewId === crewId ? { ...c, youLiked: true } : c)) } }
        : prev
    )
  }, [])

  return { state, mine, reload, loadMore, loadingMore, pageFailed, markLiked }
}

export type CrewsHereState = ReturnType<typeof useCrewsHere>

/** The cards to list: only while crews are on and you are here. */
export function crewCards(crews: CrewsHereState): CrewCard[] {
  return crews.state.status === 'ready' && crews.state.data.crewsEnabled ? crews.state.data.crews : []
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
 * Liking and reporting a card, and "We're here" — the Crews view's writes.
 * Each guarded by a ref, so a fast second tap sends nothing.
 */
export function useCrewActions(eventId: string | null, crews: CrewsHereState) {
  const { showToast } = useToast()
  const [liking, setLiking] = useState<string | null>(null)
  const [hereBusy, setHereBusy] = useState<string | null>(null)
  const [hereLines, setHereLines] = useState<Record<string, string>>({})
  const inFlight = useRef(false)
  const { markLiked, reload } = crews
  const myCrewsHere = crews.state.status === 'ready' ? crews.state.data.myCrews : []

  const here = async (crew: Crew) => {
    if (!eventId || inFlight.current) return
    inFlight.current = true
    setHereBusy(crew.crewId)
    const result = await crewsApi.here(crew.crewId, eventId)
    inFlight.current = false
    setHereBusy(null)
    const text = result.success && result.data ? hereLine(result.data) : crewMessage(result, 'crew', 'Couldn’t tell your crew. Try again.')
    setHereLines((l) => ({ ...l, [crew.crewId]: text }))
  }

  const like = async (card: CrewCard) => {
    if (!eventId || inFlight.current) return
    inFlight.current = true
    try {
      const as = likeAs(myCrewsHere)
      const asCrewId = as.as === 'crew' ? as.crewId : as.as === 'choose' ? await chooseCrew(myCrewsHere, `Like ${card.name} as…`) : undefined
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
    } finally {
      inFlight.current = false
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

  return { liking, like, report, here, hereBusy, hereLines }
}

export type CrewActions = ReturnType<typeof useCrewActions>

/**
 * "Open to joining a crew tonight": read once per check-in, written on a tap.
 * The latest tap wins — an older answer landing late never reverts it — and
 * the switch holds still while a write is in flight. A failed read keeps the
 * switch on screen (off) with a retry, rather than hiding it.
 */
function useOpenToCrews(eventId: string, checkInKey: string) {
  const { showToast } = useToast()
  const key = `${eventId}:${checkInKey}`
  const [value, setValue] = useState<boolean | null>(() => openToCrewsByCheckIn.get(key) ?? null)
  const [readFailed, setReadFailed] = useState(false)
  // A new check-in is a new night: start from what is known for it, if anything.
  const [forKey, setForKey] = useState(key)
  if (forKey !== key) {
    setForKey(key)
    setValue(openToCrewsByCheckIn.get(key) ?? null)
    setReadFailed(false)
  }
  const [busy, setBusy] = useState(false)
  const latest = useRef(0)

  const read = useCallback(async () => {
    const seq = ++latest.current
    setReadFailed(false)
    const result = await crewsApi.openToCrews(eventId)
    if (seq !== latest.current) return
    if (result.success && result.data) {
      openToCrewsByCheckIn.set(key, result.data.openToCrews)
      setValue(result.data.openToCrews)
    } else {
      setReadFailed(true)
    }
  }, [eventId, key])

  useEffect(() => {
    if (openToCrewsByCheckIn.has(key)) return
    let live = true
    const seq = ++latest.current
    void crewsApi.openToCrews(eventId).then((result) => {
      if (!live || seq !== latest.current) return
      if (result.success && result.data) {
        openToCrewsByCheckIn.set(key, result.data.openToCrews)
        setValue(result.data.openToCrews)
      } else {
        setReadFailed(true)
      }
    })
    return () => {
      live = false
    }
  }, [eventId, key])

  const set = async (next: boolean) => {
    const seq = ++latest.current
    const before = value
    setValue(next)
    setBusy(true)
    const result = await crewsApi.openToCrews(eventId, next)
    if (seq !== latest.current) return
    setBusy(false)
    if (!result.success || !result.data) {
      setValue(before)
      showToast(crewMessage(result, 'card', 'Couldn’t save that. Try again.'), 'error')
      return
    }
    openToCrewsByCheckIn.set(key, result.data.openToCrews)
    setValue(result.data.openToCrews)
    setReadFailed(false)
  }

  return { value, readFailed, busy, set, read }
}

/**
 * The Grid's Crews view, above its cards (placeholder design —
 * docs/PLACEHOLDER_SCREENS.md §13): your crews with "We're here", the
 * open-to-crews switch when no crew of yours is here, and the state of the
 * list. The cards themselves are rows of the Room's own list (virtualised);
 * `CrewsFooter` is under them.
 */
export function CrewsHeader({
  eventId,
  checkInKey,
  crews,
  actions,
}: {
  eventId: string
  /** The check-in this is about (its time): the switch is read once per check-in. */
  checkInKey: string
  crews: CrewsHereState
  actions: CrewActions
}) {
  const { state, mine, reload } = crews
  const open = useOpenToCrews(eventId, checkInKey)
  const myCrewsHere = state.status === 'ready' ? state.data.myCrews : []

  return (
    <View style={styles.view}>
      <PlaceholderBanner />

      <View style={styles.block}>
        <Text variant="heading" accessibilityRole="header">
          Your crews
        </Text>
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
                onPress={() => void actions.here(c)}
                busy={actions.hereBusy === c.crewId}
                accessibilityHint="Tells your crew you’re here. It checks nobody else in."
              />
              {actions.hereLines[c.crewId] ? (
                <Text variant="meta" accessibilityLiveRegion="polite">
                  {actions.hereLines[c.crewId]}
                </Text>
              ) : null}
            </View>
          ))
        )}
      </View>

      {myCrewsHere.length === 0 ? (
        <View style={styles.block}>
          <EmberToggle
            label={OPEN_TO_CREWS_LABEL}
            helper={OPEN_TO_CREWS_HELPER}
            value={open.value ?? false}
            onValueChange={(v) => void open.set(v)}
            disabled={open.busy || (open.value === null && !open.readFailed)}
          />
          {open.readFailed ? (
            <Pressable onPress={() => void open.read()} accessibilityRole="button">
              <Text variant="meta">Couldn’t check whether this is on. Tap to try again.</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <View style={styles.block}>
        <Text variant="heading" accessibilityRole="header">
          Crews here
        </Text>
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
            {myCrewsHere.length === 0 && !open.value
              ? 'Turn on “Open to joining a crew tonight” to see crews with room for one more.'
              : 'No other crews here yet. A crew shows once two of them have checked in.'}
          </Text>
        ) : null}
      </View>
    </View>
  )
}

/** Under the cards: the next page, or why it did not come. */
export function CrewsFooter({ crews }: { crews: CrewsHereState }) {
  const { state, loadMore, loadingMore, pageFailed } = crews
  if (state.status !== 'ready' || !state.data.hasMore) return null
  return (
    <View style={styles.footer}>
      {pageFailed ? (
        <Text variant="meta" accessibilityLiveRegion="polite">
          More crews didn’t load.
        </Text>
      ) : null}
      <EmberButton
        label={pageFailed ? 'Try again' : 'More crews'}
        variant="secondary"
        onPress={() => void loadMore()}
        busy={loadingMore}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  view: { paddingHorizontal: GUTTER, gap: SPACE.xl },
  block: { gap: SPACE.md },
  mine: { gap: SPACE.sm },
  footer: { paddingHorizontal: GUTTER, gap: SPACE.sm, paddingTop: SPACE.md },
  pressed: { opacity: OPACITY.pressed },
})

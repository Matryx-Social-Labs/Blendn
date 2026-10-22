import { router, useFocusEffect } from 'expo-router'
import { useCallback, useEffect, useRef, useState } from 'react'

import { subscribeCheckInChanged } from '../../lib/checkIn'
import {
  CREW_REPORT_REASONS,
  crewMessage,
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
import type { TellState } from '../ds/CrewStrip'
import { useToast } from '../Toast'

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
      hue: 'rose',
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
 * Each guarded by a ref, so a fast second tap sends nothing. `onBlend` plays
 * the Blend moment when a like makes one (Flow 10 · 10.8); without it the
 * Blend opens directly.
 */
export function useCrewActions(
  eventId: string | null,
  crews: CrewsHereState,
  { onBlend, likeAsCrewId }: { onBlend?: (blend: BlendRef, card: CrewCard, asCrewId: string | null) => void; likeAsCrewId?: string | null } = {}
) {
  const { showToast } = useToast()
  const [liking, setLiking] = useState<string | null>(null)
  /** "We're here" per crew (Flow 10 · 10.6, CrewStrip): on its way, told, or already told tonight. */
  const [told, setTold] = useState<Record<string, TellState>>({})
  const inFlight = useRef(false)
  const { markLiked, reload } = crews
  const myCrewsHere = crews.state.status === 'ready' ? crews.state.data.myCrews : []

  const here = async (crew: Pick<Crew, 'crewId'>) => {
    if (!eventId || inFlight.current) return
    inFlight.current = true
    setTold((t) => ({ ...t, [crew.crewId]: 'sending' }))
    const result = await crewsApi.here(crew.crewId, eventId)
    inFlight.current = false
    if (result.success && result.data) {
      setTold((t) => ({ ...t, [crew.crewId]: result.data!.repeated ? 'already' : 'yes' }))
      return
    }
    setTold((t) => ({ ...t, [crew.crewId]: 'no' }))
    showToast(crewMessage(result, 'crew', 'Couldn’t tell your crew. Try again.'), 'error', { haptic: 'error' })
  }

  const like = async (card: CrewCard) => {
    if (!eventId || inFlight.current) return
    inFlight.current = true
    try {
      const as = likeAs(myCrewsHere)
      // The Liking-as chip's choice wins; otherwise the one crew here, or ask.
      const asCrewId =
        likeAsCrewId !== undefined
          ? likeAsCrewId
          : as.as === 'crew'
            ? as.crewId
            : as.as === 'choose'
              ? await chooseCrew(myCrewsHere, `Like ${card.name} as…`)
              : undefined
      if (likeAsCrewId === undefined && as.as === 'choose' && !asCrewId) return
      setLiking(card.crewId)
      const result = await crewsApi.likeCrew(eventId, card.crewId, asCrewId ?? undefined)
      setLiking(null)
      if (!result.success || !result.data) {
        showToast(crewMessage(result, 'card', 'Couldn’t send the like. Try again.'), 'error', { haptic: 'error' })
        if (result.errorCode === 'NOT_FOUND') void reload()
        return
      }
      markLiked(card.crewId)
      if (result.data.blend) {
        if (onBlend) onBlend(result.data.blend, card, asCrewId ?? null)
        else {
          showToast("It's a Blend", 'success')
          openBlend(result.data.blend, `Blend with ${card.name}`)
        }
      }
    } finally {
      inFlight.current = false
    }
  }

  const report = (card: CrewCard) =>
    showSheet({
      kind: 'reasons',
      hue: 'rose',
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

  return { liking, like, report, here, told }
}

export type CrewActions = ReturnType<typeof useCrewActions>

/**
 * "Open to joining a crew tonight": read once per check-in, written on a tap.
 * The latest tap wins — an older answer landing late never reverts it — and
 * the switch holds still while a write is in flight. A failed read keeps the
 * switch on screen (off) with a retry, rather than hiding it.
 */
export function useOpenToCrews(eventId: string, checkInKey: string) {
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
      showToast(crewMessage(result, 'card', 'Couldn’t save that. Try again.'), 'error', { haptic: 'error' })
      return
    }
    openToCrewsByCheckIn.set(key, result.data.openToCrews)
    setValue(result.data.openToCrews)
    setReadFailed(false)
  }

  return { value, readFailed, busy, set, read }
}

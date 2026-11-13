import { router } from 'expo-router'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'

import { doorOf } from '../../lib/attendanceState'
import { checkOutOf } from '../../lib/checkIn'
import { checkedOutLine } from '../../lib/switchCopy'
import { apiClient } from '../../lib/apiClient'
import { openRoomOf, setLeftNotice, setLiveHint, useLiveEventId, useLiveTitle, useRoomUp } from '../../lib/blendnOverlay'
import { activeRoomName } from '../../lib/leftRooms'
import { usePassReach } from '../../lib/usePassReach'
import { CHECKOUT_FAILED } from '../../lib/useRoomControls'
import { useCheckInFlow } from '../../lib/useCheckInFlow'
import { CheckInTray, useCheckInTray } from '../blendn/CheckInTray'
import { MomentPour } from '../ds/MomentPour'
import { announceOutcome } from '../ds/shared'
import type { EventCheckOutSheetProps, EventHoldProps } from './EventHold'

/** How long the pour waits for the Room behind it before giving up on it (the Blend'n overlay's own ceiling). */
export const ROOM_WAIT_MS = 4000

/**
 * The event page's check-in (SCRUM-966): the one flow every door runs (`useCheckInFlow`), from the page, with no stop in Tonight.
 * At the server's yes the Room overlay is opened underneath, already asked for this event's room; "You're in." pours over the
 * page, filled, until that Room is up (`useRoomUp`), and the page then steps aside onto it. Refusals are the tray, on this page.
 * Returns the hold's props, the check-out sheet's (and what opens it), and the pour and tray to draw over the whole screen.
 */
export function useEventCheckIn({
  id,
  event,
  openMaps,
}: {
  id: string
  event: (Parameters<typeof doorOf>[0] & { title?: string | null }) | null
  openMaps: () => void
}): {
  hold: EventHoldProps
  checkOut: EventCheckOutSheetProps
  openCheckOut: () => void
  overlays: ReactNode
} {
  const { tray, showTray, closeTray } = useCheckInTray()
  const liveId = useLiveEventId()
  const liveTitle = useLiveTitle()
  // Opened cold (a link, the app not running), the tab bar has not read which room you are in yet: read it once, so the hold
  // says "Hold to switch" and names the room before anyone holds (SCRUM-971). The tab bar's poll takes it from here.
  const hintKnown = liveId !== null
  useEffect(() => {
    if (hintKnown) return
    let live = true
    apiClient
      .getActiveCheckins()
      .then((r) => {
        const active = live && r.success ? (r.data?.checkIns?.[0] ?? null) : null
        if (active) setLiveHint(active.eventId, activeRoomName(active))
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [hintKnown])
  const door = useMemo(() => (event ? doorOf({ ...event, id }, { going: false }) : null), [event, id])
  const reach = usePassReach(door, null, 'on')
  const flow = useCheckInFlow({
    eventId: id,
    showTray,
    closeTray,
    onOpenMaps: openMaps,
    // Under the page, before the pour: the overlay draws the Room's skeleton, never Tonight, and loads this room.
    onCheckedIn: (outcome) => {
      // The server names the room it took you out of (`left`); the poll's title is the fallback for an older one.
      const title = (outcome.kind === 'checkedIn' ? outcome.left[0] : undefined) ?? (liveId && liveId !== id ? liveTitle : null)
      setLeftNotice(title ? { title, toId: id } : null)
      openRoomOf(id)
    },
    onEnterRoom: () => router.dismissTo('/(tabs)/events'),
  })
  const roomUp = useRoomUp(id)
  // The way out of this event's room, with the Room's own call (`checkOutOf`), from its sheet (option A, SCRUM-1035): the page
  // re-reads itself when it lands, and the sheet closes. A refusal stays in the sheet, in its words.
  const [checkOutOpen, setCheckOutOpen] = useState(false)
  const [checkingOut, setCheckingOut] = useState(false)
  const [checkOutError, setCheckOutError] = useState<string | null>(null)
  const onCheckOut = async () => {
    if (checkingOut) return
    setCheckOutError(null)
    setCheckingOut(true)
    try {
      const result = await checkOutOf(id)
      if (result.success) {
        setCheckOutOpen(false)
        // The dock turns back into the check-in hold where the link was: said, or a screen reader hears nothing happened.
        announceOutcome(checkedOutLine(event?.title))
      }
      else setCheckOutError(result.error || CHECKOUT_FAILED)
    } catch {
      setCheckOutError(CHECKOUT_FAILED)
    } finally {
      setCheckingOut(false)
    }
  }
  const openCheckOut = () => {
    setCheckOutError(null)
    setCheckOutOpen(true)
  }
  // The pour that has waited long enough for the Room (kept as its own number, so the next pour starts unwaited).
  const [waitedPour, setWaitedPour] = useState(0)
  useEffect(() => {
    if (!flow.pours) return
    const timer = setTimeout(() => setWaitedPour(flow.pours), ROOM_WAIT_MS)
    return () => clearTimeout(timer)
  }, [flow.pours])

  return {
    checkOut: {
      visible: checkOutOpen,
      onClose: () => setCheckOutOpen(false),
      name: event?.title ?? null,
      onConfirm: () => void onCheckOut(),
      busy: checkingOut,
      error: checkOutError,
    },
    openCheckOut,
    hold: { reach, onConfirm: () => void flow.start(), busy: flow.checkingIn && !flow.youreIn, confirmed: flow.youreIn, switching: liveId !== null && liveId !== id, leaving: liveTitle },
    overlays: (
      <>
        {flow.pours > 0 ? (
          // Over the page's own bar (zIndex 10): the pour covers all of it.
          <View style={styles.cover} pointerEvents="box-none">
            <MomentPour key={flow.pours} testID="scene-pour" ground venue={event?.venue_name ?? ''} ready={roomUp || waitedPour === flow.pours} asks={flow.asks} onDone={flow.pourDone} />
          </View>
        ) : null}
        <CheckInTray tray={tray} onClose={flow.dismissTray} testID="scene-tray" />
      </>
    ),
  }
}

const styles = StyleSheet.create({ cover: { ...StyleSheet.absoluteFill, zIndex: 20 } })

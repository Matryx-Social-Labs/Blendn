import { router } from 'expo-router'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'

import { doorOf } from '../../lib/attendanceState'
import { openRoomOf, useLiveEventId, useLiveTitle, useRoomUp } from '../../lib/blendnOverlay'
import { usePassReach } from '../../lib/usePassReach'
import { useCheckInFlow } from '../../lib/useCheckInFlow'
import { CheckInTray, useCheckInTray } from '../blendn/CheckInTray'
import { MomentPour } from '../ds/MomentPour'
import type { EventHoldProps } from './EventHold'

/** How long the pour waits for the Room behind it before giving up on it (the Blend'n overlay's own ceiling). */
export const ROOM_WAIT_MS = 4000

/**
 * The event page's check-in (SCRUM-966): the one flow every door runs (`useCheckInFlow`), from the page, with no stop in Tonight.
 * At the server's yes the Room overlay is opened underneath, already asked for this event's room; "You're in." pours over the
 * page, filled, until that Room is up (`useRoomUp`), and the page then steps aside onto it. Refusals are the tray, on this page.
 * Returns the hold's props and the pour and tray to draw over the whole screen.
 */
export function useEventCheckIn({ id, event, openMaps }: { id: string; event: Parameters<typeof doorOf>[0] | null; openMaps: () => void }): {
  hold: EventHoldProps
  overlays: ReactNode
} {
  const { tray, showTray, closeTray } = useCheckInTray()
  const door = useMemo(() => (event ? doorOf({ ...event, id }, { going: false }) : null), [event, id])
  const reach = usePassReach(door, null, 'on')
  const flow = useCheckInFlow({
    eventId: id,
    showTray,
    closeTray,
    onOpenMaps: openMaps,
    // Under the page, before the pour: the overlay draws the Room's skeleton, never Tonight, and loads this room.
    onCheckedIn: () => openRoomOf(id),
    onEnterRoom: () => router.dismissTo('/(tabs)/events'),
  })
  const roomUp = useRoomUp(id)
  const liveId = useLiveEventId()
  const liveTitle = useLiveTitle()
  // The pour that has waited long enough for the Room (kept as its own number, so the next pour starts unwaited).
  const [waitedPour, setWaitedPour] = useState(0)
  useEffect(() => {
    if (!flow.pours) return
    const timer = setTimeout(() => setWaitedPour(flow.pours), ROOM_WAIT_MS)
    return () => clearTimeout(timer)
  }, [flow.pours])

  return {
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

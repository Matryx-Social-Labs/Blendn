import { router, useLocalSearchParams } from 'expo-router'
import { useCallback, useEffect, useRef, useState } from 'react'

import { WavedAtYouList, type WaveBackResult } from '../../components/blendn/WavedAtYouList'
import { openBlend } from '../../components/crews/CrewsView'
import { StateScreen } from '../../components/ds/StateScreen'
import { MomentMatch } from '../../components/ds/MomentMatch'
import { Sheet } from '../../components/ds/Sheet'
import { HueProvider } from '../../components/ds/shared'
import { RouteModal } from '../../components/system/RouteModal'
import { useToast } from '../../components/Toast'
import { apiClient, type CrewWave } from '../../lib/apiClient'
import { blendWith } from '../../lib/crews'
import { showCrewSafetyActions } from '../../lib/crewSafety'
import { askOpenToCrews, waveBackAtCrew } from '../../lib/crewWaveBack'
import { Logger } from '../../lib/logger'
import { useReducedMotion } from '../../lib/motion'
import { useNow } from '../../lib/useNow'
import { isCrewWave, type AnyWave } from '../../lib/receivedWaves'
import { ignoreCrewWaves, ignoreWavesFrom, wavesChanged, wavesListOpened } from '../../lib/roomWaves'
import { showUserSafetyActions } from '../../lib/safetyUtils'
import { isLinkId } from '../../lib/shareLinks'
import { WAVE_SETTLE_MS, WAVE_SETTLE_REDUCED_MS, waveRefusal } from '../../lib/waves'

type Moment = { conversationId: string; you: string | null; them: string; themId: string }

/**
 * "Waved at you" (board 03 S-A See all), a sheet over wherever it was opened: the Room's strip, the L-B toast, or
 * Banter's row (B-A). A route, so it works after you have left the room: a wave to you can be answered until the room
 * closes. A wave back is always a mutual, so the moment (M-A) plays here; the Room under it holds its own
 * (`wavesListOpened`).
 */
export default function WavedAtYouScreen() {
  const params = useLocalSearchParams<{ eventId: string; title?: string }>()
  // From a link or a param: checked before it builds an API path (security review). Not an id, the gone state.
  const eventId = isLinkId(params.eventId) ? params.eventId : null
  const { showToast } = useToast()
  const reduceMotion = useReducedMotion()
  const now = useNow(15_000)
  const [open, setOpen] = useState(true)
  const [moment, setMoment] = useState<Moment | null>(null)
  /** The moment is its own Modal: iOS refuses it while the sheet's is still leaving, so it waits for the sheet to go. */
  const [sheetGone, setSheetGone] = useState(false)
  useEffect(() => wavesListOpened(), [])

  /** What happens once the list has left: a crew's Mix, a sheet (the app's one SheetHost waits for this route's Modal), or nothing. */
  const afterList = useRef<(() => void) | null>(null)
  const leaveFor = useCallback((next: () => void) => {
    afterList.current = next
    setOpen(false)
  }, [])

  const waveBackCrew = useCallback(
    async (crew: CrewWave): Promise<WaveBackResult> => {
      if (!eventId) return 'none'
      const outcome = await waveBackAtCrew(eventId, crew.crewId)
      if (outcome.kind === 'notOpen') {
        leaveFor(() =>
          askOpenToCrews(eventId, crew, (answer) => {
            wavesChanged()
            if (answer.kind === 'gone') showToast('They’ve left the room', 'info')
            else if (answer.kind === 'done' && answer.blend) openBlend(answer.blend, blendWith(crew.name))
            else if (answer.kind === 'done') showToast(`Waved back at ${crew.name}`, 'success')
          })
        )
        return 'none'
      }
      if (outcome.kind === 'error') {
        showToast(outcome.text, 'error')
        return 'none'
      }
      wavesChanged()
      if (outcome.kind === 'gone') return 'gone'
      const { blend } = outcome
      if (blend) {
        showToast("It’s a Mix", 'success')
        leaveFor(() => openBlend(blend, blendWith(crew.name)))
      }
      return 'done'
    },
    [eventId, leaveFor, showToast]
  )

  const waveBack = useCallback(
    async (w: AnyWave): Promise<WaveBackResult> => {
      try {
        if (!eventId) return 'none'
        if (isCrewWave(w)) return await waveBackCrew(w)
        const [result] = await Promise.all([apiClient.sendWave(eventId, w.userId), new Promise((r) => setTimeout(r, reduceMotion ? WAVE_SETTLE_REDUCED_MS : WAVE_SETTLE_MS))])
        wavesChanged()
        if (!result.success) {
          showToast(waveRefusal(result.errorCode, result.error).message, 'info')
          return 'none'
        }
        if (result.data?.mutual && result.data.conversationId) {
          setMoment({ conversationId: result.data.conversationId, you: result.data.pseudonyms?.you ?? null, them: result.data.pseudonyms?.them || w.displayName, themId: w.userId })
          setOpen(false)
        }
        return 'done'
      } catch (e) {
        Logger.error('match', 'wave back from the list failed', { error: e })
        showToast(waveRefusal(undefined, undefined).message, 'error')
        return 'none'
      }
    },
    [eventId, reduceMotion, showToast, waveBackCrew]
  )

  /*
   * Block or Report from a row (anti-spam W7). The sheet is the app's one SheetHost, which cannot present over this
   * route's Modal (it waits for the screen turn the route holds): the list leaves first, then it asks over the Room or
   * Banter. A block or report hides their waves there at once (`ignoreWavesFrom` re-reads the strip and the row).
   */
  const safety = useCallback(
    (w: AnyWave) =>
      leaveFor(() => {
        if (isCrewWave(w)) return showCrewSafetyActions(w, () => ignoreCrewWaves(w.crewId))
        const done = () => ignoreWavesFrom(w.userId)
        showUserSafetyActions(w.displayName, w.userId, done, done)
      }),
    [leaveFor]
  )
  const sheetDismissed = () => {
    if (moment) return setSheetGone(true)
    router.back()
    const next = afterList.current
    afterList.current = null
    next?.()
  }

  return (
    <HueProvider value="rose">
      <RouteModal>
        <Sheet visible={open} onClose={() => setOpen(false)} onDismissed={sheetDismissed} detents={['tall']} testID="waved-sheet">
          {eventId ? (
            <WavedAtYouList eventId={eventId} now={now} onWaveBack={waveBack} onSafety={safety} />
          ) : (
            <StateScreen icon="hand" title="This room isn’t available." body="It may have closed, or the link is wrong." testID="waved-gone" />
          )}
        </Sheet>
        {moment && sheetGone ? (
          <MomentMatch
            key={moment.conversationId}
            you={{ kind: 'creature', pseudonym: moment.you ?? 'You' }}
            them={{ kind: 'creature', pseudonym: moment.them }}
            name={moment.them}
            onClose={() => router.back()}
            onSayHi={() =>
              router.replace({
                pathname: '/private-chat/[conversationId]',
                params: { conversationId: moment.conversationId, otherUserName: moment.them, otherUserId: moment.themId },
              } as never)
            }
            testID="waved-moment"
          />
        ) : null}
      </RouteModal>
    </HueProvider>
  )
}

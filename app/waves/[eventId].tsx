import { router, useLocalSearchParams } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'

import { WavedAtYouList } from '../../components/blendn/WavedAtYouList'
import { StateScreen } from '../../components/ds/StateScreen'
import { MomentMatch } from '../../components/ds/MomentMatch'
import { Sheet } from '../../components/ds/Sheet'
import { HueProvider } from '../../components/ds/shared'
import { RouteModal } from '../../components/system/RouteModal'
import { useToast } from '../../components/Toast'
import { apiClient, type ReceivedWave } from '../../lib/apiClient'
import { Logger } from '../../lib/logger'
import { useReducedMotion } from '../../lib/motion'
import { useNow } from '../../lib/useNow'
import { ignoreWavesFrom, wavesChanged, wavesListOpened } from '../../lib/roomWaves'
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
  useEffect(() => wavesListOpened(), [])

  const waveBack = useCallback(
    async (w: ReceivedWave): Promise<boolean> => {
      try {
        if (!eventId) return false
        const [result] = await Promise.all([apiClient.sendWave(eventId, w.userId), new Promise((r) => setTimeout(r, reduceMotion ? WAVE_SETTLE_REDUCED_MS : WAVE_SETTLE_MS))])
        wavesChanged()
        if (!result.success) {
          showToast(waveRefusal(result.errorCode, result.error).message, 'info')
          return false
        }
        if (result.data?.mutual && result.data.conversationId) {
          setMoment({ conversationId: result.data.conversationId, you: result.data.pseudonyms?.you ?? null, them: result.data.pseudonyms?.them || w.displayName, themId: w.userId })
          setOpen(false)
        }
        return true
      } catch (e) {
        Logger.error('match', 'wave back from the list failed', { error: e })
        showToast(waveRefusal(undefined, undefined).message, 'error')
        return false
      }
    },
    [eventId, reduceMotion, showToast]
  )

  const safety = useCallback((w: ReceivedWave, removed: () => void) => {
    const done = () => {
      removed()
      ignoreWavesFrom(w.userId)
    }
    showUserSafetyActions(w.displayName, w.userId, done, done)
  }, [])

  return (
    <HueProvider value="rose">
      <RouteModal>
        <Sheet visible={open} onClose={() => setOpen(false)} onDismissed={() => (moment ? undefined : router.back())} detents={['tall']} testID="waved-sheet">
          {eventId ? (
            <WavedAtYouList eventId={eventId} now={now} onWaveBack={waveBack} onSafety={safety} />
          ) : (
            <StateScreen icon="hand" title="This room isn’t available." body="It may have closed, or the link is wrong." testID="waved-gone" />
          )}
        </Sheet>
        {moment ? (
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

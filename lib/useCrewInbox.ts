import { useFocusEffect } from 'expo-router'
import { useCallback, useState } from 'react'

import { crewMessage, type Crew, type CrewInvite } from './crews'
import { crewsApi } from './crewsApi'
import { Logger } from './logger'
import { showSheet } from './sheet'
import { useBlends } from './useBlends'

/**
 * What the Banter needs from crews (Flow 5 R2-D2): the invites waiting for
 * you, as request cards; each crew chat's emblem; each open Blend's two
 * sides. `GET /chat/groups` carries none of it (its `rooms` have no
 * `emblemSeed`), so it is read from the crews and Blends routes, on focus.
 * A failed read draws nothing new: the rows fall back to a plain square.
 */
export function useCrewInbox(onError: (text: string) => void) {
  const [crews, setCrews] = useState<Crew[]>([])
  const [invites, setInvites] = useState<CrewInvite[]>([])
  /** The first read has answered, either way: until then "no invites" is not known. */
  const [loaded, setLoaded] = useState(false)
  const { blends } = useBlends()

  const load = useCallback(async () => {
    const result = await crewsApi.myCrews()
    setLoaded(true)
    if (!result.success || !result.data) return Logger.warn('chat', 'Crews for the Banter did not load', { error: result.error })
    setCrews(result.data.crews)
    setInvites(result.data.invites)
  }, [])
  useFocusEffect(
    useCallback(() => {
      void load()
    }, [load])
  )

  /** The emblem a crew chat draws, by its room. */
  const seedFor = useCallback((chatGroupId: string) => crews.find((c) => c.chatGroupId === chatGroupId)?.emblemSeed ?? null, [crews])

  /** A Blend's two sides, yours first: their emblems (or the person's pseudonym) and the other side's name. */
  const blendFor = useCallback(
    (chatGroupId: string) => {
      const blend = blends.find((b) => b.chatGroupId === chatGroupId)
      if (!blend) return null
      const mine = blend.sides.find((s) => s.mine) ?? blend.sides[0]
      const theirs = blend.sides.find((s) => s !== mine) ?? null
      return { mineSeed: mine?.emblemSeed ?? null, theirSeed: theirs?.emblemSeed ?? null, theirName: theirs?.name ?? null, closesAt: blend.closesAt }
    },
    [blends]
  )

  /*
   * Declining asks first, as the crews screen does: it is told to nobody, and
   * for 30 days the same invite is neither re-sent nor re-notified.
   */
  const decline = useCallback(
    (invite: CrewInvite) =>
      showSheet({
        kind: 'actions',
        hue: 'rose',
        title: `Decline ${invite.name}?`,
        message: `${invite.invitedBy} isn’t told. They can’t ask you into this crew again for 30 days.`,
        actions: [
          {
            label: 'Decline',
            variant: 'destructive',
            then: () => {
              void crewsApi.decline(invite.crewId).then((result) => {
                // Nobody is told, and a gone invite is as good as declined.
                if (!result.success && result.errorCode !== 'NOT_FOUND') return onError(crewMessage(result, 'join', 'Couldn’t decline. Try again.'))
                setInvites((prev) => prev.filter((i) => i.crewId !== invite.crewId))
              })
            },
          },
          { label: 'Cancel', cancel: true },
        ],
      }),
    [onError]
  )

  return { invites, loaded, seedFor, blendFor, decline }
}

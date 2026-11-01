import { useFocusEffect } from 'expo-router'
import { useCallback, useRef, useState } from 'react'

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
export function useCrewInbox(onError: (text: string) => void, { withBlends = true }: { withBlends?: boolean } = {}) {
  const [crews, setCrews] = useState<Crew[]>([])
  const [invites, setInvites] = useState<CrewInvite[]>([])
  const [invitesTotal, setInvitesTotal] = useState(0)
  const [invitesCursor, setInvitesCursor] = useState<string | null>(null)
  /** The first read has answered, either way: until then "no invites" is not known. */
  const [loaded, setLoaded] = useState(false)
  /** The last read failed: what is drawn may not be all of it. */
  const [failed, setFailed] = useState(false)
  const loadingMore = useRef(false)
  const { blends } = useBlends(withBlends)

  const load = useCallback(async () => {
    const result = await crewsApi.myCrews()
    setLoaded(true)
    if (!result.success || !result.data) {
      setFailed(true)
      return Logger.warn('chat', 'Crews for the Banter did not load', { error: result.error })
    }
    setFailed(false)
    setCrews(result.data.crews)
    setInvites(result.data.invites)
    const page = result.data.invitesPagination
    setInvitesTotal(page?.totalCount ?? result.data.invites.length)
    setInvitesCursor(page?.hasMore ? page.nextCursor : null)
  }, [])

  /** The next page of invites onto the ones held; a failure keeps them. */
  const moreInvites = useCallback(async () => {
    if (!invitesCursor || loadingMore.current) return
    loadingMore.current = true
    const result = await crewsApi.myCrews(invitesCursor)
    loadingMore.current = false
    if (!result.success || !result.data) return setFailed(true)
    const { invites: next, invitesPagination: page } = result.data
    setInvites((prev) => {
      const seen = new Set(prev.map((i) => i.crewId))
      return [...prev, ...next.filter((i) => !seen.has(i.crewId))]
    })
    setInvitesCursor(page?.hasMore ? page.nextCursor : null)
    if (page) setInvitesTotal(page.totalCount)
  }, [invitesCursor])
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
                setInvitesTotal((t) => Math.max(0, t - 1))
              })
            },
          },
          { label: 'Cancel', cancel: true },
        ],
      }),
    [onError]
  )

  return { invites, invitesTotal, invitesCursor, moreInvites, reload: load, loaded, failed, seedFor, blendFor, decline }
}

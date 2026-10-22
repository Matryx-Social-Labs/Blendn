import { useEffect, useRef, useState } from 'react'

import {
  cachedPoll,
  getPoll,
  optionIdAt,
  pollReadDelay,
  pollRefusal,
  pollView,
  rememberPoll,
  votePoll,
  type PollRefusal,
  type PollResults,
} from '../../lib/chatPoll'
import { userMessage } from '../../lib/userMessage'
import { PollBubble } from '../ds/PollBubble'
import { SystemNotice } from '../ds/SystemNotice'
import { useToast } from '../Toast'

/**
 * An organiser's poll as the room draws it (Flow 5 poll bubbles, Flow 15 #17): the question and options from the poll's own
 * read, your vote from its answer, counts exactly as the server discloses them (withheld ones in its own words, by
 * `suppressedReason`; hidden until it closes; Closed). Until the poll has loaded, or when it will not, it is the room's notice,
 * the same sentence the room said before polls could be answered, never an empty bubble.
 *
 * A room of thousands opens at once, so a poll is read only once its row is viewable, after a random beat of up to two
 * seconds, and a poll read in the last 20 s on this phone is not asked for again.
 *
 * A vote or a change is the server's answer: the bubble redraws from what it sends back, never from a local count. A 409 is
 * read by its `reasonCode`: "This poll has closed" shows for a moment and the bubble goes closed; the room's own refusals (it
 * is closed, you are not in it, you are not live in it) go to `onRoomRefusal`, which locks the room. `H.select` is the bubble's.
 */
export function RoomPoll({
  eventId,
  pollId,
  question,
  viewable = true,
  onRoomRefusal,
  testID,
}: {
  eventId: string
  pollId: string
  question: string
  /** The row is on screen: the first read waits for this. */
  viewable?: boolean
  onRoomRefusal?: (reason: PollRefusal) => void
  testID?: string
}) {
  const { showToast } = useToast()
  const [results, setResults] = useState<PollResults | null>(() => cachedPoll(pollId))
  const voting = useRef(false)
  const have = results !== null

  const apply = (next: PollResults) => {
    rememberPoll(pollId, next)
    setResults(next)
  }

  // The read lands in a promise callback, after the beat, and only while the row is on screen.
  useEffect(() => {
    if (!viewable || have) return
    let live = true
    const run = () =>
      getPoll(eventId, pollId)
        .then((result) => {
          if (live && result.success && result.data) {
            rememberPoll(pollId, result.data)
            setResults(result.data)
          }
        })
        .catch(() => {})
    const delay = pollReadDelay()
    const timer = delay > 0 ? setTimeout(run, delay) : undefined
    if (!timer) run()
    return () => {
      live = false
      if (timer) clearTimeout(timer)
    }
  }, [eventId, pollId, viewable, have])

  const read = async () => {
    const result = await getPoll(eventId, pollId)
    if (result.success && result.data) apply(result.data)
  }

  const vote = async (index: number) => {
    const optionId = results && optionIdAt(results, index)
    if (!optionId || voting.current) return
    voting.current = true
    try {
      const result = await votePoll(eventId, pollId, optionId)
      if (result.success && result.data) return apply(result.data)
      const refusal = pollRefusal(result)
      if (refusal === 'POLL_CLOSED') {
        showToast('This poll has closed.', 'info')
        return void (await read())
      }
      if (refusal === 'ROOM_CLOSED' || refusal === 'NOT_IN_ROOM' || refusal === 'NOT_LIVE') return onRoomRefusal?.(refusal)
      showToast(userMessage(result, "Couldn't save your vote. Try again."), 'error', { haptic: 'error' })
    } catch {
      showToast("Couldn't save your vote. Try again.", 'error', { haptic: 'error' })
    } finally {
      voting.current = false
    }
  }

  if (!results) return <SystemNotice icon="chart-column" text={`Poll: ${question}`} testID={testID && `${testID}-notice`} />
  const view = pollView(results)
  return (
    <PollBubble
      testID={testID}
      question={results.question}
      options={view.options}
      picked={view.picked}
      closed={view.closed}
      withheldLine={view.withheldLine}
      onVote={view.closed ? undefined : (i) => void vote(i)}
    />
  )
}

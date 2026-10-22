import { useCallback, useEffect, useRef, useState } from 'react'

import { getPoll, optionIdAt, pollClosed, pollView, votePoll, type PollResults } from '../../lib/chatPoll'
import { userMessage } from '../../lib/userMessage'
import { PollBubble } from '../ds/PollBubble'
import { SystemNotice } from '../ds/SystemNotice'
import { useToast } from '../Toast'

/**
 * An organiser's poll as the room draws it (Flow 5 poll bubbles, Flow 15 #17): the question and options from the
 * poll's own read, your vote from its answer, counts exactly as the server discloses them ("Fewer than 5", never a
 * zero; "Results appear when the poll closes" while hidden). Until the poll has loaded, or when it will not, it is the
 * room's notice, the same sentence the room said before polls could be answered, never an empty bubble.
 *
 * A vote or a change is the server's answer: the bubble redraws from what it sends back, never from a local count the
 * disclosure rule may have withheld. The one 409 the room keeps is "This poll has closed": it shows for a moment and
 * the bubble goes to its closed state. `H.select` is the bubble's own.
 */
export function RoomPoll({ eventId, pollId, question, testID }: { eventId: string; pollId: string; question: string; testID?: string }) {
  const { showToast } = useToast()
  const [results, setResults] = useState<PollResults | null>(null)
  const voting = useRef(false)

  const read = useCallback(async () => {
    const result = await getPoll(eventId, pollId)
    if (result.success && result.data) setResults(result.data)
  }, [eventId, pollId])
  // The read lands in a promise callback, never synchronously in the effect.
  useEffect(() => {
    let live = true
    getPoll(eventId, pollId)
      .then((result) => {
        if (live && result.success && result.data) setResults(result.data)
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [eventId, pollId])

  const vote = async (index: number) => {
    const optionId = results && optionIdAt(results, index)
    if (!optionId || voting.current) return
    voting.current = true
    try {
      const result = await votePoll(eventId, pollId, optionId)
      if (result.success && result.data) return setResults(result.data)
      if (pollClosed(result.error)) {
        showToast('This poll has closed.', 'info')
        return void (await read())
      }
      showToast(userMessage(result, "Couldn't save your vote. Try again."), 'error', { haptic: 'error' })
    } catch {
      showToast("Couldn't save your vote. Try again.", 'error', { haptic: 'error' })
    } finally {
      voting.current = false
    }
  }

  if (!results) return <SystemNotice icon="chart-column" text={`Poll: ${question}`} testID={testID && `${testID}-notice`} />
  const view = pollView(results)
  return <PollBubble testID={testID} question={results.question} options={view.options} picked={view.picked} closed={view.closed} onVote={view.closed ? undefined : (i) => void vote(i)} />
}

/**
 * What a thread keeps only on this phone (ROUND3 D 5.8, SCRUM-633): the draft
 * and the failed sends, and what a Banter row says because of them — failed
 * first, then the draft, then (null) the last message.
 */
import { dmThread, draftOf, failedOf, keepFailed, outboxLine, readOutbox, resetOutbox, roomThread, setDraft } from '../lib/chatOutbox'

const snapshot = readOutbox

beforeEach(() => resetOutbox())

it('keys rooms and DMs apart', () => {
  expect(roomThread('g1')).toBe('room:g1')
  expect(dmThread('c1')).toBe('dm:c1')
})

it('keeps a draft, and forgets one that is only whitespace', () => {
  setDraft('dm:c1', 'see you there')
  expect(draftOf('dm:c1')).toBe('see you there')
  setDraft('dm:c1', '   ')
  expect(draftOf('dm:c1')).toBe('')
})

it('keeps the failed sends a thread hands it, and gives them back', () => {
  const failed = [{ id: 'local-1', text: 'stairs' }]
  keepFailed('room:g1', failed)
  expect(failedOf('room:g1')).toEqual(failed)
  keepFailed('room:g1', [])
  expect(failedOf('room:g1')).toEqual([])
})

it('says failed before draft before nothing', () => {
  setDraft('dm:c1', 'see you   Thursday')
  expect(outboxLine(snapshot(), 'dm:c1')).toEqual({ kind: 'draft', text: 'see you Thursday' })
  keepFailed('dm:c1', [{ id: 'local-1' }])
  expect(outboxLine(snapshot(), 'dm:c1')).toEqual({ kind: 'failed' })
  expect(outboxLine(snapshot(), 'dm:other')).toBeNull()
})

/**
 * What a thread keeps only on this phone (ROUND3 D 5.8, SCRUM-633): the draft
 * and the failed sends, and what a Banter row says because of them — failed
 * first, then the draft, then (null) the last message. An account's, never the
 * next one's on the same phone (Flow 5 security review).
 */
jest.mock('../lib/apiClient', () => ({
  apiClient: { signInWithEmail: jest.fn(), signOut: jest.fn(), getSession: jest.fn(), refreshSession: jest.fn() },
  TokenStorage: { clearAll: jest.fn().mockResolvedValue(undefined), setUser: jest.fn(), getUser: jest.fn(), getAccessToken: jest.fn() },
}))
jest.mock('../lib/logger', () => ({ Logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } }))
jest.mock('@sentry/react-native', () => ({ setUser: jest.fn() }))
jest.mock('../lib/notifications', () => ({}))
jest.mock('../lib/socketClient', () => ({ socketClient: { disconnect: jest.fn() } }))
jest.mock('../lib/goLive', () => ({ clearLiveSession: jest.fn() }))
jest.mock('../lib/purchases', () => ({ syncPurchasesUser: jest.fn(async () => {}) }))

/* eslint-disable import/first */
import { apiClient } from '../lib/apiClient'
import { clearOutbox, dmThread, draftOf, failedOf, keepFailed, outboxLine, readOutbox, roomThread, setDraft } from '../lib/chatOutbox'
import { hasLeftRoom, markRoomLeft } from '../lib/roomMembership'
import { signInWithEmail, signOut } from '../lib/useAuth'
/* eslint-enable import/first */

const snapshot = readOutbox
const A = 'user-a'
const B = 'user-b'

beforeEach(() => clearOutbox())

it('keys rooms and DMs apart, and by account', () => {
  expect(roomThread('g1', A)).toBe('user-a:room:g1')
  expect(dmThread('c1', A)).toBe('user-a:dm:c1')
  expect(roomThread('g1', B)).not.toBe(roomThread('g1', A))
})

it('keeps a draft, and forgets one that is only whitespace', () => {
  setDraft(dmThread('c1', A), 'see you there')
  expect(draftOf(dmThread('c1', A))).toBe('see you there')
  setDraft(dmThread('c1', A), '   ')
  expect(draftOf(dmThread('c1', A))).toBe('')
})

it('keeps the failed sends a thread hands it, and gives them back', () => {
  const failed = [{ id: 'local-1', text: 'stairs' }]
  keepFailed(roomThread('g1', A), failed)
  expect(failedOf(roomThread('g1', A))).toEqual(failed)
  keepFailed(roomThread('g1', A), [])
  expect(failedOf(roomThread('g1', A))).toEqual([])
})

it('says failed before draft before nothing', () => {
  setDraft(dmThread('c1', A), 'see you   Thursday')
  expect(outboxLine(snapshot(), dmThread('c1', A))).toEqual({ kind: 'draft', text: 'see you Thursday' })
  keepFailed(dmThread('c1', A), [{ id: 'local-1' }])
  expect(outboxLine(snapshot(), dmThread('c1', A))).toEqual({ kind: 'failed' })
  expect(outboxLine(snapshot(), dmThread('other', A))).toBeNull()
})

describe('one account’s outbox is never the next one’s', () => {
  it('shows B nothing of A’s in a room they share, nor in a DM', () => {
    setDraft(roomThread('g1', A), 'meet at the bar')
    keepFailed(roomThread('g1', A), [{ id: 'temp-1', text: 'A’s unsent line' }])
    keepFailed(dmThread('c1', A), [{ id: 'local-1', text: 'A’s unsent DM' }])

    expect(draftOf(roomThread('g1', B))).toBe('')
    expect(failedOf(roomThread('g1', B))).toEqual([])
    expect(failedOf(dmThread('c1', B))).toEqual([])
    expect(outboxLine(snapshot(), roomThread('g1', B))).toBeNull()
  })

  it('has no thread without a signed-in account, so a late write is dropped', () => {
    expect(roomThread('g1', undefined)).toBeNull()
    setDraft(roomThread('g1', null), 'written after sign-out')
    keepFailed(dmThread('c1', undefined), [{ id: 'local-1' }])
    expect(snapshot().drafts.size).toBe(0)
    expect(snapshot().failed.size).toBe(0)
    expect(draftOf(null)).toBe('')
    expect(failedOf(null)).toEqual([])
    expect(outboxLine(snapshot(), null)).toBeNull()
  })

  it('is emptied by sign-out, with the rooms A left', async () => {
    const api = apiClient as jest.Mocked<typeof apiClient>
    api.signInWithEmail.mockResolvedValue({ success: true, data: { user: { id: A, email: 'a@b.c' } } } as never)
    await signInWithEmail('a@b.c', 'pw')
    setDraft(roomThread('g1', A), 'meet at the bar')
    keepFailed(roomThread('g1', A), [{ id: 'temp-1' }])
    markRoomLeft('g1')

    api.signOut.mockResolvedValue({ success: true } as never)
    await signOut()

    expect(snapshot().drafts.size).toBe(0)
    expect(snapshot().failed.size).toBe(0)
    // B, a member of g1, would have had it missing from their Banter.
    expect(hasLeftRoom('g1')).toBe(false)
  })
})

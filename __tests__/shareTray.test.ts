/*
 * The share tray's store and the event loader (Flow 16 · 16.1): one request at a time, settled when it closes, and a
 * row that does not say whether it may be shared is asked of the event itself.
 */
const mockGetEvent = jest.fn()
const mockToast = jest.fn()
jest.mock('../lib/apiClient', () => ({ apiClient: { getEvent: (...a: unknown[]) => mockGetEvent(...a) } }))
jest.mock('../lib/toast', () => ({ toast: (...a: unknown[]) => mockToast(...a) }))

import { shareEvent } from '../lib/shareRow'
import { closeShare, openShare, resetShareTray } from '../lib/shareTray'

const ROW = { id: 'e1', title: 'Neon Nights', start_time: '2026-10-04T15:30:00.000Z', venue_name: 'Toit', city: 'Indiranagar', cover_image_url: null }
const INVITE = { kind: 'invite' as const, url: 'https://www.blendn.app/f/abc' }

beforeEach(() => {
  resetShareTray()
  mockGetEvent.mockReset()
  mockToast.mockReset()
})

describe('the store', () => {
  it('settles with whether the link went anywhere when the tray closes', async () => {
    const sent = openShare(INVITE)
    closeShare(true)
    await expect(sent).resolves.toBe(true)
    const dismissed = openShare(INVITE)
    closeShare(false)
    await expect(dismissed).resolves.toBe(false)
  })

  it('a second request replaces the first, which is a dismiss', async () => {
    const first = openShare(INVITE)
    const second = openShare({ kind: 'invite', url: 'https://www.blendn.app/f/def' })
    await expect(first).resolves.toBe(false)
    closeShare(true)
    await expect(second).resolves.toBe(true)
  })
})

describe('sharing an event from a row', () => {
  it('opens the tray from a row that says it is public, without asking the server', async () => {
    const sent = shareEvent({ ...ROW, visibility: 'public', status: 'published' })
    expect(mockGetEvent).not.toHaveBeenCalled()
    closeShare(true)
    await expect(sent).resolves.toBe(true)
  })

  it('asks the event when the row does not say, and shares what the event says it is', async () => {
    mockGetEvent.mockResolvedValue({ success: true, data: { ...ROW, startTime: ROW.start_time, venueName: 'Toit', visibility: 'unlisted', status: 'published' } })
    const sent = shareEvent(ROW)
    await Promise.resolve()
    await Promise.resolve()
    expect(mockGetEvent).toHaveBeenCalledWith('e1')
    closeShare(true)
    await expect(sent).resolves.toBe(true)
  })

  it('says so and opens nothing for a private event', async () => {
    mockGetEvent.mockResolvedValue({ success: true, data: { ...ROW, visibility: 'private', status: 'published' } })
    await expect(shareEvent(ROW)).resolves.toBe(false)
    expect(mockToast).toHaveBeenCalledWith("This one can't be shared.", 'info')
  })

  it('says so, and opens nothing, when the event cannot be loaded', async () => {
    mockGetEvent.mockResolvedValue({ success: false, error: 'offline' })
    await expect(shareEvent(ROW)).resolves.toBe(false)
    expect(mockToast).toHaveBeenCalledWith("Couldn't open sharing. Try again.", 'error')
    mockGetEvent.mockRejectedValue(new Error('boom'))
    await expect(shareEvent(ROW)).resolves.toBe(false)
  })
})

/*
 * What `/profiles/:id` carries beside `/users/:id`: their badges and `friend`. One shared read for whoever asks while it is on the
 * wire, never through the profile cache (which holds YOUR profile), and `badges` off only where the server that sends `friend`
 * says nothing of them.
 */
const mockGetProfile = jest.fn()
jest.mock('../lib/apiClient', () => ({ apiClient: { getProfile: (...a: unknown[]) => mockGetProfile(...a) } }))

import { badgesOnUserRead, profileExtras } from '../lib/profileExtras'

// profile-badges.itest.ts: `{ kind, label }[]` inside `profile`.
const NIGHTS = [{ kind: 'nights_out', label: '5+ nights this month' }]

beforeEach(() => jest.clearAllMocks())

it('two askers of the same person while the read is on the wire share it, and it reads fresh', async () => {
  let answer: (v: unknown) => void = () => {}
  mockGetProfile.mockReturnValue(new Promise((r) => (answer = r)))
  const a = profileExtras('u1')
  const b = profileExtras('u1')
  answer({ success: true, data: { profile: { badges: NIGHTS }, friend: { state: 'none' } } })
  expect(await a).toEqual({ badges: NIGHTS, friend: { state: 'none' } })
  expect(await b).toEqual(await a)
  expect(mockGetProfile).toHaveBeenCalledTimes(1)
  expect(mockGetProfile).toHaveBeenCalledWith('u1', { cache: false })
})

it('asks again once the read has settled, and for a different person at once', async () => {
  mockGetProfile.mockResolvedValue({ success: true, data: { profile: {} } })
  await profileExtras('u1')
  await profileExtras('u1')
  await Promise.all([profileExtras('u2'), profileExtras('u3')])
  expect(mockGetProfile).toHaveBeenCalledTimes(4)
})

it('is null for a read that failed or threw, even at once, and the next ask is a new read', async () => {
  mockGetProfile.mockResolvedValueOnce({ success: false, error: 'x' })
  expect(await profileExtras('u1')).toBeNull()
  mockGetProfile.mockImplementationOnce(() => {
    throw new Error('sync')
  })
  expect(await profileExtras('u1')).toBeNull()
  mockGetProfile.mockResolvedValueOnce({ success: true, data: { profile: { badges: [] } } })
  expect(await profileExtras('u1')).toEqual({ badges: [], friend: undefined })
})

describe('badgesOnUserRead', () => {
  it('reads the badges when the answer has them', () => {
    expect(badgesOnUserRead({ badges: NIGHTS })?.map((b) => b.kind)).toEqual(['nights_out'])
  })
  it('a missing `badges` is "off" only beside `friend`: the server that sends one sends the other', () => {
    expect(badgesOnUserRead({ friend: { state: 'none' } })).toEqual([])
    expect(badgesOnUserRead({})).toBeNull()
  })
})

import { act, renderHook } from '@testing-library/react-native'

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
)
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }))
jest.mock('../lib/logger', () => ({ Logger: { debug: jest.fn(), warn: jest.fn(), error: jest.fn(), info: jest.fn() } }))
jest.mock('../lib/apiClient', () => ({ apiClient: { goLive: jest.fn() } }))
jest.mock('../lib/checkIn', () => ({ checkInChanged: jest.fn() }))
jest.mock('../lib/locationFix', () => ({ getCurrentLocation: jest.fn() }))
jest.mock('../lib/openInMaps', () => ({ openInMaps: jest.fn(() => Promise.resolve()) }))
jest.mock('../lib/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))

/* eslint-disable import/first */
import { router } from 'expo-router'
import { apiClient } from '../lib/apiClient'
import { checkInChanged } from '../lib/checkIn'
import { readLiveSession } from '../lib/goLive'
import { getCurrentLocation } from '../lib/locationFix'
import { openInMaps } from '../lib/openInMaps'
import { useGoLive } from '../lib/useGoLive'
/* eslint-enable import/first */

const place = { id: 'v1', name: 'The Humming Tree', latitude: 12.97, longitude: 77.59, address: null }
const fix = { latitude: 12.9788, longitude: 77.6408, accuracy: 14 }
const live = { venueDayId: 'day-1', chatGroupId: 'g1', expiresAt: '2026-10-09T20:20:00.000Z', stay: false, stayUntil: null, checkIn: { id: 'c1', status: 'checked_in', checkInTime: 'x' }, revealSuggestion: false, intentNeeded: false }

async function run(choice: Parameters<ReturnType<typeof useGoLive>['goLive']>[0] = { minutes: 20 }) {
  const showTray = jest.fn()
  const closeTray = jest.fn()
  const onLive = jest.fn()
  const { result } = await renderHook(() => useGoLive({ place, showTray, closeTray, onLive }))
  let ok: boolean | undefined
  await act(async () => { ok = await result.current.goLive(choice) })
  return { ok, showTray, closeTray, onLive }
}

beforeEach(async () => {
  ;(getCurrentLocation as jest.Mock).mockResolvedValue(fix)
  await require('@react-native-async-storage/async-storage').clear()
})

describe('useGoLive', () => {
  it('sends the fix with its accuracy under deviceInfo.gpsAccuracy — the key the server reads (vagueFixRefusal)', async () => {
    ;(apiClient.goLive as jest.Mock).mockResolvedValue({ success: true, data: live })
    await run({ minutes: 45 })
    expect(apiClient.goLive).toHaveBeenCalledWith('v1', {
      latitude: 12.9788,
      longitude: 77.6408,
      deviceInfo: { platform: expect.any(String), gpsAccuracy: 14 },
      minutes: 45,
    })
  })

  it('on success remembers the session (venue + window), tells the tab bar, and calls onLive', async () => {
    ;(apiClient.goLive as jest.Mock).mockResolvedValue({ success: true, data: live })
    const { ok, onLive } = await run({ minutes: 20 })
    expect(ok).toBe(true)
    expect(await readLiveSession('u1')).toEqual({ userId: 'u1', venueDayId: 'day-1', venueId: 'v1', venueName: 'The Humming Tree', prompted: false, choice: { minutes: 20 } })
    expect(checkInChanged).toHaveBeenCalledWith('day-1')
    expect(onLive).toHaveBeenCalledWith(live)
  })

  it('OUT_OF_RANGE offers Open Maps at the place; AGE_RESTRICTED offers adding your age (L3)', async () => {
    ;(apiClient.goLive as jest.Mock).mockResolvedValue({ success: false, errorCode: 'OUT_OF_RANGE', error: "You're not at The Humming Tree yet." })
    const far = await run()
    const buttons = far.showTray.mock.calls[0][2] as { label: string; onPress: () => void }[]
    expect(buttons.map((b) => b.label)).toEqual(['Done', 'Open Maps'])
    buttons[1].onPress()
    expect(openInMaps).toHaveBeenCalledWith(expect.objectContaining({ latitude: 12.97, longitude: 77.59 }))
    expect(checkInChanged).not.toHaveBeenCalled()

    ;(apiClient.goLive as jest.Mock).mockResolvedValue({ success: false, errorCode: 'AGE_RESTRICTED', error: 'Adults only.' })
    const young = await run()
    const ageButtons = young.showTray.mock.calls[0][2] as { label: string; onPress: () => void }[]
    expect(ageButtons.map((b) => b.label)).toEqual(['Done', 'Add your age'])
    ageButtons[1].onPress()
    expect(router.push).toHaveBeenCalledWith('/edit-profile')
  })

  it('EVENT_LIVE_HERE read off the RESULT (eventId beside errorCode) opens the hand-off, remembers nothing', async () => {
    ;(apiClient.goLive as jest.Mock).mockResolvedValue({ success: false, errorCode: 'EVENT_LIVE_HERE', eventId: 'e1', error: 'Friday session is on here. Check in to it instead.' })
    const { showTray, ok } = await run()
    expect(ok).toBe(false)
    expect(showTray.mock.calls[0][0]).toBe('Check in to the event instead')
    expect(await readLiveSession('u1')).toBeNull()
  })

  it('a refusal with no code (timeout, offline) is not read as "not live": the screen is told to re-read', async () => {
    // The POST may have landed. Expected behaviour after the fix: checkInChanged() re-reads the place and the root monitor.
    ;(apiClient.goLive as jest.Mock).mockResolvedValue({ success: false, error: 'Request timed out' })
    await run()
    expect(checkInChanged).toHaveBeenCalled()
  })

  it('a code-less failure offers Try Again, which runs the whole Go Live again with the same window (M2, H4)', async () => {
    ;(apiClient.goLive as jest.Mock).mockResolvedValueOnce({ success: false, error: 'Request timed out' }).mockResolvedValueOnce({ success: true, data: live })
    const { showTray } = await run({ minutes: 45 })
    const retry = (showTray.mock.calls[0][2] as { label: string; onPress: () => void }[]).find((b) => b.label === 'Try Again')
    await act(async () => {
      retry!.onPress()
      await new Promise((r) => setTimeout(r, 0))
    })
    expect(apiClient.goLive).toHaveBeenCalledTimes(2)
    expect((apiClient.goLive as jest.Mock).mock.calls[1][1]).toMatchObject({ minutes: 45 })
  })

  it('NO_CHECK_IN_AREA offers no directions; GPS_TOO_VAGUE offers a retry, not directions (#641)', async () => {
    ;(apiClient.goLive as jest.Mock).mockResolvedValue({ success: false, errorCode: 'NO_CHECK_IN_AREA', error: 'No area.' })
    expect((await run()).showTray.mock.calls[0][2]).toBeUndefined()
    ;(apiClient.goLive as jest.Mock).mockResolvedValue({ success: false, errorCode: 'GPS_TOO_VAGUE', error: 'Too weak.' })
    const vague = await run()
    expect((vague.showTray.mock.calls[0][2] as { label: string }[]).map((b) => b.label)).toEqual(['Cancel', 'Try Again'])
  })

  it('asks the location helper for fixes up to the server ceiling, with a retry that re-runs Go Live (H4)', async () => {
    ;(apiClient.goLive as jest.Mock).mockResolvedValue({ success: true, data: live })
    await run()
    expect(getCurrentLocation).toHaveBeenCalledWith(expect.objectContaining({ maxAccuracyM: 150, onRetry: expect.any(Function) }))
  })

  it('ignores a second tap while one Go Live is in flight', async () => {
    let release: (v: unknown) => void = () => {}
    ;(apiClient.goLive as jest.Mock).mockReturnValue(new Promise((r) => { release = r }))
    const showTray = jest.fn()
    const { result } = await renderHook(() => useGoLive({ place, showTray, closeTray: jest.fn() }))
    await act(async () => {
      void result.current.goLive({ minutes: 20 })
      await Promise.resolve()
    })
    await act(async () => { await result.current.goLive({ minutes: 20 }) })
    expect(apiClient.goLive).toHaveBeenCalledTimes(1)
    await act(async () => { release({ success: true, data: live }) })
  })
})

describe('"stay" refused as Blendn+\'s (PLUS_REQUIRED) — the paywall, through its policy (step 11, MN-M01)', () => {
  beforeEach(() => {
    require('../lib/paywall').resetPaywallSession()
    ;(apiClient.goLive as jest.Mock).mockResolvedValue({ success: false, errorCode: 'PLUS_REQUIRED', error: 'Staying live is part of Blendn+.' })
  })

  it('the first time this session: the tray closes and the paywall opens, trigger go_live_expiry', async () => {
    const { ok, closeTray, showTray } = await run({ stay: true })
    expect(ok).toBe(false)
    expect(apiClient.goLive).toHaveBeenCalledWith('v1', expect.objectContaining({ stay: true }))
    expect(closeTray).toHaveBeenCalled()
    expect(router.push).toHaveBeenCalledWith({ pathname: '/plus', params: { trigger: 'go_live_expiry' } })
    expect(showTray).not.toHaveBeenCalled()
  })

  it('on iOS, pushes the paywall only once the tray has finished leaving (review MEDIUM)', async () => {
    const tray = require('../components/ActionTray')
    let left: () => void = () => {}
    const waited = jest.spyOn(tray, 'afterTrayDismissed').mockReturnValue(new Promise<void>((r) => { left = r }))
    try {
      const { result } = await renderHook(() => useGoLive({ place, showTray: jest.fn(), closeTray: jest.fn() }))
      let pending!: Promise<boolean>
      await act(async () => {
        pending = result.current.goLive({ stay: true })
        await new Promise((r) => setTimeout(r, 0))
      })
      expect(router.push).not.toHaveBeenCalled()
      await act(async () => {
        left()
        await pending
      })
      expect(router.push).toHaveBeenCalledWith({ pathname: '/plus', params: { trigger: 'go_live_expiry' } })
    } finally {
      waited.mockRestore()
    }
  })

  it('never a second automatic paywall that session: the reason instead, and "See Blendn+" opens it on a tap', async () => {
    await run({ stay: true })
    ;(router.push as jest.Mock).mockClear()

    const again = await run({ stay: true })
    expect(router.push).not.toHaveBeenCalled()
    const [title, , buttons] = again.showTray.mock.calls[0]
    expect(title).toBe('Staying live is part of Blendn+')
    const see = (buttons as { label: string; onPress: () => void }[]).find((b) => b.label === 'See Blendn+')
    await act(async () => { see?.onPress(); await Promise.resolve() })
    expect(router.push).toHaveBeenCalledWith({ pathname: '/plus', params: { trigger: 'go_live_expiry' } })
  })
})

/**
 * The Room's Crews view against a mocked API (step 9 review of #369: M7, M9, M11).
 *
 * "Open to joining a crew tonight" is read once per check-in and survives a
 * failed read with a retry; the latest tap wins; a page from before a reload
 * never lands on top of it; a failed page says so and offers the retry.
 */
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react-native'

jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  useFocusEffect: (effect: () => void) => {
    const { useEffect } = require('react')
    useEffect(effect, [effect])
  },
}))
jest.mock('../lib/crewsApi', () => ({
  crewsApi: { crewsAt: jest.fn(), myCrews: jest.fn(), openToCrews: jest.fn(), here: jest.fn(), likeCrew: jest.fn(), report: jest.fn() },
}))
const mockCheckInListeners = new Set<() => void>()
jest.mock('../lib/checkIn', () => ({
  subscribeCheckInChanged: (fn: () => void) => {
    mockCheckInListeners.add(fn)
    return () => mockCheckInListeners.delete(fn)
  },
}))
jest.mock('../lib/sheet', () => ({ showSheet: jest.fn() }))
jest.mock('../components/Toast', () => ({ useToast: () => ({ showToast: jest.fn() }) }))
jest.mock('../lib/logger', () => ({ Logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() } }))

import { CrewsFooter, CrewsHeader, useCrewActions, useCrewsHere } from '../components/crews/CrewsView'
import { OPEN_TO_CREWS_LABEL, type CrewCard, type CrewsAtEvent } from '../lib/crews'
import { crewsApi } from '../lib/crewsApi'

const api = crewsApi as jest.Mocked<typeof crewsApi>

const card = (crewId: string): CrewCard => ({
  crewId,
  name: crewId,
  bio: null,
  emblemSeed: crewId,
  size: 3,
  presentCount: 2,
  tags: [],
  intent: [],
  youLiked: false,
})
const page = (crews: CrewCard[], hasMore: boolean): { success: true; data: CrewsAtEvent } => ({
  success: true,
  data: { crewsEnabled: true, crews, myCrews: [], total: 99, hasMore },
})

beforeEach(() => {
  api.myCrews.mockResolvedValue({ success: true, data: { crews: [], invites: [] } })
})

function Harness({ checkInKey }: { checkInKey: string }) {
  const crews = useCrewsHere('e1')
  const actions = useCrewActions('e1', crews)
  return (
    <>
      <CrewsHeader eventId="e1" checkInKey={checkInKey} crews={crews} actions={actions} />
      <CrewsFooter crews={crews} />
    </>
  )
}

describe('"Open to joining a crew tonight" (M7, M11)', () => {
  it('is read once per check-in, not on every visit', async () => {
    api.crewsAt.mockResolvedValue(page([], false))
    api.openToCrews.mockResolvedValue({ success: true, data: { openToCrews: true } })
    const first = await render(<Harness checkInKey="ci-1" />)
    await waitFor(() => expect(screen.getByRole('switch', { name: OPEN_TO_CREWS_LABEL }).props.accessibilityState.checked).toBe(true))
    await first.unmount()
    await render(<Harness checkInKey="ci-1" />)
    await waitFor(() => screen.getByRole('switch', { name: OPEN_TO_CREWS_LABEL }))
    expect(api.openToCrews).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('switch', { name: OPEN_TO_CREWS_LABEL }).props.accessibilityState.checked).toBe(true)
  })

  it('a failed read keeps the switch on screen, with a retry', async () => {
    api.crewsAt.mockResolvedValue(page([], false))
    api.openToCrews.mockResolvedValueOnce({ success: false, error: 'Too many requests', errorCode: 'RATE_LIMITED' })
    await render(<Harness checkInKey="ci-2" />)
    await waitFor(() => screen.getByText(/Couldn’t check whether this is on/))
    expect(screen.getByRole('switch', { name: OPEN_TO_CREWS_LABEL })).toBeTruthy()
    api.openToCrews.mockResolvedValueOnce({ success: true, data: { openToCrews: true } })
    await fireEvent.press(screen.getByText(/Couldn’t check whether this is on/))
    await waitFor(() => expect(screen.getByRole('switch', { name: OPEN_TO_CREWS_LABEL }).props.accessibilityState.checked).toBe(true))
  })

  it('holds still while a write is in flight, then shows what the server answered', async () => {
    api.crewsAt.mockResolvedValue(page([], false))
    api.openToCrews.mockResolvedValueOnce({ success: true, data: { openToCrews: false } })
    await render(<Harness checkInKey="ci-3" />)
    const toggle = () => screen.getByRole('switch', { name: OPEN_TO_CREWS_LABEL })
    await waitFor(() => expect(toggle().props.accessibilityState.disabled).toBe(false))

    let answer: (v: unknown) => void = () => {}
    api.openToCrews.mockReturnValueOnce(new Promise((r) => (answer = r)) as never)
    await fireEvent.press(toggle())
    expect(toggle().props.accessibilityState.disabled).toBe(true)
    // A second tap while in flight writes nothing.
    await fireEvent.press(toggle())
    expect(api.openToCrews).toHaveBeenCalledTimes(2)
    await act(async () => answer({ success: true, data: { openToCrews: true } }))
    expect(toggle().props.accessibilityState).toEqual({ checked: true, disabled: false })
  })
})

describe('the crews here, a page at a time (M9)', () => {
  it('re-reads when a check-in changes', async () => {
    api.crewsAt.mockResolvedValue(page([card('a')], false))
    await renderHook(() => useCrewsHere('e1'))
    await waitFor(() => expect(api.crewsAt).toHaveBeenCalledTimes(1))
    expect(mockCheckInListeners.size).toBe(1)
    await act(async () => mockCheckInListeners.forEach((fn) => fn()))
    await waitFor(() => expect(api.crewsAt).toHaveBeenCalledTimes(2))
  })

  it('a new event starts over: nothing of the last one shows', async () => {
    let second: (v: unknown) => void = () => {}
    api.crewsAt.mockResolvedValueOnce(page([card('old-event')], false)).mockReturnValueOnce(new Promise((r) => (second = r)) as never)
    const { result, rerender } = await renderHook(({ id }: { id: string }) => useCrewsHere(id), { initialProps: { id: 'e1' } })
    await waitFor(() => expect(result.current.state.status).toBe('ready'))
    await rerender({ id: 'e2' })
    expect(result.current.state.status).toBe('loading')
    await act(async () => second(page([card('new-event')], false)))
  })

  it('M8: two likes of a card at once send one', async () => {
    api.crewsAt.mockResolvedValue(page([card('a')], false))
    let finish: (v: unknown) => void = () => {}
    api.likeCrew.mockReturnValue(new Promise((r) => (finish = r)) as never)
    const { result } = await renderHook(() => {
      const crews = useCrewsHere('e1')
      return useCrewActions('e1', crews)
    })
    await act(async () => {
      void result.current.like(card('a'))
      void result.current.like(card('a'))
    })
    expect(api.likeCrew).toHaveBeenCalledTimes(1)
    await act(async () => finish({ success: true, data: { liked: true, blend: null } }))
  })

  it('a failed page says so and offers the retry', async () => {
    api.openToCrews.mockResolvedValue({ success: true, data: { openToCrews: false } })
    api.crewsAt.mockResolvedValueOnce(page([card('a')], true)).mockResolvedValueOnce({ success: false, error: 'x' })
    await render(<Harness checkInKey="ci-4" />)
    await waitFor(() => screen.getByLabelText('More crews'))
    await fireEvent.press(screen.getByLabelText('More crews'))
    await waitFor(() => screen.getByText('More crews didn’t load.'))
    expect(screen.getByLabelText('Try again')).toBeTruthy()
  })

  it('a page from before a reload never lands on top of it', async () => {
    let lateAnswer: (v: unknown) => void = () => {}
    api.crewsAt
      .mockResolvedValueOnce(page([card('a')], true))
      .mockReturnValueOnce(new Promise((r) => (lateAnswer = r)) as never)
      .mockResolvedValueOnce(page([card('fresh')], false))
    const { result } = await renderHook(() => useCrewsHere('e1'))
    await waitFor(() => expect(result.current.state.status).toBe('ready'))
    let more: Promise<void> = Promise.resolve()
    await act(async () => {
      more = result.current.loadMore()
    })
    await act(async () => {
      await result.current.reload()
    })
    await act(async () => {
      lateAnswer(page([card('stale')], false))
      await more
    })
    const s = result.current.state
    expect(s.status === 'ready' ? s.data.crews.map((c) => c.crewId) : []).toEqual(['fresh'])
  })
})

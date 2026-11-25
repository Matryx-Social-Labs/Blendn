/**
 * Task 17 b1 (SCRUM-1105): the crew's sheet on a card tap (board crews/05-room A, advisor S-A 2026-11-25), Hide this crew
 * tonight (this session only), Block this crew (a confirm, then `POST /crews/:id/hide`, the card goes), and the lit Wave back
 * cards.
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
  crewsApi: { crewsAt: jest.fn(), myCrews: jest.fn(), openToCrews: jest.fn(), waveCrew: jest.fn(), report: jest.fn(), hideCrew: jest.fn() },
}))
jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default)
jest.mock('../lib/checkIn', () => ({ subscribeCheckInChanged: () => () => {} }))
jest.mock('../lib/sheet', () => ({ showSheet: jest.fn() }))
jest.mock('../components/Toast', () => ({ useToast: () => ({ showToast: jest.fn() }) }))
jest.mock('../lib/logger', () => ({ Logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() } }))

import { RoomCrewCard } from '../components/blendn/RoomCrews'
import { CrewSheet } from '../components/crews/CrewSheet'
import { crewCards, useCrewActions, useCrewsHere } from '../components/crews/CrewsView'
import type { CrewCard, CrewsAtEvent } from '../lib/crews'
import { crewsApi } from '../lib/crewsApi'
import { showSheet, type ActionSheet } from '../lib/sheet'

const api = crewsApi as jest.Mocked<typeof crewsApi>
const sheet = showSheet as jest.Mock

const card = (crewId: string, extra: Partial<CrewCard> = {}): CrewCard => ({
  crewId,
  name: crewId,
  bio: null,
  emblemSeed: crewId,
  size: 5,
  presentCount: 3,
  tags: [],
  intent: [],
  youLiked: false,
  ...extra,
})
const page = (crews: CrewCard[]): { success: true; data: CrewsAtEvent } => ({
  success: true,
  data: { crewsEnabled: true, crews, myCrews: [], total: crews.length, hasMore: false },
})
const ids = (crews: ReturnType<typeof useCrewsHere>) => crewCards(crews).map((c) => c.crewId)

beforeEach(() => {
  jest.clearAllMocks()
  api.myCrews.mockResolvedValue({ success: true, data: { crews: [], invites: [] } })
})

describe('the crew’s sheet (S-A)', () => {
  const orbit = card('orbit', {
    name: 'Orbit',
    bio: 'Here till the last track.',
    tags: [{ slug: 'techno-heads', label: 'Techno heads' }] as never,
    overlaps: [{ text: 'Both crews are into techno' }] as never,
    badges: [{ kind: 'nights_together', label: 'Out together often' }],
  })
  const handlers = () => ({ onClose: jest.fn(), onWave: jest.fn(), onHideTonight: jest.fn(), onBlock: jest.fn(), onReport: jest.fn() })

  it('draws the crew as strangers see it: name, counts and badge, tags, About them, Wave for your crew', async () => {
    await render(<CrewSheet visible card={orbit} wave={{ state: 'idle', as: 'Nebula' }} {...handlers()} />)
    expect(screen.getByText('Orbit')).toBeTruthy()
    expect(screen.getByText('Crew of 5 · 3 here now · Out together often')).toBeTruthy()
    expect(screen.getByText('#Technoheads')).toBeTruthy()
    expect(screen.getByText('About them')).toBeTruthy()
    expect(screen.getByText('“Here till the last track.”')).toBeTruthy()
    expect(screen.getByText('Both crews are into techno')).toBeTruthy()
    expect(screen.getByText('Wave for Nebula')).toBeTruthy()
  })

  it('no bio and no overlap: no About them block', async () => {
    await render(<CrewSheet visible card={card('bare')} wave={{ state: 'idle' }} {...handlers()} />)
    expect(screen.queryByText('About them')).toBeNull()
  })

  it('its three rows, in order, each to its own handler; Wave is a separate target', async () => {
    const h = handlers()
    await render(<CrewSheet visible card={orbit} wave={{ state: 'idle', as: 'Nebula' }} {...h} />)
    const rows = ['Hide this crew tonight', 'Block this crew', 'Report this crew']
    rows.forEach((label) => expect(screen.getByLabelText(label)).toBeTruthy())
    await fireEvent.press(screen.getByLabelText('Hide this crew tonight'))
    await fireEvent.press(screen.getByLabelText('Block this crew'))
    await fireEvent.press(screen.getByLabelText('Report this crew'))
    await fireEvent.press(screen.getByText('Wave for Nebula'))
    expect(h.onHideTonight).toHaveBeenCalledTimes(1)
    expect(h.onBlock).toHaveBeenCalledTimes(1)
    expect(h.onReport).toHaveBeenCalledTimes(1)
    expect(h.onWave).toHaveBeenCalledTimes(1)
  })

  it('waved already: the settled plate, not a button', async () => {
    await render(<CrewSheet visible card={orbit} wave={{ state: 'waved', as: 'Nebula' }} {...handlers()} />)
    expect(screen.getByLabelText('Waved')).toBeTruthy()
    expect(screen.queryByText('Wave for Nebula')).toBeNull()
  })
})

describe('closing', () => {
  const handlers = () => ({ onClose: jest.fn(), onWave: jest.fn(), onHideTonight: jest.fn(), onBlock: jest.fn(), onReport: jest.fn() })
  it('keeps the crew drawn while the sheet leaves, even when its card has gone (blocked, hidden, left)', async () => {
    const h = handlers()
    const { rerender } = await render(<CrewSheet visible card={card('orbit', { name: 'Orbit' })} wave={{ state: 'idle' }} {...h} />)
    await rerender(<CrewSheet visible={false} card={null} wave={{ state: 'idle' }} {...h} />)
    expect(screen.getByText('Orbit')).toBeTruthy()
  })
  it('never opened: nothing is drawn', async () => {
    await render(<CrewSheet visible={false} card={null} wave={{ state: 'idle' }} {...handlers()} />)
    expect(screen.queryByTestId('crew-sheet')).toBeNull()
  })
})

describe('Hide this crew tonight (session only)', () => {
  it('the count leaves hidden crews out on every page, not only the one they were on', async () => {
    api.crewsAt.mockResolvedValueOnce({ success: true, data: { ...page([card('a'), card('b')]).data, total: 4, hasMore: true } })
    api.crewsAt.mockResolvedValueOnce({ success: true, data: { ...page([card('c'), card('d')]).data, total: 4, hasMore: false } })
    const { result } = await renderHook(() => useCrewsHere('e-count'))
    await waitFor(() => expect(ids(result.current)).toEqual(['a', 'b']))
    const total = () => (result.current.state.status === 'ready' ? result.current.state.data.total : null)
    await act(async () => result.current.hideTonight('a'))
    expect(total()).toBe(3)
    await act(async () => result.current.loadMore())
    expect(ids(result.current)).toEqual(['b', 'c', 'd'])
    expect(total()).toBe(3)
  })

  it('drops the card, and a re-read in this session keeps it gone', async () => {
    api.crewsAt.mockResolvedValue(page([card('a'), card('b')]))
    const { result } = await renderHook(() => useCrewsHere('e-hide'))
    await waitFor(() => expect(ids(result.current)).toEqual(['a', 'b']))
    await act(async () => result.current.hideTonight('a'))
    expect(ids(result.current)).toEqual(['b'])
    await act(async () => {
      await result.current.reload()
    })
    expect(ids(result.current)).toEqual(['b'])
  })

  it('only in this room: another event still shows it', async () => {
    api.crewsAt.mockResolvedValue(page([card('a')]))
    const { result } = await renderHook(() => useCrewsHere('e-other'))
    await waitFor(() => expect(ids(result.current)).toEqual(['a']))
  })
})

describe('Block this crew (B-A confirm)', () => {
  it('asks first, with the advisor’s words; confirming hides it on the server and the card goes', async () => {
    api.crewsAt.mockResolvedValue(page([card('orbit', { name: 'Orbit' }), card('b')]))
    api.hideCrew.mockResolvedValue({ success: true, data: { hidden: true } })
    const { result } = await renderHook(() => {
      const crews = useCrewsHere('e-block')
      return { crews, actions: useCrewActions('e-block', crews) }
    })
    await waitFor(() => expect(ids(result.current.crews)).toEqual(['orbit', 'b']))
    await act(async () => result.current.actions.block(card('orbit', { name: 'Orbit' })))
    const confirm = sheet.mock.calls[0][0] as ActionSheet
    expect(confirm.title).toBe('Block Orbit?')
    expect(confirm.message).toBe('You won’t see Orbit in any room again. Its members aren’t told. Unblock any time in Settings → Blocked.')
    expect(api.hideCrew).not.toHaveBeenCalled()
    const block = confirm.actions.find((a) => a.label === 'Block Orbit') as { run: () => Promise<{ ok: boolean }> }
    expect(confirm.actions.some((a) => 'cancel' in a)).toBe(true)
    let outcome: { ok: boolean } = { ok: false }
    await act(async () => {
      outcome = await block.run()
    })
    expect(api.hideCrew).toHaveBeenCalledWith('orbit')
    expect(outcome.ok).toBe(true)
    expect(ids(result.current.crews)).toEqual(['b'])
  })

  it('a refused block keeps the card and says so in the sheet', async () => {
    api.crewsAt.mockResolvedValue(page([card('orbit', { name: 'Orbit' })]))
    api.hideCrew.mockResolvedValue({ success: false, error: 'HTTP 500', errorCode: 'SERVER_ERROR' } as never)
    const { result } = await renderHook(() => {
      const crews = useCrewsHere('e-block2')
      return { crews, actions: useCrewActions('e-block2', crews) }
    })
    await waitFor(() => expect(ids(result.current.crews)).toEqual(['orbit']))
    await act(async () => result.current.actions.block(card('orbit', { name: 'Orbit' })))
    const confirm = sheet.mock.calls[0][0] as ActionSheet
    const block = confirm.actions.find((a) => a.label === 'Block Orbit') as { run: () => Promise<{ ok: boolean; error?: string }> }
    let outcome: { ok: boolean; error?: string } = { ok: true }
    await act(async () => {
      outcome = await block.run()
    })
    expect(outcome).toEqual({ ok: false, error: 'Couldn’t block Orbit. Try again.' })
    expect(ids(result.current.crews)).toEqual(['orbit'])
  })
})

describe('Wave back cards: lit by the flag, however many (advisor 2026-11-25, replaces the cap of three)', () => {
  const actions = { wave: jest.fn(), report: jest.fn() } as never
  const back = card('x', { name: 'Orbit', wavedAtYou: true })

  it('the 41st unanswered card is lit as the first is: the line always comes with Wave back', async () => {
    await render(<RoomCrewCard card={back} actions={actions} as="Nebula" index={40} onOpen={jest.fn()} />)
    expect(screen.getByText('Waved at Nebula')).toBeTruthy()
    expect(screen.getByText('Wave back')).toBeTruthy()
  })

  it('answered: the line goes and it reads Waved, in place', async () => {
    await render(<RoomCrewCard card={{ ...back, youLiked: true, youWaved: true }} actions={actions} as="Nebula" index={0} onOpen={jest.fn()} />)
    expect(screen.queryByText('Waved at Nebula')).toBeNull()
    expect(screen.getByLabelText('Waved')).toBeTruthy()
  })

  it('a tap on the card body opens its sheet', async () => {
    const onOpen = jest.fn()
    await render(<RoomCrewCard card={back} actions={actions} as="Nebula" index={0} onOpen={onOpen} />)
    await fireEvent.press(screen.getByLabelText(/^Orbit, crew of 5/))
    expect(onOpen).toHaveBeenCalledTimes(1)
  })
})

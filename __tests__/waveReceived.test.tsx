/**
 * Wave PR (b), the received-wave surfaces (SCRUM-1042, board 03-receive):
 * - L-A, the toast with Wave back inline; L-B, waves inside 30 s fold into one toast;
 * - S-A, the "waved at you" strip under your room name: one answers in place, several are three faces and See all;
 * - See all, paged 20 from the server; Block from a row takes it off the list;
 * - B-A, one Banter row per room, whatever the room's size;
 * - Block and Report on the toast, the strip row and the Banter row.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import React from 'react'
import { AccessibilityInfo, StyleSheet } from 'react-native'

import { BanterWavesRow } from '../components/banter/BanterWavesRow'
import { WaveToast } from '../components/blendn/WaveToast'
import { WavedAtYouList } from '../components/blendn/WavedAtYouList'
import { WavedAtYouStrip } from '../components/blendn/WavedAtYouStrip'
import type { CrewWave, ReceivedWave, ReceivedWavesPage } from '../lib/apiClient'
import { COLOR } from '../lib/design/tokens'
import { H } from '../lib/haptics'
import { othersLine, toastTitle, waitingRows, waitingStrip, wavedAtYouLine, listRows, waveId, type AnyWave } from '../lib/receivedWaves'
import { FOLD_MS, ignoreCrewWaves, ignoreWavesFrom, listenForWaves, useRoomWaves, waveShown } from '../lib/roomWaves'
import { isLitControl } from './helpers/lit'

jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default)
const mockWaveListeners = new Set<(d: { eventId: string; fromUserId: string; fromName: string }) => void>()
const mockCrewWaveListeners = new Set<(d: { eventId: string; fromCrewId: string; fromName: string }) => void>()
jest.mock('../lib/socketClient', () => ({
  subscribeToRoomCrewWave: (fn: (d: { eventId: string; fromCrewId: string; fromName: string }) => void) => {
    mockCrewWaveListeners.add(fn)
    return () => mockCrewWaveListeners.delete(fn)
  },
  subscribeToRoomWave: (fn: (d: { eventId: string; fromUserId: string; fromName: string }) => void) => {
    mockWaveListeners.add(fn)
    return () => mockWaveListeners.delete(fn)
  },
}))
const mockGetReceivedWaves = jest.fn()
jest.mock('../lib/apiClient', () => ({
  ...jest.requireActual('../lib/apiClient'),
  apiClient: { getReceivedWaves: (...a: unknown[]) => mockGetReceivedWaves(...a) },
}))
const mockPush = jest.fn()
jest.mock('expo-router', () => ({ router: { push: (...a: unknown[]) => mockPush(...a) } }))

const send = (d: { eventId: string; fromUserId: string; fromName: string }) => act(async () => mockWaveListeners.forEach((fn) => fn(d)))

const seen: { store?: ReturnType<typeof useRoomWaves> } = {}
function Probe() {
  seen.store = useRoomWaves()
  return null
}

const NOW = Date.parse('2026-11-13T20:00:00Z')
const wave = (n: number, over: Partial<ReceivedWave> = {}): ReceivedWave => ({
  userId: `rh_${n}`,
  displayName: `Person ${n}`,
  wavedAt: new Date(NOW - n * 60_000).toISOString(),
  wavedBack: false,
  ...over,
})
const page = (waves: ReceivedWave[], over: Partial<ReceivedWavesPage> = {}): ReceivedWavesPage => ({ open: true, total: waves.length, waves, nextCursor: null, ...over })

beforeEach(() => {
  jest.spyOn(AccessibilityInfo, 'isReduceTransparencyEnabled').mockResolvedValue(false)
  jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {})
  jest.spyOn(H, 'arrive').mockImplementation(() => {})
  mockGetReceivedWaves.mockReset()
  mockPush.mockReset()
})
afterEach(() => {
  listenForWaves(null)
  jest.useRealTimers()
})

describe('L-B: waves inside 30 s fold into one toast', () => {
  it('the first wave toasts at once; the next ones inside the window wait, then come as one', async () => {
    jest.useFakeTimers({ now: NOW })
    await render(<Probe />)
    listenForWaves('e1')
    await send({ eventId: 'e1', fromUserId: 'a', fromName: 'Night Cat' })
    expect(seen.store!.toast?.waves.map((w) => w.fromName)).toEqual(['Night Cat'])
    await act(async () => waveShown(seen.store!.toast!))
    await act(async () => jest.advanceTimersByTime(5_000))
    await send({ eventId: 'e1', fromUserId: 'b', fromName: 'Brass Lemur' })
    await send({ eventId: 'e1', fromUserId: 'c', fromName: 'Cedar Eagle' })
    // Held: no second toast inside the window.
    expect(seen.store!.toast).toBeNull()
    await act(async () => jest.advanceTimersByTime(FOLD_MS - 5_001))
    expect(seen.store!.toast).toBeNull()
    await act(async () => jest.advanceTimersByTime(1))
    expect(seen.store!.toast?.waves.map((w) => w.fromName)).toEqual(['Cedar Eagle', 'Brass Lemur'])
    // Every wave still lights its card at once.
    expect(Object.keys(seen.store!.received).sort()).toEqual(['a', 'b', 'c'])
  })

  it('control: a wave after a quiet 30 s toasts at once', async () => {
    jest.useFakeTimers({ now: NOW })
    await render(<Probe />)
    listenForWaves('e1')
    await send({ eventId: 'e1', fromUserId: 'a', fromName: 'Night Cat' })
    await act(async () => waveShown(seen.store!.toast!))
    await act(async () => jest.advanceTimersByTime(FOLD_MS))
    await send({ eventId: 'e1', fromUserId: 'b', fromName: 'Brass Lemur' })
    expect(seen.store!.toast?.waves.map((w) => w.fromName)).toEqual(['Brass Lemur'])
  })

  it('a toast still up holds the next fold until it has been shown', async () => {
    jest.useFakeTimers({ now: NOW })
    await render(<Probe />)
    listenForWaves('e1')
    await send({ eventId: 'e1', fromUserId: 'a', fromName: 'Night Cat' })
    await send({ eventId: 'e1', fromUserId: 'b', fromName: 'Brass Lemur' })
    await act(async () => jest.advanceTimersByTime(FOLD_MS))
    expect(seen.store!.toast?.waves.map((w) => w.fromName)).toEqual(['Night Cat'])
    await act(async () => waveShown(seen.store!.toast!))
    await act(async () => jest.advanceTimersByTime(0))
    expect(seen.store!.toast?.waves.map((w) => w.fromName)).toEqual(['Brass Lemur'])
  })

  it('a blocked person leaves the held fold too', async () => {
    jest.useFakeTimers({ now: NOW })
    await render(<Probe />)
    listenForWaves('e1')
    await send({ eventId: 'e1', fromUserId: 'a', fromName: 'Night Cat' })
    await act(async () => waveShown(seen.store!.toast!))
    await send({ eventId: 'e1', fromUserId: 'b', fromName: 'Brass Lemur' })
    await act(async () => ignoreWavesFrom('b'))
    await act(async () => jest.advanceTimersByTime(FOLD_MS))
    expect(seen.store!.toast).toBeNull()
  })

  it('a block or report anywhere (the strip, the list, the toast) takes them out of this room, recorded for the deck', async () => {
    await render(<Probe />)
    listenForWaves('e1')
    expect(seen.store!.blocked).toEqual({})
    await act(async () => ignoreWavesFrom('rh_l'))
    expect(seen.store!.blocked).toEqual({ rh_l: true })
    // A new room starts clean.
    await act(async () => listenForWaves('e2'))
    expect(seen.store!.blocked).toEqual({})
  })

  it('the toast says one name, or how many', () => {
    const w = (n: string) => ({ eventId: 'e1', fromUserId: n, fromName: n, at: NOW })
    expect(toastTitle({ waves: [w('Night Cat')] })).toBe('Night Cat waved at you')
    expect(toastTitle({ waves: [w('a'), w('b'), w('c')] })).toBe('3 people waved at you')
  })
})

describe('S-A: the strip', () => {
  it('nothing waiting: no strip (an answered wave is not one to answer)', () => {
    expect(waitingStrip(null)).toEqual({ kind: 'none' })
    expect(waitingStrip(page([wave(1, { wavedBack: true })]))).toEqual({ kind: 'none' })
    expect(waitingStrip(page([]))).toEqual({ kind: 'none' })
  })

  it('one waiting answers in place', () => {
    const s = waitingStrip(page([wave(1), wave(2, { wavedBack: true })]))
    expect(s).toEqual({ kind: 'one', wave: wave(1) })
  })

  it('several: the newest three faces and the rest counted from the server, so a 12k room still caps at three', () => {
    const waves = Array.from({ length: 20 }, (_, i) => wave(i + 1))
    const s = waitingStrip(page(waves, { total: 12_480, nextCursor: 'c1' }))
    expect(s.kind).toBe('several')
    if (s.kind !== 'several') return
    expect(s.faces.map(waveId)).toEqual(['rh_1', 'rh_2', 'rh_3'])
    expect(s.others).toBe(12_479)
    expect(othersLine(s.others)).toBe('and 12k others waved at you')
    expect(othersLine(1)).toBe('and 1 other waved at you')
  })

  it('"Waved at you · 4 min" from the list’s time', () => {
    expect(wavedAtYouLine(new Date(NOW - 4 * 60_000).toISOString(), NOW)).toBe('Waved at you · 4 min')
    expect(wavedAtYouLine(undefined, NOW)).toBe('Waved at you')
  })

  it('one: Wave back answers in place; holding the row offers Block and Report', async () => {
    const onWaveBack = jest.fn()
    const onSafety = jest.fn()
    await render(<WavedAtYouStrip page={page([wave(4)])} now={NOW} onWaveBack={onWaveBack} onSeeAll={jest.fn()} onSafety={onSafety} />)
    expect(screen.getByText('Person 4')).toBeTruthy()
    expect(screen.getByText('Waved at you · 4 min')).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: 'Wave back at Person 4' }))
    expect(onWaveBack).toHaveBeenCalledWith(wave(4))
    await fireEvent(screen.getByTestId('waved-strip'), 'longPress')
    expect(onSafety).toHaveBeenCalledWith(wave(4))
  })

  it('several: three faces, "and N others", See all', async () => {
    const onSeeAll = jest.fn()
    await render(<WavedAtYouStrip page={page([wave(1), wave(2), wave(3), wave(4)])} now={NOW} onWaveBack={jest.fn()} onSeeAll={onSeeAll} onSafety={jest.fn()} />)
    // Drawn, and read once as the row's label.
    expect(screen.getByText('Person 1', { includeHiddenElements: true })).toBeTruthy()
    expect(screen.getByText('and 3 others waved at you', { includeHiddenElements: true })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^Wave back/ })).toBeNull()
    await fireEvent.press(screen.getByRole('button', { name: 'Person 1 and 3 others waved at you. See all' }))
    expect(onSeeAll).toHaveBeenCalled()
  })

  it('control: nothing waiting draws nothing', async () => {
    await render(<WavedAtYouStrip page={page([wave(1, { wavedBack: true })])} now={NOW} onWaveBack={jest.fn()} onSeeAll={jest.fn()} onSafety={jest.fn()} />)
    expect(screen.queryByTestId('waved-strip')).toBeNull()
  })
})

describe('L-A: the toast', () => {
  const one = { waves: [{ eventId: 'e1', fromUserId: 'rh_a', fromName: 'Harbour Heron', at: NOW }] }
  it('one wave: Wave back inline, the body opens their card, holding it offers Block and Report', async () => {
    jest.useFakeTimers({ now: NOW })
    const onWaveBack = jest.fn()
    const onOpen = jest.fn()
    const onSafety = jest.fn()
    await render(<WaveToast toast={one} onOpen={onOpen} onWaveBack={onWaveBack} onSeeAll={jest.fn()} onSafety={onSafety} onDone={jest.fn()} />)
    expect(screen.getByText('Harbour Heron waved at you')).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: 'Wave back at Harbour Heron' }))
    expect(onWaveBack).toHaveBeenCalledWith(one.waves[0])
    expect(onOpen).not.toHaveBeenCalled()
    await fireEvent(screen.getByTestId('wave-toast-press'), 'longPress')
    expect(onSafety).toHaveBeenCalledWith(one.waves[0])
  })

  it('folded: how many, and See opens the list', async () => {
    jest.useFakeTimers({ now: NOW })
    const onSeeAll = jest.fn()
    const many = { waves: ['a', 'b', 'c'].map((n) => ({ eventId: 'e1', fromUserId: n, fromName: n, at: NOW })) }
    await render(<WaveToast toast={many} onOpen={jest.fn()} onWaveBack={jest.fn()} onSeeAll={onSeeAll} onSafety={jest.fn()} onDone={jest.fn()} />)
    expect(screen.getByText('3 people waved at you')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^Wave back/ })).toBeNull()
    await fireEvent.press(screen.getByRole('button', { name: 'See who waved' }))
    expect(onSeeAll).toHaveBeenCalled()
  })
})

describe('See all: paged 20 from the server', () => {
  it('the first page with the exact count, the next page as the end comes into view, Wave back per row', async () => {
    const first = Array.from({ length: 20 }, (_, i) => wave(i + 1))
    mockGetReceivedWaves.mockResolvedValueOnce({ success: true, data: page(first, { total: 21, nextCursor: 'c1' }) })
    mockGetReceivedWaves.mockResolvedValueOnce({ success: true, data: page([wave(21, { wavedBack: true })], { total: 21 }) })
    const onWaveBack = jest.fn().mockResolvedValue('done')
    await render(<WavedAtYouList eventId="e1" now={NOW} onWaveBack={onWaveBack} onSafety={jest.fn()} />)
    await waitFor(() => expect(screen.getByText('Person 1')).toBeTruthy())
    expect(screen.getByText('21')).toBeTruthy()
    expect(mockGetReceivedWaves).toHaveBeenCalledWith('e1', null)
    await act(async () => fireEvent(screen.getByTestId('waved-list'), 'onEndReached'))
    expect(mockGetReceivedWaves).toHaveBeenLastCalledWith('e1', 'c1')
    await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Wave back at Person 1' })))
    expect(onWaveBack).toHaveBeenCalledWith(wave(1))
    // Answered in place: the row is ✓ Waved.
    expect(screen.queryByRole('button', { name: 'Wave back at Person 1' })).toBeNull()
  })

  it('a row says "4 min ago" under the name, as board 03 draws it (the header says Waved at you), and is heard in full', async () => {
    mockGetReceivedWaves.mockResolvedValueOnce({ success: true, data: page([wave(4)]) })
    await render(<WavedAtYouList eventId="e1" now={NOW} onWaveBack={jest.fn()} onSafety={jest.fn()} />)
    await waitFor(() => expect(screen.getByText('Person 4', { includeHiddenElements: true })).toBeTruthy())
    expect(screen.getByText('4 min ago', { includeHiddenElements: true })).toBeTruthy()
    expect(screen.queryByText('Waved at you · 4 min', { includeHiddenElements: true })).toBeNull()
    expect(screen.getByLabelText('Person 4, Waved at you · 4 min')).toBeTruthy()
  })

  it('Block from a row takes it off the list; control: a cancelled sheet keeps it', async () => {
    mockGetReceivedWaves.mockResolvedValueOnce({ success: true, data: page([wave(1), wave(2)]) })
    let done: (() => void) | undefined
    const onSafety = jest.fn((_w: AnyWave, removed: () => void) => {
      done = removed
    })
    await render(<WavedAtYouList eventId="e1" now={NOW} onWaveBack={jest.fn()} onSafety={onSafety} />)
    await waitFor(() => expect(screen.getByText('Person 1')).toBeTruthy())
    await fireEvent(screen.getByTestId('waved-row-rh_1'), 'longPress')
    expect(onSafety).toHaveBeenCalledWith(wave(1), expect.any(Function))
    expect(screen.getByText('Person 1')).toBeTruthy()
    await act(async () => done?.())
    expect(screen.queryByText('Person 1')).toBeNull()
    expect(screen.getByText('Person 2')).toBeTruthy()
  })

  it('a closed room offers nothing to answer', async () => {
    mockGetReceivedWaves.mockResolvedValueOnce({ success: true, data: page([wave(1)], { open: false }) })
    await render(<WavedAtYouList eventId="e1" now={NOW} onWaveBack={jest.fn()} onSafety={jest.fn()} />)
    await waitFor(() => expect(screen.getByText('Person 1')).toBeTruthy())
    expect(screen.queryByRole('button', { name: /^Wave back/ })).toBeNull()
  })
})

describe('B-A: one Banter row per room', () => {
  it('"{n} waved at you" with the latest face; it opens the list; holding it offers Block and Report for that face', async () => {
    const onSafety = jest.fn()
    const [room] = waitingRows([{ eventId: 'e1', waiting: 12_480, latest: wave(1, { displayName: 'Harbour Heron' }) }], [])
    await render(<BanterWavesRow room={room} title="Toit" onSafety={onSafety} />)
    expect(screen.getAllByTestId(/^banter-waves-/)).toHaveLength(1)
    expect(screen.getByText('12k waved at you')).toBeTruthy()
    expect(screen.getByText('In the room · Toit')).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: '12480 waved at you. In the room · Toit' }))
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/waves/[eventId]', params: { eventId: 'e1', title: 'Toit' } })
    await fireEvent(screen.getByTestId('banter-waves-e1'), 'longPress')
    expect(onSafety).toHaveBeenCalledWith(room.people!.latest)
  })
})

describe('B-A: the pile (owner 2026-11-13: the board’s three faces)', () => {
  const face = (n: number) => ({ userId: `rh_${n}`, displayName: `Person ${n}` })
  it('draws the latest three faces, newest first, with no "+N"', async () => {
    const [room] = waitingRows([{ eventId: 'e1', waiting: 12_480, latest: wave(1), latestFaces: [face(1), face(2), face(3)] }], [])
    await render(<BanterWavesRow room={room} title="Toit" onSafety={jest.fn()} />)
    const pile = screen.getByTestId('banter-waves-e1-pile', { includeHiddenElements: true })
    expect(pile).toBeTruthy()
    for (const i of [0, 1, 2]) expect(screen.getByTestId(`banter-waves-e1-pile-face-${i}`, { includeHiddenElements: true })).toBeTruthy()
    expect(screen.queryByTestId('banter-waves-e1-pile-face-3', { includeHiddenElements: true })).toBeNull()
    expect(screen.queryByText(/^\+/, { includeHiddenElements: true })).toBeNull()
  })

  it('control: one face is the single latest face', async () => {
    await render(<BanterWavesRow room={waitingRows([{ eventId: 'e1', waiting: 1, latest: wave(1), latestFaces: [face(1)] }], [])[0]} title="Toit" onSafety={jest.fn()} />)
    expect(screen.queryByTestId('banter-waves-e1-pile', { includeHiddenElements: true })).toBeNull()
    expect(screen.getByTestId('banter-waves-e1-face', { includeHiddenElements: true })).toBeTruthy()
  })

  it('control: a server from before latestFaces draws the latest face', async () => {
    await render(<BanterWavesRow room={waitingRows([{ eventId: 'e1', waiting: 4, latest: wave(1) }], [])[0]} title="Toit" onSafety={jest.fn()} />)
    expect(screen.queryByTestId('banter-waves-e1-pile', { includeHiddenElements: true })).toBeNull()
    expect(screen.getByTestId('banter-waves-e1-face', { includeHiddenElements: true })).toBeTruthy()
  })
})

describe('Wave back is the DS positive (buttons board C: the hand-rolled WaveBackPill is deleted)', () => {
  it('the strip’s Wave back is the lit Button, 40 pt, white ink', async () => {
    await render(<WavedAtYouStrip page={page([wave(4)])} now={NOW} onWaveBack={jest.fn()} onSeeAll={jest.fn()} onSafety={jest.fn()} />)
    const pill = screen.getByTestId('waved-strip-wave')
    expect(isLitControl(pill)).toBe(true)
    expect(StyleSheet.flatten(pill.props.style).height).toBe(40)
    expect(StyleSheet.flatten(screen.getByText('Wave back').props.style).color).toBe(COLOR.textPrimary)
  })

  it('control: a row answered is ✓ Waved, the still neutral, disabled (no Wave again), never lit', async () => {
    mockGetReceivedWaves.mockResolvedValueOnce({ success: true, data: page([wave(21, { wavedBack: true })]) })
    await render(<WavedAtYouList eventId="e1" now={NOW} onWaveBack={jest.fn()} onSafety={jest.fn()} />)
    const waved = await screen.findByRole('button', { name: 'Waved at Person 21' })
    expect(isLitControl(waved)).toBe(false)
    expect(waved.props.accessibilityState).toMatchObject({ disabled: true })
  })
})

describe('long text (owner 2026-11-05: worst-case strings)', () => {
  const LONG = 'Thiruvananthapuram Wandering Peacock'
  it('the strip: a long name ellipsizes on one line, "and N others" is never cut', async () => {
    const waves = [wave(1, { displayName: LONG }), wave(2), wave(3)]
    await render(<WavedAtYouStrip page={page(waves, { total: 12_480 })} now={NOW} onWaveBack={jest.fn()} onSeeAll={jest.fn()} onSafety={jest.fn()} />)
    expect(screen.getByText(LONG, { includeHiddenElements: true }).props.numberOfLines).toBe(1)
    expect(screen.getByText('and 12k others waved at you', { includeHiddenElements: true }).props.numberOfLines).toBe(2)
  })

  it('one wave, a list row and the Banter row: the name is one line and the action stays', async () => {
    await render(<WavedAtYouStrip page={page([wave(1, { displayName: LONG })])} now={NOW} onWaveBack={jest.fn()} onSeeAll={jest.fn()} onSafety={jest.fn()} />)
    expect(screen.getByText(LONG).props.numberOfLines).toBe(1)
    expect(screen.getByRole('button', { name: `Wave back at ${LONG}` })).toBeTruthy()
    await screen.unmount()
    await render(<BanterWavesRow room={waitingRows([{ eventId: 'e1', waiting: 12_480, latest: wave(1, { displayName: LONG }) }], [])[0]} title="Bengaluru Design Festival 2026 · Bangalore Palace Grounds" onSafety={jest.fn()} />)
    expect(screen.getByText('In the room · Bengaluru Design Festival 2026 · Bangalore Palace Grounds').props.numberOfLines).toBe(1)
  })
})


describe('a crew’s wave at you (S5 b2, advisor T-A / U-A / W-A / X-A 2026-11-25)', () => {
  const crew = (n: number, over: Partial<CrewWave> = {}): CrewWave => ({ crewId: `c${n}`, name: `Crew ${n}`, emblemSeed: `seed-${n}`, wavedAt: new Date(NOW - n * 60_000).toISOString(), wavedBack: false, ...over })
  const sendCrew = (d: { eventId: string; fromCrewId: string; fromName: string }) => act(async () => mockCrewWaveListeners.forEach((fn) => fn(d)))

  it('the strip: unanswered crews first, counted with the people; an answered crew is not waiting', () => {
    const s = waitingStrip(page([wave(1), wave(2)], { crewWaves: [crew(5), crew(6, { wavedBack: true })], crewTotal: 2 }))
    expect(s.kind === 'several' && s.faces.map(waveId)).toEqual(['crew:c5', 'rh_1', 'rh_2'])
    expect(s.kind === 'several' && s.others).toBe(2)
    expect(waitingStrip(page([], { crewWaves: [crew(1)] }))).toEqual({ kind: 'one', wave: crew(1) })
    // Control: a server from before crews is the people alone.
    expect(waitingStrip(page([wave(1)]))).toEqual({ kind: 'one', wave: wave(1) })
  })

  it('the strip answers one crew in place, by its name, and holding it names the crew', async () => {
    const onWaveBack = jest.fn()
    const onSafety = jest.fn()
    await render(<WavedAtYouStrip page={page([], { crewWaves: [crew(4)] })} now={NOW} onWaveBack={onWaveBack} onSeeAll={jest.fn()} onSafety={onSafety} />)
    await fireEvent.press(screen.getByRole('button', { name: 'Wave back at Crew 4' }))
    expect(onWaveBack).toHaveBeenCalledWith(crew(4))
    await fireEvent(screen.getByTestId('waved-strip'), 'longPress')
    expect(onSafety).toHaveBeenCalledWith(crew(4))
  })

  it('the list: unanswered crews, the people, then the crews answered before, only past the last page', () => {
    const list = { waves: [wave(1), wave(2)], crewWaves: [crew(1, { wavedBack: true }), crew(2)], nextCursor: null }
    expect(listRows(list, new Set(['c1'])).map(waveId)).toEqual(['crew:c2', 'rh_1', 'rh_2', 'crew:c1'])
    expect(listRows({ ...list, nextCursor: 'more' }, new Set(['c1'])).map(waveId)).toEqual(['crew:c2', 'rh_1', 'rh_2'])
    // Answered just now (not before): the row stays where it was.
    expect(listRows(list, new Set()).map(waveId)).toEqual(['crew:c1', 'crew:c2', 'rh_1', 'rh_2'])
  })

  it('a crew’s row says "Crew · 4 min ago", counts in the header, and a wave back turns it ✓ Waved', async () => {
    mockGetReceivedWaves.mockResolvedValueOnce({ success: true, data: page([wave(1)], { crewWaves: [crew(4)], crewTotal: 1 }) })
    await render(<WavedAtYouList eventId="e1" now={NOW} onWaveBack={jest.fn().mockResolvedValue('done')} onSafety={jest.fn()} />)
    await screen.findByText('Crew · 4 min ago', { includeHiddenElements: true })
    expect(screen.getByLabelText('Waved at you, 2')).toBeTruthy()
    expect(screen.getByLabelText('Crew 4, a crew, Waved at you · 4 min')).toBeTruthy()
    await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Wave back at Crew 4' })))
    expect(screen.getByRole('button', { name: 'Waved at Crew 4' })).toBeTruthy()
  })

  it('the row’s pill is centred on its row, waved or not', async () => {
    mockGetReceivedWaves.mockResolvedValueOnce({ success: true, data: page([wave(21, { wavedBack: true })], { crewWaves: [crew(4)], crewTotal: 1 }) })
    await render(<WavedAtYouList eventId="e1" now={NOW} onWaveBack={jest.fn()} onSafety={jest.fn()} />)
    await screen.findByRole('button', { name: 'Wave back at Crew 4' })
    const aligned = (n: { parent: unknown; props: { style?: unknown } } | null): boolean => !!n && ((StyleSheet.flatten(n.props.style as never) as { alignSelf?: string } | undefined)?.alignSelf === 'center' || aligned(n.parent as never))
    for (const name of ['Wave back at Crew 4', 'Waved at Person 21']) expect(aligned(screen.getByRole('button', { name }) as never)).toBe(true)
  })

  it('a crew that left: the row stays, says so and offers nothing; control: a refusal keeps Wave back', async () => {
    mockGetReceivedWaves.mockResolvedValueOnce({ success: true, data: page([], { crewWaves: [crew(4), crew(5)], crewTotal: 2 }) })
    const answers = ['gone', 'none']
    await render(<WavedAtYouList eventId="e1" now={NOW} onWaveBack={jest.fn(async () => answers.shift() as 'gone' | 'none')} onSafety={jest.fn()} />)
    await screen.findByRole('button', { name: 'Wave back at Crew 4' })
    await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Wave back at Crew 4' })))
    expect(screen.getByText('They’ve left the room', { includeHiddenElements: true })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Wave back at Crew 4' })).toBeNull()
    await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Wave back at Crew 5' })))
    expect(screen.getByRole('button', { name: 'Wave back at Crew 5' })).toBeTruthy()
  })

  it('Banter: one row per room, people and crews counted together; a room only crews waved in has its own', () => {
    const rows = waitingRows([{ eventId: 'e1', waiting: 2, latest: wave(1) }], [{ eventId: 'e1', waiting: 1, latest: crew(1) }, { eventId: 'e2', waiting: 3, latest: crew(2) }])
    expect(rows.map((r) => [r.eventId, r.waiting, !!r.people, !!r.crews])).toEqual([['e1', 3, true, true], ['e2', 3, false, true]])
  })

  it('Banter: the newest crew’s emblem leads the pile, and holding the row is about the crew', async () => {
    const onSafety = jest.fn()
    const [both] = waitingRows([{ eventId: 'e1', waiting: 2, latest: wave(1), latestFaces: [{ userId: 'rh_1', displayName: 'Person 1' }, { userId: 'rh_2', displayName: 'Person 2' }] }], [{ eventId: 'e1', waiting: 1, latest: crew(1) }])
    await render(<BanterWavesRow room={both} title="Toit" onSafety={onSafety} />)
    expect(screen.getByText('3 waved at you')).toBeTruthy()
    expect(screen.getAllByTestId(/^banter-waves-e1-pile-face-\d$/, { includeHiddenElements: true })).toHaveLength(3)
    await fireEvent(screen.getByTestId('banter-waves-e1'), 'longPress')
    expect(onSafety).toHaveBeenCalledWith(crew(1))
  })

  it('live: a crew’s wave toasts and folds with people’s ("3 waved at you", never "people"), and lights nobody’s card', async () => {
    jest.useFakeTimers({ now: NOW })
    await render(<Probe />)
    listenForWaves('e1')
    await sendCrew({ eventId: 'e1', fromCrewId: 'c1', fromName: 'Orbit' })
    expect(toastTitle(seen.store!.toast!)).toBe('Orbit waved at you')
    expect(seen.store!.received).toEqual({})
    await act(async () => waveShown(seen.store!.toast!))
    await send({ eventId: 'e1', fromUserId: 'a', fromName: 'Night Cat' })
    await sendCrew({ eventId: 'e1', fromCrewId: 'c2', fromName: 'Nebula' })
    await act(async () => jest.advanceTimersByTime(FOLD_MS))
    expect(toastTitle(seen.store!.toast!)).toBe('2 waved at you')
    // Another room's is not heard.
    const before = seen.store!.version
    await sendCrew({ eventId: 'e2', fromCrewId: 'c3', fromName: 'Far' })
    expect(seen.store!.version).toBe(before)
  })

  it('a 32-character crew name wraps: "waved at you" is never cut; control: a person’s toast stays one line', async () => {
    jest.useFakeTimers({ now: NOW })
    const name = 'Saint-Jean-sur-Richelieu Runners'
    await render(<WaveToast toast={{ waves: [{ eventId: 'e1', fromCrewId: 'c1', fromName: name, at: NOW }] }} onOpen={jest.fn()} onWaveBack={jest.fn()} onSeeAll={jest.fn()} onSafety={jest.fn()} onDone={jest.fn()} />)
    expect(screen.getByText(`${name} waved at you`).props.numberOfLines).toBe(2)
    await screen.unmount()
    await render(<WaveToast toast={{ waves: [{ eventId: 'e1', fromUserId: 'p', fromName: 'Night Cat', at: NOW }] }} onOpen={jest.fn()} onWaveBack={jest.fn()} onSeeAll={jest.fn()} onSafety={jest.fn()} onDone={jest.fn()} />)
    expect(screen.getByText('Night Cat waved at you').props.numberOfLines).toBe(1)
  })

  it('a blocked crew leaves the toast and the fold, and is not heard again', async () => {
    jest.useFakeTimers({ now: NOW })
    await render(<Probe />)
    listenForWaves('e1')
    await sendCrew({ eventId: 'e1', fromCrewId: 'c1', fromName: 'Orbit' })
    await act(async () => ignoreCrewWaves('c1'))
    expect(seen.store!.toast).toBeNull()
    await act(async () => jest.advanceTimersByTime(FOLD_MS))
    await sendCrew({ eventId: 'e1', fromCrewId: 'c1', fromName: 'Orbit' })
    expect(seen.store!.toast).toBeNull()
  })

  it('the toast: the emblem when the room knows it, else the crew glyph; its body opens the list, never a card', async () => {
    jest.useFakeTimers({ now: NOW })
    const onOpen = jest.fn()
    const onSeeAll = jest.fn()
    const onWaveBack = jest.fn()
    const toast = { waves: [{ eventId: 'e1', fromCrewId: 'c1', fromName: 'Orbit', at: NOW }] }
    await render(<WaveToast toast={toast} onOpen={onOpen} onWaveBack={onWaveBack} onSeeAll={onSeeAll} onSafety={jest.fn()} onDone={jest.fn()} />)
    expect(screen.getByTestId('wave-toast-emblem-glyph', { includeHiddenElements: true })).toBeTruthy()
    await fireEvent.press(screen.getByTestId('wave-toast-press'))
    expect(onSeeAll).toHaveBeenCalled()
    expect(onOpen).not.toHaveBeenCalled()
    await screen.unmount()
    await render(<WaveToast toast={toast} emblemOf={() => 'seed-1'} onOpen={onOpen} onWaveBack={onWaveBack} onSeeAll={onSeeAll} onSafety={jest.fn()} onDone={jest.fn()} />)
    expect(screen.queryByTestId('wave-toast-emblem-glyph', { includeHiddenElements: true })).toBeNull()
    await fireEvent.press(screen.getByRole('button', { name: 'Wave back at Orbit' }))
    expect(onWaveBack).toHaveBeenCalledWith(toast.waves[0])
  })
})

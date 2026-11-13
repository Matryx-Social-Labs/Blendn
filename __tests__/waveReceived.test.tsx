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
import { WaveBackPill } from '../components/blendn/WaveBackPill'
import { WaveToast } from '../components/blendn/WaveToast'
import { WavedAtYouList } from '../components/blendn/WavedAtYouList'
import { WavedAtYouStrip } from '../components/blendn/WavedAtYouStrip'
import type { ReceivedWave, ReceivedWavesPage } from '../lib/apiClient'
import { COLOR } from '../lib/design/tokens'
import { H } from '../lib/haptics'
import { othersLine, toastTitle, waitingStrip, wavedAtYouLine } from '../lib/receivedWaves'
import { FOLD_MS, ignoreWavesFrom, listenForWaves, useRoomWaves, waveShown } from '../lib/roomWaves'

jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default)
const mockWaveListeners = new Set<(d: { eventId: string; fromUserId: string; fromName: string }) => void>()
jest.mock('../lib/socketClient', () => ({
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
    expect(s.faces.map((w) => w.userId)).toEqual(['rh_1', 'rh_2', 'rh_3'])
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
    const onWaveBack = jest.fn().mockResolvedValue(true)
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

  it('Block from a row takes it off the list; control: a cancelled sheet keeps it', async () => {
    mockGetReceivedWaves.mockResolvedValueOnce({ success: true, data: page([wave(1), wave(2)]) })
    let done: (() => void) | undefined
    const onSafety = jest.fn((_w: ReceivedWave, removed: () => void) => {
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
    const room = { eventId: 'e1', waiting: 12_480, latest: wave(1, { displayName: 'Harbour Heron' }) }
    await render(<BanterWavesRow room={room} title="Toit" onSafety={onSafety} />)
    expect(screen.getAllByTestId(/^banter-waves-/)).toHaveLength(1)
    expect(screen.getByText('12k waved at you')).toBeTruthy()
    expect(screen.getByText('In the room · Toit')).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: '12480 waved at you. In the room · Toit' }))
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/waves/[eventId]', params: { eventId: 'e1', title: 'Toit' } })
    await fireEvent(screen.getByTestId('banter-waves-e1'), 'longPress')
    expect(onSafety).toHaveBeenCalledWith(room.latest)
  })
})

describe('B-A: the pile (owner 2026-11-13: the board’s three faces)', () => {
  const face = (n: number) => ({ userId: `rh_${n}`, displayName: `Person ${n}` })
  it('draws the latest three faces, newest first, with no "+N"', async () => {
    const room = { eventId: 'e1', waiting: 12_480, latest: wave(1), latestFaces: [face(1), face(2), face(3)] }
    await render(<BanterWavesRow room={room} title="Toit" onSafety={jest.fn()} />)
    const pile = screen.getByTestId('banter-waves-e1-pile', { includeHiddenElements: true })
    expect(pile).toBeTruthy()
    for (const i of [0, 1, 2]) expect(screen.getByTestId(`banter-waves-e1-pile-face-${i}`, { includeHiddenElements: true })).toBeTruthy()
    expect(screen.queryByTestId('banter-waves-e1-pile-face-3', { includeHiddenElements: true })).toBeNull()
    expect(screen.queryByText(/^\+/, { includeHiddenElements: true })).toBeNull()
  })

  it('control: one face is the single latest face', async () => {
    await render(<BanterWavesRow room={{ eventId: 'e1', waiting: 1, latest: wave(1), latestFaces: [face(1)] }} title="Toit" onSafety={jest.fn()} />)
    expect(screen.queryByTestId('banter-waves-e1-pile', { includeHiddenElements: true })).toBeNull()
    expect(screen.getByTestId('banter-waves-e1-face', { includeHiddenElements: true })).toBeTruthy()
  })

  it('control: a server from before latestFaces draws the latest face', async () => {
    await render(<BanterWavesRow room={{ eventId: 'e1', waiting: 4, latest: wave(1) }} title="Toit" onSafety={jest.fn()} />)
    expect(screen.queryByTestId('banter-waves-e1-pile', { includeHiddenElements: true })).toBeNull()
    expect(screen.getByTestId('banter-waves-e1-face', { includeHiddenElements: true })).toBeTruthy()
  })
})

describe('the filled rose pill (owner 2026-11-13: white on a deeper rose, AA)', () => {
  it('Wave back is filled with brandRoseFill, white ink', async () => {
    await render(<WaveBackPill name="Harbour Heron" state="ready" onPress={jest.fn()} testID="pill" />)
    const ready = StyleSheet.flatten(screen.getByTestId('pill').props.style)
    expect(ready).toMatchObject({ backgroundColor: COLOR.brandRoseFill, borderColor: COLOR.brandRoseFill })
    expect(StyleSheet.flatten(screen.getByText('Wave back').props.style).color).toBe(COLOR.textPrimary)
  })

  it('control: ✓ Waved stays the rose outline, never the fill', async () => {
    await render(<WaveBackPill name="Harbour Heron" state="waved" testID="pill" />)
    const waved = StyleSheet.flatten(screen.getByTestId('pill').props.style)
    expect(waved.backgroundColor).toBeUndefined()
    expect(waved.borderColor).not.toBe(COLOR.brandRoseFill)
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
    screen.unmount()
    await render(<BanterWavesRow room={{ eventId: 'e1', waiting: 12_480, latest: wave(1, { displayName: LONG }) }} title="Bengaluru Design Festival 2026 · Bangalore Palace Grounds" onSafety={jest.fn()} />)
    expect(screen.getByText('In the room · Bengaluru Design Festival 2026 · Bangalore Palace Grounds').props.numberOfLines).toBe(1)
  })
})


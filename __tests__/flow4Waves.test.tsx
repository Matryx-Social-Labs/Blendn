/**
 * Waves to you (SCRUM-630, ROUND3 R2/R3, D · 4.2): heard while checked in,
 * overlay open or not; one `H.arrive`; a blocked or reported person's never
 * shown again; "Waved at you · 2 min" for ten minutes; the ✓ capsule opens
 * their card.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import React from 'react'
import { AccessibilityInfo } from 'react-native'

import { WaveToast } from '../components/blendn/WaveToast'
import { H } from '../lib/haptics'
import { ignoreWavesFrom, listenForWaves, newestWave, useRoomWaves, WAVED_AT_YOU_MS, wavedAtYouLabel, waveShown } from '../lib/roomWaves'

jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default)
const mockWaveListeners = new Set<(d: { eventId: string; fromUserId: string; fromName: string }) => void>()
jest.mock('../lib/socketClient', () => ({
  subscribeToRoomWave: (fn: (d: { eventId: string; fromUserId: string; fromName: string }) => void) => {
    mockWaveListeners.add(fn)
    return () => mockWaveListeners.delete(fn)
  },
}))

const send = (d: { eventId: string; fromUserId: string; fromName: string }) => act(async () => mockWaveListeners.forEach((fn) => fn(d)))

let latest: ReturnType<typeof useRoomWaves>
function Probe() {
  latest = useRoomWaves()
  return null
}

afterEach(() => listenForWaves(null))

describe('the store', () => {
  it('hears only the room you are checked into, and a new room starts clean', async () => {
    await render(<Probe />)
    listenForWaves('e1')
    await send({ eventId: 'e2', fromUserId: 'a', fromName: 'Night Cat' })
    expect(latest.latest).toBeNull()
    await send({ eventId: 'e1', fromUserId: 'a', fromName: 'Night Cat' })
    expect(latest.latest).toMatchObject({ fromUserId: 'a', fromName: 'Night Cat' })
    expect(Object.keys(latest.received)).toEqual(['a'])
    await act(async () => listenForWaves('e3'))
    expect(latest.latest).toBeNull()
    expect(latest.received).toEqual({})
    expect(mockWaveListeners.size).toBe(1)
  })

  it('stops listening when you are out of every room', async () => {
    listenForWaves('e1')
    listenForWaves(null)
    expect(mockWaveListeners.size).toBe(0)
  })

  it('a blocked or reported person’s waves go, and never come back to this room', async () => {
    await render(<Probe />)
    listenForWaves('e1')
    await send({ eventId: 'e1', fromUserId: 'a', fromName: 'Night Cat' })
    await act(async () => ignoreWavesFrom('a'))
    expect(latest.latest).toBeNull()
    expect(latest.received).toEqual({})
    await send({ eventId: 'e1', fromUserId: 'a', fromName: 'Night Cat' })
    expect(latest.latest).toBeNull()
  })

  it('shown once: the toast or banner marks it, the row and the chip stay', async () => {
    await render(<Probe />)
    listenForWaves('e1')
    await send({ eventId: 'e1', fromUserId: 'a', fromName: 'Night Cat' })
    await act(async () => waveShown(latest.latest!))
    expect(latest.latest).toBeNull()
    expect(newestWave(latest.received, Date.now())?.fromName).toBe('Night Cat')
  })

  it('"Waved at you · N min" for ten minutes, then nothing', () => {
    const now = Date.now()
    expect(wavedAtYouLabel(now - 30_000, now)).toBe('1 min')
    expect(wavedAtYouLabel(now - 2 * 60_000, now)).toBe('2 min')
    expect(wavedAtYouLabel(now - WAVED_AT_YOU_MS, now)).toBeNull()
    expect(wavedAtYouLabel(undefined, now)).toBeNull()
    expect(newestWave({ a: { eventId: 'e', fromUserId: 'a', fromName: 'x', at: now - WAVED_AT_YOU_MS } }, now)).toBeNull()
  })
})

describe('the ✓ capsule (Room #07, R3-D4 13′)', () => {
  beforeEach(() => {
    jest.spyOn(AccessibilityInfo, 'isReduceTransparencyEnabled').mockResolvedValue(false)
    jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {})
  })

  it('names the wave once, with one H.arrive (it used to be two), and opens their card', async () => {
    jest.useFakeTimers()
    const arrive = jest.spyOn(H, 'arrive').mockImplementation(() => {})
    const onOpen = jest.fn()
    const onDone = jest.fn()
    await render(<WaveToast wave={{ eventId: 'e1', fromUserId: 'a', fromName: 'Night Cat', at: Date.now() }} onOpen={onOpen} onDone={onDone} />)
    expect(screen.getByText('Night Cat waved at you')).toBeTruthy()
    expect(arrive).toHaveBeenCalledTimes(1)
    await fireEvent.press(screen.getByRole('button', { name: 'Night Cat waved at you' }))
    expect(onOpen).toHaveBeenCalledTimes(1)
    await act(async () => jest.advanceTimersByTime(1000))
    expect(onDone).toHaveBeenCalledTimes(1)
    expect(arrive).toHaveBeenCalledTimes(1)
    jest.useRealTimers()
  })

  it('leaves by itself after its dwell', async () => {
    jest.useFakeTimers()
    jest.spyOn(H, 'arrive').mockImplementation(() => {})
    const onDone = jest.fn()
    await render(<WaveToast wave={{ eventId: 'e1', fromUserId: 'a', fromName: 'Night Cat', at: Date.now() }} onOpen={jest.fn()} onDone={onDone} />)
    await act(async () => jest.advanceTimersByTime(4900))
    expect(onDone).not.toHaveBeenCalled()
    await act(async () => jest.advanceTimersByTime(100))
    // It slides out over `quick`, then it is gone.
    await act(async () => jest.advanceTimersByTime(1000))
    expect(onDone).toHaveBeenCalledTimes(1)
    jest.useRealTimers()
  })
})

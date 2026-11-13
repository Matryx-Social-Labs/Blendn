/*
 * "With {crew}" at the hold (crews 4-A2, owner 1b, board 04-checkin A2): your own Hold to Blend’n carries the chip; on, the
 * hold tells the crew you're in (`withCrewId`), with no second tap. On by default only when the crew planned tonight; tap it
 * to come in on your own (then no `withCrewId`). When it lands on your hold, the huddle cheers.
 */
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react-native'
import React from 'react'

jest.mock('../lib/crewsApi', () => ({ crewsApi: { myCrews: jest.fn() } }))
jest.mock('../lib/apiClient', () => ({ apiClient: { getEvent: jest.fn() } }))

/* eslint-disable import/first */
import { useWithCrew, WithCrewChip } from '../components/crews/WithCrewChip'
import { H } from '../lib/haptics'
/* eslint-enable import/first */

const api = jest.requireMock('../lib/crewsApi').crewsApi as { myCrews: jest.Mock }
const client = jest.requireMock('../lib/apiClient').apiClient as { getEvent: jest.Mock }

const crew = (crewId: string, name: string) => ({ crewId, name, emblemSeed: 'aaaaaaaaaaaaaaaa', size: 4 })
const tonight = { crewId: 'c2', name: 'Orbit', emblemSeed: 'bbbbbbbbbbbbbbbb', occurrenceId: 'o1', startsAt: new Date(Date.now() + 3_600_000).toISOString(), going: [] }

beforeEach(() => {
  api.myCrews.mockReset().mockResolvedValue({ success: true, data: { crews: [crew('c1', 'Nebula'), crew('c2', 'Orbit')], invites: [] } })
  client.getEvent.mockReset().mockResolvedValue({ success: true, data: { userStatus: { myCrewPlans: [] } } })
})

describe('useWithCrew', () => {
  it('a crew that planned tonight: that crew, on, and withCrewId is its id', async () => {
    client.getEvent.mockResolvedValue({ success: true, data: { userStatus: { myCrewPlans: [tonight] } } })
    const { result } = await renderHook(() => useWithCrew('e1'))
    await waitFor(() => expect(result.current.crew?.name).toBe('Orbit'))
    expect(result.current.on).toBe(true)
    expect(result.current.withCrewId).toBe('c2')
  })

  it('no plan: your first crew, off, and no withCrewId until tapped on', async () => {
    const { result } = await renderHook(() => useWithCrew('e1'))
    await waitFor(() => expect(result.current.crew?.name).toBe('Nebula'))
    expect(result.current.withCrewId).toBeUndefined()
    await act(async () => result.current.toggle())
    expect(result.current.withCrewId).toBe('c1')
  })

  it('no crews: no chip', async () => {
    api.myCrews.mockResolvedValue({ success: true, data: { crews: [], invites: [] } })
    const { result } = await renderHook(() => useWithCrew('e1'))
    await waitFor(() => expect(api.myCrews).toHaveBeenCalled())
    expect(result.current.crew).toBeNull()
  })

  it('no event at the door: reads nothing', async () => {
    await renderHook(() => useWithCrew(null))
    expect(api.myCrews).not.toHaveBeenCalled()
    expect(client.getEvent).not.toHaveBeenCalled()
  })
})

describe('<WithCrewChip>', () => {
  const nebula = { crewId: 'c1', name: 'Nebula', emblemSeed: 'aaaaaaaaaaaaaaaa' }

  it('on: "With Nebula", selected, and says what it does', async () => {
    await render(<WithCrewChip crew={nebula} on onToggle={jest.fn()} />)
    expect(screen.getByRole('button', { name: 'With Nebula' }).props.accessibilityState).toMatchObject({ selected: true })
    expect(screen.getByText('Tells your crew you’re in. Tap to come in on your own tonight.')).toBeTruthy()
  })

  it('off: not selected, and says the crew is not told', async () => {
    await render(<WithCrewChip crew={nebula} on={false} onToggle={jest.fn()} />)
    expect(screen.getByRole('button', { name: 'With Nebula' }).props.accessibilityState).toMatchObject({ selected: false })
    expect(screen.getByText('Coming in on your own: your crew isn’t told. Tap to come in with them.')).toBeTruthy()
  })

  it('a tap toggles it with H.select', async () => {
    const select = jest.spyOn(H, 'select').mockImplementation(() => {})
    const onToggle = jest.fn()
    await render(<WithCrewChip crew={nebula} on onToggle={onToggle} />)
    await fireEvent.press(screen.getByRole('button', { name: 'With Nebula' }))
    expect(onToggle).toHaveBeenCalledTimes(1)
    expect(select).toHaveBeenCalled()
  })

  it('a 32-character name stays one line in the chip', async () => {
    await render(<WithCrewChip crew={{ ...nebula, name: 'Indiranagar Sunrise Run Club Cre' }} on onToggle={jest.fn()} />)
    expect(screen.getByText('With Indiranagar Sunrise Run Club Cre').props.numberOfLines).toBe(1)
  })

  it('landed on your hold: the huddle cheers, and the chip can no longer be changed', async () => {
    const onToggle = jest.fn()
    const { rerender } = await render(<WithCrewChip crew={nebula} on onToggle={onToggle} />)
    expect(screen.queryByTestId('crew-emblem-scene', { includeHiddenElements: true })).toBeNull()
    await rerender(<WithCrewChip crew={nebula} on landed onToggle={onToggle} />)
    expect(screen.getByTestId('crew-emblem-scene', { includeHiddenElements: true })).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.getByLabelText('With Nebula')).toBeTruthy()
    expect(screen.getByText('Your crew knows you’re in.')).toBeTruthy()
  })

  it('landed while off: no cheer, and it says you came in on your own', async () => {
    await render(<WithCrewChip crew={nebula} on={false} landed onToggle={jest.fn()} />)
    expect(screen.queryByTestId('crew-emblem-scene', { includeHiddenElements: true })).toBeNull()
    expect(screen.getByText('You came in on your own.')).toBeTruthy()
  })
})

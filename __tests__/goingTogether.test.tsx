/*
 * "Going together" on the event page (crews 4-A1, board 04-checkin A1): your crew only. "Going with Nebula?" and the
 * button that marks the night (`POST /crews/:id/plans`); tapped again it is taken back (`DELETE`). Crewmates who are going
 * are named ("Priya and Arjun are going · From Nebula"). No crew, nothing at all.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import React from 'react'

jest.mock('../lib/crewsApi', () => ({ crewsApi: { myCrews: jest.fn(), plan: jest.fn(), unplan: jest.fn() } }))
const mockToast = jest.fn()
jest.mock('../components/Toast', () => ({ useToast: () => ({ showToast: mockToast }) }))
const mockSheet = jest.fn()
jest.mock('../lib/sheet', () => ({ showSheet: (s: unknown) => mockSheet(s) }))

/* eslint-disable import/first */
import { GoingTogether } from '../components/crews/GoingTogether'
import type { CrewPlan } from '../lib/crews'
/* eslint-enable import/first */

const api = jest.requireMock('../lib/crewsApi').crewsApi as Record<'myCrews' | 'plan' | 'unplan', jest.Mock>
const crew = (crewId: string, name: string) => ({ crewId, name, emblemSeed: 'aaaaaaaaaaaaaaaa', size: 4 })
const mate = (name: string, you = false) => ({ userId: `h-${name}`, name, photo: null, you })
const plan = (o: Partial<CrewPlan> = {}): CrewPlan => ({ crewId: 'c1', name: 'Nebula', emblemSeed: 'aaaaaaaaaaaaaaaa', occurrenceId: 'o1', startsAt: '2026-11-20T14:30:00Z', going: [], ...o })

beforeEach(() => {
  jest.clearAllMocks()
  api.myCrews.mockResolvedValue({ success: true, data: { crews: [crew('c1', 'Nebula')], invites: [] } })
  api.plan.mockResolvedValue({ success: true, data: { planned: true, repeated: false, occurrenceId: 'o1' } })
  api.unplan.mockResolvedValue({ success: true, data: { planned: false } })
})

describe('<GoingTogether>', () => {
  it('no crew: draws nothing', async () => {
    api.myCrews.mockResolvedValue({ success: true, data: { crews: [], invites: [] } })
    await render(<GoingTogether eventId="e1" plans={[]} onChanged={jest.fn()} />)
    await waitFor(() => expect(api.myCrews).toHaveBeenCalled())
    expect(screen.queryByText(/Going with/)).toBeNull()
  })

  it('asks "Going with Nebula?", says who sees it, and marks the night', async () => {
    const onChanged = jest.fn()
    await render(<GoingTogether eventId="e1" plans={[]} onChanged={onChanged} />)
    await waitFor(() => screen.getByText('Going with Nebula?'))
    expect(screen.getByText('Your crew sees it in the crew chat. Nobody else does.')).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: 'Going together' }))
    expect(api.plan).toHaveBeenCalledWith('c1', 'e1')
    await waitFor(() => expect(onChanged).toHaveBeenCalled())
  })

  it('planned: it says so, and a tap takes it back', async () => {
    const onChanged = jest.fn()
    await render(<GoingTogether eventId="e1" plans={[plan()]} onChanged={onChanged} />)
    await waitFor(() => screen.getByRole('button', { name: 'You’re going together' }))
    await fireEvent.press(screen.getByRole('button', { name: 'You’re going together' }))
    expect(api.unplan).toHaveBeenCalledWith('c1', 'e1')
    await waitFor(() => expect(onChanged).toHaveBeenCalled())
  })

  it('names crewmates who are going, never you', async () => {
    await render(<GoingTogether eventId="e1" plans={[plan({ going: [mate('Priya'), mate('Arjun'), mate('Sagar', true)] })]} onChanged={jest.fn()} />)
    await waitFor(() => screen.getByText('Priya and Arjun are going'))
    expect(screen.getByText('From Nebula')).toBeTruthy()
  })

  it('a refusal (429: three nights told today) is said in the server’s words, and nothing changes', async () => {
    api.plan.mockResolvedValue({ success: false, error: 'Your crew has planned three nights today. Try again tomorrow.', status: 429 })
    const onChanged = jest.fn()
    await render(<GoingTogether eventId="e1" plans={[]} onChanged={onChanged} />)
    await waitFor(() => screen.getByRole('button', { name: 'Going together' }))
    await fireEvent.press(screen.getByRole('button', { name: 'Going together' }))
    await waitFor(() => expect(mockToast).toHaveBeenCalled())
    expect(onChanged).not.toHaveBeenCalled()
  })

  it('two crews, none planned: asks which crew first', async () => {
    api.myCrews.mockResolvedValue({ success: true, data: { crews: [crew('c1', 'Nebula'), crew('c2', 'Orbit')], invites: [] } })
    await render(<GoingTogether eventId="e1" plans={[]} onChanged={jest.fn()} />)
    await waitFor(() => screen.getByText('Going with your crew?'))
    await fireEvent.press(screen.getByRole('button', { name: 'Going together' }))
    expect(mockSheet).toHaveBeenCalledWith(expect.objectContaining({ kind: 'actions', title: 'Going together with…' }))
    const choice = mockSheet.mock.calls[0][0].actions.find((a: { label: string }) => a.label === 'Orbit')
    await choice.then()
    expect(api.plan).toHaveBeenCalledWith('c2', 'e1')
  })

  it('a 32-character crew name wraps to at most two lines in the ask', async () => {
    api.myCrews.mockResolvedValue({ success: true, data: { crews: [crew('c1', 'Indiranagar Sunrise Run Club Cre')], invites: [] } })
    await render(<GoingTogether eventId="e1" plans={[]} onChanged={jest.fn()} />)
    await waitFor(() => screen.getByText('Going with Indiranagar Sunrise Run Club Cre?'))
    expect(screen.getByText('Going with Indiranagar Sunrise Run Club Cre?').props.numberOfLines).toBe(2)
  })
})

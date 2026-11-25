/**
 * The crew chat's `crew_waved` line (task 17 b1, advisor L-A 2026-11-25): "Nebula waved at your crew" as a DS SystemNotice
 * with one text action, Wave back; after it "Waved back" and no action; a crew or person who has gone, "They've left the
 * room", never an error. A crewmate's own "waved at Orbit for the crew" stays a centred line naming who.
 */
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react-native'

jest.mock('expo-router', () => ({ useFocusEffect: (effect: () => void) => { const { useEffect } = require('react'); useEffect(effect, [effect]) } }))
jest.mock('../lib/crewsApi', () => ({ crewsApi: { waveCrew: jest.fn(), likePersonAsCrew: jest.fn(), hiddenCrews: jest.fn() } }))

import { CrewWavedNotice } from '../components/chat/CrewWavedNotice'
import { crewLikeLine } from '../lib/crews'
import { useHiddenCrewIds, waveBackFromChat, withoutBlockedCrews } from '../lib/crewWaveBack'
import { crewsApi } from '../lib/crewsApi'
import { roomMessagesFrom } from '../lib/roomMessages'

const api = crewsApi as jest.Mocked<typeof crewsApi>
beforeEach(() => jest.clearAllMocks())

describe('reading crew_waved off the history', () => {
  const raw = (metadata: unknown) => [{ id: 'm1', user_id: 'sys', content: 'Nebula waved at your crew', type: 'system', created_at: '2026-11-25T10:00:00Z', metadata }]

  it('a crew’s wave carries the event and the crew', () => {
    expect(roomMessagesFrom(raw({ kind: 'crew_waved', eventId: 'e1', fromCrewId: 'c9' }), 'me', 'crew')[0].crewWave).toEqual({ eventId: 'e1', fromCrewId: 'c9' })
  })
  it('a person’s wave carries their room handle', () => {
    expect(roomMessagesFrom(raw({ kind: 'crew_waved', eventId: 'e1', fromUserId: 'rh_1' }), 'me', 'crew')[0].crewWave).toEqual({ eventId: 'e1', fromUserId: 'rh_1' })
  })
  it('any other kind, or a malformed one, carries nothing', () => {
    expect(roomMessagesFrom(raw({ kind: 'crew_wave' }), 'me', 'crew')[0].crewWave).toBeUndefined()
    expect(roomMessagesFrom(raw({ kind: 'crew_waved', eventId: 'e1' }), 'me', 'crew')[0].crewWave).toBeUndefined()
    expect(roomMessagesFrom(raw(null), 'me', 'crew')[0].crewWave).toBeUndefined()
  })
})

describe('a crewmate’s own wave line', () => {
  it('names who, as a like does', () => {
    expect(crewLikeLine('waved at Orbit for the crew', 'Rohan')).toBe('Rohan waved at Orbit for the crew')
    expect(crewLikeLine('liked Orbit for the crew', 'You')).toBe('You liked Orbit for the crew')
    expect(crewLikeLine('Nebula waved at your crew', 'Blendn')).toBeNull()
  })
})

describe('Wave back from the chat', () => {
  it('at a crew: the crew wave, as this crew', async () => {
    api.waveCrew.mockResolvedValue({ success: true, data: { liked: true, waved: true, blend: null } })
    expect(await waveBackFromChat({ eventId: 'e1', fromCrewId: 'c9' }, 'mine')).toEqual({ kind: 'done', blend: null })
    expect(api.waveCrew).toHaveBeenCalledWith('e1', 'c9', 'mine')
  })
  it('at a crew that left (404): gone', async () => {
    api.waveCrew.mockResolvedValue({ success: false, errorCode: 'NOT_FOUND', error: 'Not found' } as never)
    expect(await waveBackFromChat({ eventId: 'e1', fromCrewId: 'c9' }, 'mine')).toEqual({ kind: 'gone' })
  })
  it('at a person: the crew like of them; a Mix opens', async () => {
    const blend = { blendId: 'b', chatGroupId: 'g' }
    api.likePersonAsCrew.mockResolvedValue({ success: true, data: { liked: true, blend } })
    expect(await waveBackFromChat({ eventId: 'e1', fromUserId: 'rh_1' }, 'mine')).toEqual({ kind: 'done', blend })
    expect(api.likePersonAsCrew).toHaveBeenCalledWith('e1', 'rh_1', 'mine')
  })
  it('at a person who left ({ blend: null } is not "gone"; 404 is)', async () => {
    api.likePersonAsCrew.mockResolvedValue({ success: false, errorCode: 'NOT_FOUND', error: 'x' } as never)
    expect(await waveBackFromChat({ eventId: 'e1', fromUserId: 'rh_1' }, 'mine')).toEqual({ kind: 'gone' })
  })
  it('checked out: the server’s “liking” is said as a wave, the only gesture left', async () => {
    api.waveCrew.mockResolvedValue({ success: false, errorCode: 'FORBIDDEN', error: 'Check in before liking anyone here.' } as never)
    expect(await waveBackFromChat({ eventId: 'e1', fromCrewId: 'c9' }, 'mine')).toEqual({ kind: 'error', text: 'Check in before you wave here.' })
    // Control: any other refusal keeps the server's own sentence.
    api.waveCrew.mockResolvedValue({ success: false, errorCode: 'FORBIDDEN', error: 'Your crew isn’t here yet.' } as never)
    expect(await waveBackFromChat({ eventId: 'e1', fromCrewId: 'c9' }, 'mine')).toEqual({ kind: 'error', text: 'Your crew isn’t here yet.' })
  })
  it('anything else is an error with the sentence', async () => {
    api.waveCrew.mockResolvedValue({ success: false, errorCode: 'SERVER_ERROR', error: 'HTTP 500' } as never)
    expect(await waveBackFromChat({ eventId: 'e1', fromCrewId: 'c9' }, 'mine')).toEqual({ kind: 'error', text: 'Couldn’t wave back. Try again.' })
  })
})

describe('<CrewWavedNotice>', () => {
  it('the sentence and one action, Wave back; then Waved back and no action', async () => {
    const onWaveBack = jest.fn().mockResolvedValue({ kind: 'done', blend: null })
    await render(<CrewWavedNotice id="m-a" text="Nebula waved at your crew" onWaveBack={onWaveBack} />)
    expect(screen.getByText('Nebula waved at your crew')).toBeTruthy()
    await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Wave back' })))
    expect(onWaveBack).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('button', { name: 'Wave back' })).toBeNull()
    expect(screen.getByText('Waved back')).toBeTruthy()
  })
  it('gone: “They’ve left the room”, no action', async () => {
    await render(<CrewWavedNotice id="m-b" text="Lunar Fox waved at the crew" onWaveBack={jest.fn().mockResolvedValue({ kind: 'gone' })} />)
    await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Wave back' })))
    expect(screen.getByText('They’ve left the room')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Wave back' })).toBeNull()
  })
  it('an error keeps Wave back and says why', async () => {
    await render(<CrewWavedNotice id="m-c" text="Nebula waved at your crew" onWaveBack={jest.fn().mockResolvedValue({ kind: 'error', text: 'Couldn’t wave back. Try again.' })} />)
    await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Wave back' })))
    expect(screen.getByText('Couldn’t wave back. Try again.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Wave back' })).toBeTruthy()
  })
  it('answered stays answered when the row scrolls away and back', async () => {
    const onWaveBack = jest.fn().mockResolvedValue({ kind: 'done', blend: null })
    const first = await render(<CrewWavedNotice id="m-d" text="Nebula waved at your crew" onWaveBack={onWaveBack} />)
    await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Wave back' })))
    await first.unmount()
    await render(<CrewWavedNotice id="m-d" text="Nebula waved at your crew" onWaveBack={onWaveBack} />)
    expect(screen.getByText('Waved back')).toBeTruthy()
  })
  it('without a way to answer (a live line with no metadata): the sentence alone', async () => {
    await render(<CrewWavedNotice id="m-e" text="Nebula waved at your crew" />)
    expect(screen.queryByRole('button', { name: 'Wave back' })).toBeNull()
  })
})

describe('a crew you blocked draws no notice (advisor Q2), and it fails closed', () => {
  const line = (id: string, extra: object = {}) => ({ message_id: id, sender_id: 's', sender_name: 'x', message_text: 'Orbit waved at your crew', message_type: 'system', reply_to_message_id: null, created_at: '2026-11-25T10:00:00Z', ...extra }) as never
  const from = (fromCrewId: string) => ({ crewWave: { eventId: 'e', fromCrewId } })
  const person = { crewWave: { eventId: 'e', fromUserId: 'rh' }, message_text: 'Lunar Fox waved at the crew' }
  const ids = (list: { message_id: string }[]) => list.map((m) => m.message_id)
  const pageOf = (crewIds: string[], hasMore: boolean) => ({ success: true, data: { crews: crewIds.map((crewId) => ({ crewId })), pagination: { hasMore } } }) as never

  it('drops only that crew’s line; a person’s wave, and everything else, stay', () => {
    const list = [line('a', from('blocked')), line('b', from('ok')), line('c', person), line('d', { message_type: 'text' })]
    expect(ids(withoutBlockedCrews(list, new Set(['blocked'])))).toEqual(['b', 'c', 'd'])
  })
  it('not known yet, or the read failed: every crew’s line is withheld', () => {
    expect(ids(withoutBlockedCrews([line('a', from('ok')), line('c', person)], null))).toEqual(['c'])
  })
  it('a live line with no metadata names no crew, so it waits for the history; a typed message with the same words does not', () => {
    expect(ids(withoutBlockedCrews([line('live'), line('typed', { message_type: 'text' })], new Set()))).toEqual(['typed'])
  })
  it('reads every page, for a crew chat only', async () => {
    api.hiddenCrews.mockResolvedValueOnce(pageOf(['c1'], true)).mockResolvedValueOnce(pageOf(['c2'], false))
    const { result, rerender } = await renderHook(({ on }: { on: boolean }) => useHiddenCrewIds(on), { initialProps: { on: false } })
    expect(api.hiddenCrews).not.toHaveBeenCalled()
    await rerender({ on: true })
    await waitFor(() => expect([...(result.current ?? [])]).toEqual(['c1', 'c2']))
    expect(api.hiddenCrews.mock.calls).toEqual([[1, 50], [2, 50]])
  })
  it('a re-read that fails makes a known list unknown again, never yesterday’s', async () => {
    api.hiddenCrews.mockResolvedValueOnce(pageOf(['c1'], false)).mockResolvedValue({ success: false, error: 'x' } as never)
    const { result, rerender } = await renderHook(({ on }: { on: boolean }) => useHiddenCrewIds(on), { initialProps: { on: true } })
    await waitFor(() => expect(result.current?.has('c1')).toBe(true))
    await rerender({ on: false })
    expect(result.current).toBeNull()
    await rerender({ on: true })
    await waitFor(() => expect(api.hiddenCrews).toHaveBeenCalledTimes(2))
    expect(result.current).toBeNull()
  })
  it('a later page that fails leaves it unknown', async () => {
    api.hiddenCrews.mockResolvedValueOnce(pageOf(['c1'], true)).mockResolvedValueOnce({ success: false, error: 'x' } as never)
    const { result } = await renderHook(() => useHiddenCrewIds(true))
    await waitFor(() => expect(api.hiddenCrews).toHaveBeenCalledTimes(2))
    expect(result.current).toBeNull()
  })
})

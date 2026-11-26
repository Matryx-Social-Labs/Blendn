/**
 * The crew chat's `crew_waved` line (task 17 b1, advisor L-A 2026-11-25): "Nebula waved at your crew" as a DS SystemNotice
 * with one text action, Wave back; after it "Waved back" and no action; a crew or person who has gone, "They've left the
 * room", never an error. A crewmate's own "waved at Orbit for the crew" stays a centred line naming who.
 */
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react-native'

jest.mock('../lib/crewsApi', () => ({ crewsApi: { waveCrew: jest.fn(), wavePersonAsCrew: jest.fn() } }))

import { CrewWavedNotice } from '../components/chat/CrewWavedNotice'
import { crewLikeLine } from '../lib/crews'
import { noteCrewBlocked, noteCrewUnblocked, useCrewsBlockedNow, waveBackFromChat, withoutBlockedCrews } from '../lib/crewWaveBack'
import { crewsApi } from '../lib/crewsApi'
import { roomMessageFromSocket, roomMessagesFrom } from '../lib/roomMessages'

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
  it('answered (admin #1029): this crew waved or liked back, so the line starts as Waved back', () => {
    const answered = (value: unknown) => roomMessagesFrom([{ ...raw({ kind: 'crew_waved', eventId: 'e1', occurrenceId: 'o1', fromCrewId: 'c9' })[0], answered: value }], 'me', 'crew')[0]
    expect(answered(true).crewWaveAnswered).toBe(true)
    // Controls: not answered, an older server (absent), or junk.
    expect(answered(false).crewWaveAnswered).toBeUndefined()
    expect(answered(undefined).crewWaveAnswered).toBeUndefined()
    expect(answered('yes').crewWaveAnswered).toBeUndefined()
  })
  it('answered on any other line is not read', () => {
    expect(roomMessagesFrom([{ ...raw({ kind: 'crew_wave' })[0], answered: true }], 'me', 'crew')[0].crewWaveAnswered).toBeUndefined()
  })
})

describe('reading crew_waved off the socket (admin #1029 sends its metadata)', () => {
  const live = (metadata?: unknown, extra: object = {}) =>
    roomMessageFromSocket({ id: 'm9', userId: 'sys', userName: 'Blendn', content: 'Nebula waved at your crew', type: 'system', createdAt: '2026-11-25T10:00:00Z', metadata, ...extra }, 'me', 'crew')

  it('a live line is whole at once: who waved, and what Wave back answers', () => {
    expect(live({ kind: 'crew_waved', eventId: 'e1', occurrenceId: 'o1', fromCrewId: 'c9' }).crewWave).toEqual({ eventId: 'e1', fromCrewId: 'c9' })
    expect(live({ kind: 'crew_waved', eventId: 'e1', fromUserId: 'rh_1' }).crewWave).toEqual({ eventId: 'e1', fromUserId: 'rh_1' })
  })
  it('a live wave is never answered yet; with no metadata (an older server) it names nobody', () => {
    expect(live({ kind: 'crew_waved', eventId: 'e1', fromCrewId: 'c9' }, { answered: true }).crewWaveAnswered).toBeUndefined()
    expect(live().crewWave).toBeUndefined()
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
  it('at a person: the wave for this crew at their handle; a Mix opens', async () => {
    const blend = { blendId: 'b', chatGroupId: 'g' }
    api.wavePersonAsCrew.mockResolvedValue({ success: true, data: { sent: true, mutual: true, blend } })
    expect(await waveBackFromChat({ eventId: 'e1', fromUserId: 'rh_1' }, 'mine')).toEqual({ kind: 'done', blend })
    expect(api.wavePersonAsCrew).toHaveBeenCalledWith('e1', 'rh_1', 'mine')
  })
  it('at a person: a wave that stood with no Mix is done, not gone (a refusal about them says nothing); 404 is gone', async () => {
    api.wavePersonAsCrew.mockResolvedValue({ success: true, data: { sent: true, mutual: false } })
    expect(await waveBackFromChat({ eventId: 'e1', fromUserId: 'rh_1' }, 'mine')).toEqual({ kind: 'done', blend: null })
    api.wavePersonAsCrew.mockResolvedValue({ success: false, errorCode: 'NOT_FOUND', error: 'x' } as never)
    expect(await waveBackFromChat({ eventId: 'e1', fromUserId: 'rh_1' }, 'mine')).toEqual({ kind: 'gone' })
  })
  it('a refusal keeps the server’s own sentence (admin #1029 says wave)', async () => {
    api.waveCrew.mockResolvedValue({ success: false, errorCode: 'FORBIDDEN', error: 'Check in before you wave here.' } as never)
    expect(await waveBackFromChat({ eventId: 'e1', fromCrewId: 'c9' }, 'mine')).toEqual({ kind: 'error', text: 'Check in before you wave here.' })
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
  it('answered before (after a restart): Waved back from the start, no action', async () => {
    const onWaveBack = jest.fn()
    await render(<CrewWavedNotice id="m-f" text="Nebula waved at your crew" wavedBack onWaveBack={onWaveBack} />)
    expect(screen.getByText('Waved back')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Wave back' })).toBeNull()
    // Control: not answered offers Wave back.
    await render(<CrewWavedNotice id="m-g" text="Nebula waved at your crew" wavedBack={false} onWaveBack={onWaveBack} />)
    expect(screen.getByRole('button', { name: 'Wave back' })).toBeTruthy()
  })
  it('answered somewhere else while on screen: the next read turns it to Waved back', async () => {
    const view = await render(<CrewWavedNotice id="m-h" text="Nebula waved at your crew" onWaveBack={jest.fn()} />)
    expect(screen.getByRole('button', { name: 'Wave back' })).toBeTruthy()
    await view.rerender(<CrewWavedNotice id="m-h" text="Nebula waved at your crew" wavedBack onWaveBack={jest.fn()} />)
    expect(screen.getByText('Waved back')).toBeTruthy()
  })
  it('without a way to answer (a line naming nobody): the sentence alone', async () => {
    await render(<CrewWavedNotice id="m-e" text="Nebula waved at your crew" />)
    expect(screen.queryByRole('button', { name: 'Wave back' })).toBeNull()
  })
})

describe('a crew you blocked draws no notice (advisor Q2)', () => {
  const line = (id: string, extra: object = {}) => ({ message_id: id, sender_id: 's', sender_name: 'x', message_text: 'Orbit waved at your crew', message_type: 'system', reply_to_message_id: null, created_at: '2026-11-25T10:00:00Z', ...extra }) as never
  const from = (fromCrewId: string) => ({ crewWave: { eventId: 'e', fromCrewId } })
  const person = { crewWave: { eventId: 'e', fromUserId: 'rh' }, message_text: 'Lunar Fox waved at the crew' }
  const ids = (list: { message_id: string }[]) => list.map((m) => m.message_id)

  it('drops only that crew’s line; a person’s wave, and everything else, stay', () => {
    const list = [line('a', from('blocked')), line('b', from('ok')), line('c', person), line('d', { message_type: 'text' })]
    expect(ids(withoutBlockedCrews(list, new Set(['blocked'])))).toEqual(['b', 'c', 'd'])
  })
  it('the server leaves out a crew blocked before the chat opened, so nothing is withheld on a guess', () => {
    expect(ids(withoutBlockedCrews([line('a', from('ok')), line('c', person), line('live')], new Set()))).toEqual(['a', 'c', 'live'])
  })
  it('a block made on this phone reaches a chat already open; unblocking lets it back', async () => {
    const { result } = await renderHook(() => useCrewsBlockedNow())
    expect(result.current.has('c7')).toBe(false)
    await act(async () => noteCrewBlocked('c7'))
    expect(result.current.has('c7')).toBe(true)
    await act(async () => noteCrewUnblocked('c7'))
    expect(result.current.has('c7')).toBe(false)
  })
})

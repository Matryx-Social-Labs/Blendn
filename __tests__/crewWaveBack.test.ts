/** Wave back at a crew as yourself, and the ask when "Open to joining a crew tonight" is off (S5 b2, advisor Q7 2026-11-25). */
import { askOpenToCrews, onOpenedToCrews, waveBackAtCrew } from '../lib/crewWaveBack'
import { crewsApi } from '../lib/crewsApi'
import { showSheet, type ActionSheet } from '../lib/sheet'

jest.mock('../lib/apiClient', () => ({ apiClient: {} }))
jest.mock('../lib/crewsApi')
jest.mock('../lib/sheet', () => ({ showSheet: jest.fn() }))
jest.mock('expo-router', () => ({ useFocusEffect: jest.fn() }))

const api = jest.mocked(crewsApi)
const OFF = { success: false, errorCode: 'FORBIDDEN', error: 'Turn on "Open to joining a crew tonight" to like a crew.' } as never
const crew = { crewId: 'c1', name: 'Orbit' }
const blend = { blendId: 'b', chatGroupId: 'g' }

beforeEach(() => jest.clearAllMocks())

describe('waveBackAtCrew', () => {
  it('waves as yourself: no crew of yours goes with it', async () => {
    api.waveCrew.mockResolvedValue({ success: true, data: { liked: true, waved: true, blend } })
    expect(await waveBackAtCrew('e1', 'c1')).toEqual({ kind: 'done', blend })
    expect(api.waveCrew).toHaveBeenCalledWith('e1', 'c1')
  })
  it('404 is gone; your switch off is its own answer; control: another 403 keeps its sentence', async () => {
    api.waveCrew.mockResolvedValueOnce({ success: false, errorCode: 'NOT_FOUND', error: 'Not found' } as never)
    expect(await waveBackAtCrew('e1', 'c1')).toEqual({ kind: 'gone' })
    api.waveCrew.mockResolvedValueOnce(OFF)
    expect(await waveBackAtCrew('e1', 'c1')).toEqual({ kind: 'notOpen' })
    api.waveCrew.mockResolvedValueOnce({ success: false, errorCode: 'FORBIDDEN', error: 'Crews are off here.' } as never)
    expect(await waveBackAtCrew('e1', 'c1')).toEqual({ kind: 'error', text: 'Crews are off here.' })
  })
})

describe('askOpenToCrews', () => {
  const ask = (onOutcome = jest.fn()) => {
    askOpenToCrews('e1', crew, onOutcome)
    const sheet = jest.mocked(showSheet).mock.calls[0][0] as ActionSheet
    const turnOn = sheet.actions[0] as { label: string; run: () => Promise<unknown> }
    return { sheet, turnOn, onOutcome }
  }
  it('Turn it on writes the switch, tells the Crews view, then waves', async () => {
    const heard = jest.fn()
    const off = onOpenedToCrews(heard)
    api.openToCrews.mockResolvedValue({ success: true, data: { openToCrews: true } })
    api.waveCrew.mockResolvedValue({ success: true, data: { liked: true, waved: true, blend } })
    const { sheet, turnOn, onOutcome } = ask()
    expect(sheet.actions.map((a) => a.label)).toEqual(['Turn it on', 'Not now'])
    // Nothing is sent by asking.
    expect(api.openToCrews).not.toHaveBeenCalled()
    expect(await turnOn.run()).toEqual({ ok: true })
    expect(api.openToCrews).toHaveBeenCalledWith('e1', true)
    expect(heard).toHaveBeenCalledWith('e1')
    expect(onOutcome).toHaveBeenCalledWith({ kind: 'done', blend })
    off()
  })
  it('a refused switch sends no wave and keeps the sheet', async () => {
    api.openToCrews.mockResolvedValue({ success: false, errorCode: 'SERVER_ERROR', error: 'HTTP 500' } as never)
    const { turnOn, onOutcome } = ask()
    expect(await turnOn.run()).toEqual({ ok: false, error: 'Couldn’t save that. Try again.' })
    expect(api.waveCrew).not.toHaveBeenCalled()
    expect(onOutcome).not.toHaveBeenCalled()
  })
})

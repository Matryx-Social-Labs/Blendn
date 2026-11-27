/**
 * The door code, guest side (gate 13, SCRUM-1313): the refusal tray offers "Enter door code", a sheet takes the code
 * (design/02a guest A: gA-tray, gA-entry, gA-wrong, gA-locked, gA-far), and a right code checks in once and goes on as any
 * check-in does: the pour, then the room. Pick (Fable advisor, 2026-11-27): no gA-ok screen; the Room's you-card says the
 * host sentence for a door-code arrival.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import React from 'react'
import { AccessibilityInfo } from 'react-native'

import { DoorCodeSheet } from '../components/blendn/DoorCodeSheet'
import { RoomYouCard } from '../components/blendn/RoomSections'
import { MomentPour } from '../components/ds/MomentPour'
import { cameByDoorCode, markArrival, submitCheckIn, type CheckInOutcome } from '../lib/checkIn'
import { checkInRefusal } from '../lib/checkInRefusal'
import { H } from '../lib/haptics'
import { useCheckInFlow, type UseCheckInFlowOptions } from '../lib/useCheckInFlow'

jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default)
jest.mock('react-native-reanimated', () => ({ ...jest.requireActual('react-native-reanimated'), __esModule: true, useReducedMotion: () => false }))
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }))
jest.mock('../lib/logger', () => ({ Logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(), journey: jest.fn() } }))
jest.mock('../lib/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1', name: 'Sam Rao', image: null } }) }))
jest.mock('../lib/apiClient', () => ({ apiClient: { setMatchPreferences: jest.fn(async () => ({ success: true })), getEvent: jest.fn() } }))
jest.mock('../lib/locationFix', () => ({ warmLocationFix: jest.fn(async () => {}), getCurrentLocation: jest.fn() }))
jest.mock('../lib/roomVisibilityStorage', () => ({}))
jest.mock('../lib/checkIn', () => ({ ...jest.requireActual('../lib/checkIn'), submitCheckIn: jest.fn(), revealOffer: jest.fn() }))

const submit = submitCheckIn as jest.Mock
const locate = jest.requireMock('../lib/locationFix').getCurrentLocation as jest.Mock
const HIDDEN = { includeHiddenElements: true }
const FIX = { latitude: 12.97, longitude: 77.59, accuracy: 86, mocked: false }
const fresh: CheckInOutcome = { kind: 'checkedIn', checkInId: 'c1', askIntent: false, revealSuggestion: false, left: [] }
const refused = (errorCode: string, message: string): CheckInOutcome =>
  ({ kind: 'refused', refusal: checkInRefusal(errorCode, message), errorCode, alreadyCheckedIn: false }) as CheckInOutcome
const WRONG = 'That code didn’t match. Check the host’s screen; it may have just changed.'
const CHANGED = 'That code just changed. Read the new one on the host’s screen.'
const LOCKED = 'Too many tries. Try again at 10:52 PM, or step outside and use GPS.'

let flow: ReturnType<typeof useCheckInFlow>
const keep = (f: ReturnType<typeof useCheckInFlow>) => {
  flow = f
}
/** A door as both screens draw one: the hook, its pour, and its door-code sheet. */
function Door(props: UseCheckInFlowOptions) {
  const flow = useCheckInFlow(props)
  keep(flow)
  return (
    <>
      {flow.pours > 0 ? <MomentPour key={flow.pours} venue="Toit" asks={flow.asks} onDone={flow.pourDone} testID="pour" /> : null}
      <DoorCodeSheet door={flow.door} eventLine="Neon Nights at Toit · Toit" testID="door" />
    </>
  )
}

let props: jest.Mocked<Required<Pick<UseCheckInFlowOptions, 'showTray' | 'closeTray' | 'onCheckedIn' | 'onEnterRoom'>>>
beforeEach(() => {
  jest.useFakeTimers()
  jest.clearAllMocks()
  markArrival('e1', false)
  props = { showTray: jest.fn(), closeTray: jest.fn(), onCheckedIn: jest.fn(), onEnterRoom: jest.fn(async () => {}) }
  jest.spyOn(H, 'success').mockImplementation(() => {})
  jest.spyOn(H, 'error').mockImplementation(() => {})
  jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {})
  jest.spyOn(AccessibilityInfo, 'announceForAccessibilityWithOptions').mockImplementation(() => {})
  jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(false)
  jest.spyOn(AccessibilityInfo, 'isReduceTransparencyEnabled').mockResolvedValue(false)
  jest.spyOn(AccessibilityInfo, 'isBoldTextEnabled').mockResolvedValue(false)
})
afterEach(() => jest.useRealTimers())

/** A GPS check-in refused with the server's offer (an OUT_OF_RANGE within 1 km, or a vague fix), and "Enter door code" pressed. */
async function openFromServerOffer() {
  locate.mockResolvedValue(FIX)
  submit.mockResolvedValueOnce(refused('DOOR_CODE_OFFERED', 'GPS signal is too weak (accuracy: 300m).'))
  await render(<Door eventId="e1" {...props} />)
  await act(async () => {
    await flow.start()
  })
  const [title, , offered] = props.showTray.mock.calls[0]
  const buttons = offered!
  expect(title).toBe('GPS can’t place you')
  expect(buttons.map((b) => [b.label, b.kind])).toEqual([
    ['Try GPS again', 'tertiary'],
    ['Enter door code', 'lit'],
  ])
  await act(async () => buttons[1].onPress())
  expect(props.closeTray).toHaveBeenCalled()
}

const field = () => screen.getByLabelText('Door code', HIDDEN)
const checkInButton = () => screen.getByTestId('door-check-in', HIDDEN)
async function type(text: string) {
  await act(async () => fireEvent.changeText(field(), text))
}
async function pressCheckIn() {
  await act(async () => fireEvent.press(checkInButton()))
}

describe('the offer', () => {
  it('a weak-fix refusal shows the door-code entry: the sheet, its field and its hint', async () => {
    await openFromServerOffer()
    expect(flow.door).not.toBeNull()
    // The sheet's title and the field's label (upper-cased by its role, hidden from a screen reader).
    expect(screen.getAllByText('Door code', HIDDEN)).toHaveLength(2)
    expect(screen.getByText('Neon Nights at Toit · Toit', HIDDEN)).toBeTruthy()
    expect(field().props.accessibilityHint).toBe('Six letters and numbers from the host’s screen. It changes every 30 seconds.')
    // §4: forgiving input. §8: no autofill, Go submits.
    expect(field().props).toMatchObject({ autoCapitalize: 'characters', autoCorrect: false, spellCheck: false, autoComplete: 'off', returnKeyType: 'go' })
  })

  it('the client’s own weak-fix tray opens the same sheet with its fix (locationFix → enter)', async () => {
    locate.mockImplementation(async ({ doorCode }: { doorCode: { enter: (f: typeof FIX) => void } }) => {
      doorCode.enter(FIX)
      return null
    })
    await render(<Door eventId="e1" {...props} />)
    await act(async () => {
      await flow.start()
    })
    expect(flow.door).not.toBeNull()
    expect(submit).not.toHaveBeenCalled()
  })

  it('asks the event whether the code is live (`doorCode.available`), never computes it', async () => {
    const api = jest.requireMock('../lib/apiClient').apiClient as { getEvent: jest.Mock }
    api.getEvent.mockResolvedValue({ success: true, data: { doorCode: { available: true } } })
    let available!: () => Promise<boolean>
    locate.mockImplementation(async ({ doorCode }: { doorCode: { available: () => Promise<boolean> } }) => {
      available = doorCode.available
      return null
    })
    await render(<Door eventId="e1" {...props} />)
    await act(async () => {
      await flow.start()
    })
    expect(await available()).toBe(true)
    expect(api.getEvent).toHaveBeenCalledWith('e1')
    api.getEvent.mockResolvedValue({ success: true, data: {} })
    expect(await available()).toBe(false)
  })
})

describe('entering the code', () => {
  it('shows 3 + 3 as the host’s screen does, from a mask, and accepts lower case, spaces and dashes', async () => {
    await openFromServerOffer()
    await type('7kq-m4p')
    expect(field().props.value).toBe('7KQ M4P')
    await type('7KQ M4PXX')
    expect(field().props.value).toBe('7KQ M4P')
  })

  it('a valid code submits once, with the fix, and lands in the room', async () => {
    await openFromServerOffer()
    submit.mockResolvedValueOnce(fresh)
    await type('7kq m4p')
    await act(async () => {
      fireEvent.press(checkInButton())
      fireEvent.press(checkInButton())
    })
    expect(submit).toHaveBeenCalledTimes(2) // the GPS attempt, then the code: once
    expect(submit).toHaveBeenLastCalledWith('e1', FIX, undefined, '7KQM4P')
    expect(flow.door).toBeNull()
    await act(async () => jest.advanceTimersByTime(700))
    expect(props.onCheckedIn).toHaveBeenCalledWith(fresh)
    expect(props.onEnterRoom).toHaveBeenCalledTimes(1)
    expect(cameByDoorCode('e1')).toBe(true)
  })

  it('Go on the keyboard submits too', async () => {
    await openFromServerOffer()
    submit.mockResolvedValueOnce(fresh)
    await type('7KQM4P')
    await act(async () => fireEvent(field(), 'submitEditing'))
    expect(submit).toHaveBeenLastCalledWith('e1', FIX, undefined, '7KQM4P')
  })

  it('fewer than six characters says so, and sends nothing', async () => {
    await openFromServerOffer()
    await type('7KQ')
    await pressCheckIn()
    expect(submit).toHaveBeenCalledTimes(1)
    expect(screen.getByText('Enter all six characters', HIDDEN)).toBeTruthy()
  })

  it('an expired code shows the server’s sentence, keeps what was typed, and stays in the sheet', async () => {
    await openFromServerOffer()
    submit.mockResolvedValueOnce(refused('DOOR_CODE_CHANGED', CHANGED))
    await type('7KQM4P')
    await pressCheckIn()
    expect(screen.getByText(CHANGED, HIDDEN)).toBeTruthy()
    expect(field().props.value).toBe('7KQ M4P')
    expect(flow.door).not.toBeNull()
    expect(props.onEnterRoom).not.toHaveBeenCalled()
    // The error replaces the hint for a screen reader, and is spoken once, starting "Error." (§8).
    expect(field().props.accessibilityHint).toBe(CHANGED)
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith(`Error. ${CHANGED}`)
    // Typing again clears it.
    await type('7KQM4')
    expect(screen.queryByText(CHANGED, HIDDEN)).toBeNull()
  })

  it('a wrong code is the same, with its own sentence; the same answer twice is said twice; the right code then gets in', async () => {
    await openFromServerOffer()
    submit.mockResolvedValueOnce(refused('DOOR_CODE_WRONG', WRONG)).mockResolvedValueOnce(refused('DOOR_CODE_WRONG', WRONG))
    await type('ZZZZZZ')
    await pressCheckIn()
    expect(screen.getByText(WRONG, HIDDEN)).toBeTruthy()
    await pressCheckIn()
    expect((AccessibilityInfo.announceForAccessibility as jest.Mock).mock.calls.filter(([s]) => s === `Error. ${WRONG}`)).toHaveLength(2)
    expect(cameByDoorCode('e1')).toBe(false)
    submit.mockResolvedValueOnce(fresh)
    await type('7KQM4P')
    await pressCheckIn()
    expect(submit).toHaveBeenCalledTimes(4)
    expect(submit).toHaveBeenLastCalledWith('e1', FIX, undefined, '7KQM4P')
    await act(async () => jest.advanceTimersByTime(700))
    expect(props.onEnterRoom).toHaveBeenCalledTimes(1)
  })

  it('while the code is on its way, Try GPS again and a close do nothing: its answer comes back to this sheet', async () => {
    await openFromServerOffer()
    let answer!: (o: CheckInOutcome) => void
    submit.mockImplementationOnce(() => new Promise((resolve) => (answer = resolve)))
    await type('ZZZZZZ')
    await pressCheckIn()
    expect(screen.getByTestId('door-gps', HIDDEN).props.accessibilityState).toMatchObject({ disabled: true })
    await act(async () => {
      flow.door!.tryGps()
      flow.door!.close()
    })
    expect(flow.door).not.toBeNull()
    expect(locate).toHaveBeenCalledTimes(1)
    await act(async () => answer(refused('DOOR_CODE_WRONG', WRONG)))
    expect(screen.getByText(WRONG, HIDDEN)).toBeTruthy()
  })

  it('locked: the field and Check in are both disabled, and the sentence says until when', async () => {
    await openFromServerOffer()
    submit.mockResolvedValueOnce(refused('DOOR_CODE_LOCKED', LOCKED))
    await type('ZZZZZZ')
    await pressCheckIn()
    expect(screen.getByText(LOCKED, HIDDEN)).toBeTruthy()
    expect(field().props.editable).toBe(false)
    expect(checkInButton().props.accessibilityState).toMatchObject({ disabled: true })
    await pressCheckIn()
    expect(submit).toHaveBeenCalledTimes(2)
  })

  it('a refusal that is not the code’s (the event ended meanwhile) closes the sheet for the usual tray', async () => {
    await openFromServerOffer()
    submit.mockResolvedValueOnce(refused('EVENT_ENDED', 'This event has ended.'))
    await type('7KQM4P')
    await pressCheckIn()
    expect(flow.door).toBeNull()
    expect(props.showTray).toHaveBeenLastCalledWith('This one’s over', 'This event has ended.', expect.any(Array), { icon: 'moon' })
  })

  it('a code the server is slow on: the sheet gives way to "Still checking you in", and its Retry resends the code', async () => {
    await openFromServerOffer()
    submit.mockResolvedValueOnce({ kind: 'timeout' })
    await type('7KQM4P')
    await pressCheckIn()
    expect(flow.door).toBeNull()
    const [title, , shown] = props.showTray.mock.calls.at(-1)!
    expect(title).toBe('Still checking you in')
    submit.mockResolvedValueOnce(refused('DOOR_CODE_WRONG', WRONG))
    await act(async () => shown!.find((b) => b.label === 'Retry')!.onPress())
    expect(submit).toHaveBeenLastCalledWith('e1', FIX, undefined, '7KQM4P')
    // The answer is not lost: the sheet comes back with it, and with the code it is about.
    expect(flow.door).toMatchObject({ error: WRONG, locked: false })
    expect(field().props.value).toBe('7KQ M4P')
  })

  it('"Try GPS again" closes the sheet and runs the GPS check-in again; a GPS arrival is not the code’s', async () => {
    await openFromServerOffer()
    markArrival('e1', true)
    submit.mockResolvedValueOnce(fresh)
    await act(async () => fireEvent.press(screen.getByText('Try GPS again', HIDDEN)))
    expect(flow.door).toBeNull()
    expect(locate).toHaveBeenCalledTimes(2)
    expect(submit).toHaveBeenLastCalledWith('e1', FIX, undefined)
    await act(async () => jest.advanceTimersByTime(700))
    expect(cameByDoorCode('e1')).toBe(false)
  })
})

describe('in the room', () => {
  const card = (hostSees: boolean) => (
    <RoomYouCard
      face={{ kind: 'creature', pseudonym: 'Quiet Otter' }}
      name="Quiet Otter"
      self={{ name: 'Sam', face: { kind: 'creature', pseudonym: 'Quiet Otter' } }}
      checkedInAt={null}
      hereCount={3}
      others={[]}
      now={0}
      state="anon"
      onChange={() => {}}
      hostSees={hostSees}
    />
  )
  it('a door-code arrival is told the host sees the pseudonym, not their name (gA-ok, by the advisor’s pick)', async () => {
    await render(card(true))
    expect(screen.getByText(/The host sees this name, not your real one\./, HIDDEN)).toBeTruthy()
  })
  it('a GPS arrival’s line is unchanged', async () => {
    await render(card(false))
    expect(screen.queryByText(/The host sees this name/, HIDDEN)).toBeNull()
  })
})

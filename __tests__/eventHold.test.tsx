/**
 * SCRUM-966: the event page's "Blend’n" is the hold itself. Nothing is docked in Blend'n first: the hold runs the one
 * check-in flow (`useCheckInFlow`) from the page, "You're in" pours over the page, and the Room overlay (opened underneath
 * at the server's yes) is stepped onto once it is up. A refusal is drawn on the page.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import React from 'react'
import { AccessibilityInfo, Pressable, StyleSheet } from 'react-native'

import { EventCheckOutSheet, EventHold } from '../components/scene/EventHold'
import { ROOM_WAIT_MS, useEventCheckIn } from '../components/scene/useEventCheckIn'
import { checkInRefusal } from '../lib/checkInRefusal'
import { checkOutOf, submitCheckIn, type CheckInOutcome } from '../lib/checkIn'
import { COLOR } from '../lib/design/tokens'
import { H } from '../lib/haptics'
import { tint } from '../lib/theme'
import { CHECK_OUT_CONSEQUENCE } from '../lib/switchCopy'
import { getLeftNotice, openRoomOf, setLeftNotice, setLiveHint, setRoomUp } from '../lib/blendnOverlay'

jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default)
jest.mock('expo-glass-effect', () => {
  const { View } = jest.requireActual('react-native')
  return { GlassView: (props: object) => <View {...props} />, isGlassEffectAPIAvailable: jest.fn(() => true), isLiquidGlassAvailable: jest.fn(() => true) }
})
jest.mock('react-native-gesture-handler', () => ({
  ...jest.requireActual('react-native-gesture-handler'),
  GestureDetector: ({ children }: { children: React.ReactNode }) => children,
}))
jest.mock('expo-router', () => ({ router: { push: jest.fn(), dismissTo: jest.fn() } }))
jest.mock('../lib/logger', () => ({ Logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(), journey: jest.fn() } }))
jest.mock('../lib/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1', name: 'Sam Rao', image: null } }) }))
const mockActive = jest.fn()
jest.mock('../lib/apiClient', () => ({ apiClient: { setMatchPreferences: jest.fn(async () => ({ success: true })), getActiveCheckins: () => mockActive() } }))
jest.mock('../lib/locationFix', () => ({ warmLocationFix: jest.fn(async () => {}), getCurrentLocation: jest.fn(async () => ({ latitude: 12.97, longitude: 77.59, accuracy: 8 })) }))
jest.mock('../lib/roomVisibilityStorage', () => ({}))
jest.mock('../lib/checkIn', () => ({ ...jest.requireActual('../lib/checkIn'), submitCheckIn: jest.fn(), revealOffer: jest.fn(), checkOutOf: jest.fn() }))
const mockFix = jest.fn()
jest.mock('../lib/useTonight', () => ({ quietLocation: () => mockFix() }))
jest.mock('../lib/blendnOverlay', () => ({ ...jest.requireActual('../lib/blendnOverlay'), openRoomOf: jest.fn(), openPass: jest.fn() }))

const { router } = jest.requireMock('expo-router') as { router: { dismissTo: jest.Mock; push: jest.Mock } }
const { openPass } = jest.requireMock('../lib/blendnOverlay') as { openPass: jest.Mock }
const submit = submitCheckIn as jest.Mock
const checkOut = checkOutOf as jest.Mock
const HIDDEN = { includeHiddenElements: true }
const advance = (ms: number) => act(async () => jest.advanceTimersByTime(ms))
const fresh: CheckInOutcome = { kind: 'checkedIn', checkInId: 'c1', askIntent: false, revealSuggestion: false, left: [] }
const refused = (errorCode: string, message: string): CheckInOutcome => ({ kind: 'refused', errorCode, alreadyCheckedIn: false, refusal: checkInRefusal(errorCode, message) })

// Toit, Indiranagar. The event as the page holds it (`doorOf` reads its window and coordinates).
const soon = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString()
const event = { id: 'e1', title: 'Vinyl Night', venue_name: 'Toit', latitude: 12.9791, longitude: 77.6408, start_time: soon(-1), end_time: soon(2), status: 'published' }

const mockToast = jest.fn()
const mockCheckedOut = jest.fn()
function Page({ openMaps = jest.fn(), going = false }: { openMaps?: () => void; going?: boolean }) {
  const { hold, checkOut: out, openCheckOut, overlays } = useEventCheckIn({ id: 'e1', event: event as never, openMaps, showToast: mockToast, onCheckedOut: mockCheckedOut })
  return (
    <>
      {going ? (
        <>
          {/* The dock's state, as the screen draws it with DockRow: "You’re in. Check out". */}
          <Pressable accessibilityRole="button" accessibilityLabel="You’re in. Check out" onPress={openCheckOut} />
          <EventCheckOutSheet {...out} />
        </>
      ) : (
        <EventHold {...hold} />
      )}
      {overlays}
    </>
  )
}
const activate = () =>
  act(async () => fireEvent(screen.getByRole('button', { name: 'Hold to Blend’n' }), 'accessibilityAction', { nativeEvent: { actionName: 'activate' } }))
const fix = (latitude: number, longitude: number) => ({ coords: { latitude, longitude, accuracy: 10, timestamp: Date.now(), approximate: false }, location: 'on' })

beforeEach(() => {
  jest.useFakeTimers()
  jest.clearAllMocks()
  setRoomUp(null)
  setLiveHint(null)
  setLeftNotice(null)
  mockActive.mockResolvedValue({ success: true, data: { checkIns: [] } })
  mockFix.mockResolvedValue(fix(12.9792, 77.6408))
  jest.spyOn(H, 'success').mockImplementation(() => {})
  jest.spyOn(H, 'error').mockImplementation(() => {})
  jest.spyOn(AccessibilityInfo, 'announceForAccessibilityWithOptions').mockImplementation(() => {})
  jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {})
  jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(false)
  jest.spyOn(AccessibilityInfo, 'isReduceTransparencyEnabled').mockResolvedValue(false)
  jest.spyOn(AccessibilityInfo, 'isBoldTextEnabled').mockResolvedValue(false)
})
afterEach(() => jest.useRealTimers())

describe('the hold is the button', () => {
  it('reads "Hold to Blend’n", enabled at the door, and docks no pass in Blend’n', async () => {
    await render(<Page />)
    await act(async () => {})
    const hold = screen.getByRole('button', { name: 'Hold to Blend’n' })
    expect(hold.props.accessibilityState).toMatchObject({ disabled: false })
    expect(openPass).not.toHaveBeenCalled()
  })

  it('too far away: dimmed, with the one short line (the pass’s own rule)', async () => {
    mockFix.mockResolvedValue(fix(12.9575, 77.6408))
    await render(<Page />)
    await act(async () => {})
    expect(screen.getByRole('button', { name: 'Hold to Blend’n' }).props.accessibilityState).toMatchObject({ disabled: true })
    expect(screen.getByText('You’re too far away', HIDDEN)).toBeTruthy()
  })

  it('location off: dimmed, "Location is off"', async () => {
    mockFix.mockResolvedValue({ coords: null, location: 'off' })
    await render(<Page />)
    await act(async () => {})
    expect(screen.getByRole('button', { name: 'Hold to Blend’n' }).props.accessibilityState).toMatchObject({ disabled: true })
    expect(screen.getByText('Location is off', HIDDEN)).toBeTruthy()
  })
})

describe('in another room already', () => {
  it('the hold is a switch out of it', async () => {
    setLiveHint('other')
    await render(<Page />)
    await act(async () => {})
    expect(screen.getByRole('button', { name: 'Hold to switch' })).toBeTruthy()
    expect(screen.getByText('Leaves your other event and checks you in here.', HIDDEN)).toBeTruthy()
    setLiveHint(null)
  })

  it('names the event it leaves, and the same sentence is the hint', async () => {
    setLiveHint('other', 'Fandom')
    await render(<Page />)
    await act(async () => {})
    expect(screen.getByText('Leaves Fandom and checks you in here.', HIDDEN)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Hold to switch' }).props.accessibilityHint).toBe('Leaves Fandom and checks you in here.')
    setLiveHint(null)
  })
})

describe('opened cold, before the tab bar has read which room you are in (SCRUM-971)', () => {
  it('reads it once itself: Hold to switch, naming the room it leaves', async () => {
    mockActive.mockResolvedValue({ success: true, data: { checkIns: [{ eventId: 'other', event: { title: 'Fandom' } }] } })
    await render(<Page />)
    await act(async () => {})
    expect(screen.getByRole('button', { name: 'Hold to switch' })).toBeTruthy()
    expect(screen.getByText('Leaves Fandom and checks you in here.', HIDDEN)).toBeTruthy()
    setLiveHint(null)
  })

  it('stays "Hold to Blend’n" when you are in no room, or the read fails', async () => {
    mockActive.mockRejectedValueOnce(new Error('offline'))
    await render(<Page />)
    await act(async () => {})
    expect(screen.getByRole('button', { name: 'Hold to Blend’n' })).toBeTruthy()
  })

  it('does not ask when the tab bar already has the answer', async () => {
    setLiveHint('other', 'Fandom')
    await render(<Page />)
    await act(async () => {})
    expect(mockActive).not.toHaveBeenCalled()
    setLiveHint(null)
  })
})

describe('checked into this event already: "Check out" opens the sheet with the hold (option A, SCRUM-1035)', () => {
  const Hold = () => screen.queryByRole('button', { name: 'Hold to check out' })
  const open = () => act(async () => fireEvent.press(screen.getByRole('button', { name: 'You’re in. Check out' })))
  const holdOut = () => act(async () => fireEvent(screen.getByRole('button', { name: /Hold to check out|Checking you out/ }), 'accessibilityAction', { nativeEvent: { actionName: 'activate' } }))
  const settle = () => advance(1000)

  it('draws no hold until "Check out" is tapped', async () => {
    await render(<Page going />)
    expect(Hold()).toBeNull()
  })

  it('asks in the room’s words (audit A-2): “Check out of {event}?”, the room’s sentence over the hold, and Stay', async () => {
    await render(<Page going />)
    await open()
    expect(screen.getByRole('header', { name: 'Check out of Vinyl Night?' })).toBeTruthy()
    expect(screen.getByText(CHECK_OUT_CONSEQUENCE)).toBeTruthy()
    expect(Hold()?.props.accessibilityHint).toBe('Checks you out of Vinyl Night.')
    expect(screen.getByRole('button', { name: 'Stay' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull()
    // The old line under the hold is gone at rest; a refusal still has its place there.
    expect(screen.queryByText('Checks you out of this event.', HIDDEN)).toBeNull()
  })

  it('is the quiet hold, the lit kind with its hue pouring in, not the gradient', async () => {
    await render(<Page going />)
    await open()
    expect(screen.getByTestId('scene-checkout-pill-rim', HIDDEN)).toBeTruthy()
    expect(screen.getByTestId('scene-checkout-pill-fill-ground', HIDDEN)).toBeTruthy()
  })

  it('the check-in hold keeps the gradient', async () => {
    await render(<Page />)
    expect(screen.getByTestId('scene-hold-pill', HIDDEN)).toBeTruthy()
    expect(screen.queryByTestId('scene-hold-pill-rim', HIDDEN)).toBeNull()
    expect(screen.queryByTestId('scene-hold-pill-fill-ground', HIDDEN)).toBeNull()
  })

  it('Stay closes it and checks nobody out', async () => {
    await render(<Page going />)
    await open()
    await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Stay' })))
    await settle()
    expect(Hold()).toBeNull()
    expect(checkOut).not.toHaveBeenCalled()
  })

  it('held: checks out through the Room’s own call for this event, busy until the answer, then closes', async () => {
    let answer: (v: { success: boolean }) => void = () => {}
    checkOut.mockReturnValue(new Promise((r) => (answer = r)))
    await render(<Page going />)
    await open()
    await holdOut()
    expect(checkOut).toHaveBeenCalledWith('e1')
    // Busy: the fill stays full under its busy words; Cancel is off.
    expect(screen.getByRole('button', { name: 'Checking you out…' }).props.accessibilityState).toMatchObject({ busy: true })
    expect(screen.getByRole('button', { name: 'Stay' }).props.accessibilityState).toMatchObject({ disabled: true })
    await act(async () => answer({ success: true }))
    await settle()
    expect(screen.queryByRole('button', { name: /Hold to check out|Checking you out/ })).toBeNull()
  })

  it('a check-out that lands (audit B-2, C-2): the page is told at once, then the success toast, with its haptic, names the event', async () => {
    checkOut.mockResolvedValue({ success: true })
    await render(<Page going />)
    await open()
    await holdOut()
    await settle()
    expect(mockCheckedOut).toHaveBeenCalledTimes(1)
    expect(mockToast).toHaveBeenCalledWith('Checked out of Vinyl Night.', 'success', { haptic: 'success' })
    expect(mockCheckedOut.mock.invocationCallOrder[0]).toBeLessThan(mockToast.mock.invocationCallOrder[0])
    // The DS Toast says itself (announced on iOS, a live region on Android): never a second announcement here.
    expect(AccessibilityInfo.announceForAccessibility).not.toHaveBeenCalled()
  })

  it('a refusal is not a check-out: no toast, and the page is not told', async () => {
    checkOut.mockResolvedValue({ success: false, error: 'Nope.' })
    await render(<Page going />)
    await open()
    await holdOut()
    await settle()
    expect(mockToast).not.toHaveBeenCalled()
    expect(mockCheckedOut).not.toHaveBeenCalled()
  })


  it('refused: stays open, says why in its line, plays the error once, and the hold is ready again', async () => {
    checkOut.mockResolvedValue({ success: false, error: 'Nope.' })
    await render(<Page going />)
    await open()
    await holdOut()
    await settle()
    expect(screen.getByText('Nope.', HIDDEN)).toBeTruthy()
    expect(H.error).toHaveBeenCalledTimes(1)
    expect(Hold()?.props.accessibilityState).toMatchObject({ disabled: false })
    // A second try clears the reason.
    checkOut.mockResolvedValue({ success: true })
    await holdOut()
    await settle()
    expect(screen.queryByText('Nope.', HIDDEN)).toBeNull()
    expect(Hold()).toBeNull()
  })

  it('a call that throws says the app’s own sentence', async () => {
    checkOut.mockRejectedValue(new Error('offline'))
    await render(<Page going />)
    await open()
    await holdOut()
    await settle()
    expect(screen.getByText('Couldn’t check you out. You’re still in this room.', HIDDEN)).toBeTruthy()
  })

  it('opened again after a refusal, it starts clean', async () => {
    checkOut.mockResolvedValue({ success: false, error: 'Nope.' })
    await render(<Page going />)
    await open()
    await holdOut()
    await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Stay' })))
    await settle()
    await open()
    expect(screen.queryByText('Nope.', HIDDEN)).toBeNull()
    expect(screen.getByText(CHECK_OUT_CONSEQUENCE)).toBeTruthy()
  })
})

describe('the server says yes', () => {
  it('sends this event, opens the Room underneath, pours "You’re in." over the page and holds it until the Room is up', async () => {
    submit.mockResolvedValue(fresh)
    await render(<Page />)
    await activate()
    expect(submit).toHaveBeenCalledWith('e1', expect.objectContaining({ latitude: 12.97 }), undefined)
    expect(openRoomOf).toHaveBeenCalledWith('e1')
    expect(screen.getByTestId('scene-pour', HIDDEN)).toBeTruthy()
    expect(screen.getByText('You’re in.', HIDDEN)).toBeTruthy()
    // Past the pour's own 700 ms, with no Room yet: still the pour, still on the page.
    await advance(2000)
    expect(router.dismissTo).not.toHaveBeenCalled()
    // The Room is behind it: the page steps aside onto it.
    await act(async () => setRoomUp('e1'))
    await advance(1)
    expect(router.dismissTo).toHaveBeenCalledWith('/(tabs)/events')
  })

  describe('switching out of another room', () => {
    const switchHold = () =>
      act(async () => fireEvent(screen.getByRole('button', { name: 'Hold to switch' }), 'accessibilityAction', { nativeEvent: { actionName: 'activate' } }))

    it('tells the Room which room it left, from the poll, so the Room can say "You left {room}."', async () => {
      setLiveHint('other', 'Fandom')
      submit.mockResolvedValue(fresh)
      await render(<Page />)
      await switchHold()
      expect(getLeftNotice()).toEqual({ title: 'Fandom', toId: 'e1' })
    })

    it('prefers the name the server gave for the room it took you out of', async () => {
      setLiveHint('other', 'Fandom')
      submit.mockResolvedValue({ ...fresh, left: ['Toit'] })
      await render(<Page />)
      await switchHold()
      expect(getLeftNotice()).toEqual({ title: 'Toit', toId: 'e1' })
    })

    it('says nothing when it left no room', async () => {
      submit.mockResolvedValue(fresh)
      await render(<Page />)
      await activate()
      expect(getLeftNotice()).toBeNull()
    })
  })

  it('the page is darkened to solid ink under the pour: none of it shows around the panel', async () => {
    submit.mockResolvedValue(fresh)
    await render(<Page />)
    await activate()
    const ink = StyleSheet.flatten(screen.getByTestId('scene-pour-scrim', HIDDEN).props.style).backgroundColor
    expect(ink).toBe(tint(COLOR.ink, 1))
  })

  it('a Room that never loads does not hold the pour for good', async () => {
    submit.mockResolvedValue(fresh)
    await render(<Page />)
    await activate()
    await advance(ROOM_WAIT_MS + 1)
    expect(router.dismissTo).toHaveBeenCalledWith('/(tabs)/events')
  })

  it('the pour never leaves the page showing: it is not dismissed before the pour has handed off', async () => {
    submit.mockResolvedValue(fresh)
    await render(<Page />)
    await activate()
    await act(async () => setRoomUp('e1'))
    await advance(600)
    expect(router.dismissTo).not.toHaveBeenCalled()
    await advance(100)
    expect(router.dismissTo).toHaveBeenCalledTimes(1)
  })

  it('already in: the Room simply opens, no pour', async () => {
    submit.mockResolvedValue({ ...refused('ALREADY_CHECKED_IN', 'You are already checked in.'), alreadyCheckedIn: true } as CheckInOutcome)
    await render(<Page />)
    await activate()
    expect(openRoomOf).toHaveBeenCalledTimes(1)
    expect(router.dismissTo).toHaveBeenCalledWith('/(tabs)/events')
    expect(screen.queryByTestId('scene-pour', HIDDEN)).toBeNull()
  })
})

describe('the server says no: said on the page, nothing opens', () => {
  it.each([
    ['OUT_OF_RANGE', 'Not quite there yet', 'You’re about 180 m from the door.'],
    ['EVENT_NOT_STARTED', 'Doors aren’t open', 'Check-in opens 90 minutes before the start.'],
    ['EVENT_ENDED', 'This one’s over', 'This event has ended.'],
    ['AGE_RESTRICTED', 'Not open to you', 'This event is 21+.'],
  ])('%s: "%s"', async (code, title, message) => {
    submit.mockResolvedValue(refused(code, message))
    await render(<Page />)
    await activate()
    expect(await screen.findByText(title, HIDDEN)).toBeTruthy()
    expect(screen.getByText(message, HIDDEN)).toBeTruthy()
    expect(openRoomOf).not.toHaveBeenCalled()
    expect(router.dismissTo).not.toHaveBeenCalled()
    expect(screen.queryByTestId('scene-pour', HIDDEN)).toBeNull()
    // The hold drains: it can be held again.
    expect(screen.getByRole('button', { name: 'Hold to Blend’n' }).props.accessibilityState).toMatchObject({ disabled: false, busy: false })
  })

  it('Not quite there yet offers Open Maps, which opens the page’s own map', async () => {
    const openMaps = jest.fn()
    submit.mockResolvedValue(refused('OUT_OF_RANGE', 'You’re about 180 m from the door.'))
    await render(<Page openMaps={openMaps} />)
    await activate()
    await act(async () => fireEvent.press(await screen.findByText('Open Maps', HIDDEN)))
    expect(openMaps).toHaveBeenCalledTimes(1)
  })

  it('a refusal that is ours to fix says Try again, and runs the check-in again', async () => {
    submit.mockResolvedValueOnce(refused('SOMETHING_ELSE', 'Something broke.')).mockResolvedValueOnce(fresh)
    await render(<Page />)
    await activate()
    await act(async () => fireEvent.press(await screen.findByText('Try again', HIDDEN)))
    expect(submit).toHaveBeenCalledTimes(2)
    expect(openRoomOf).toHaveBeenCalledTimes(1)
  })
})

describe('the same row from both doors', () => {
  it('sends the same request Tonight’s hold sends: this event and the phone’s fix, nothing else', async () => {
    submit.mockResolvedValue(fresh)
    await render(<Page />)
    await activate()
    expect(submit).toHaveBeenCalledTimes(1)
    expect(submit.mock.calls[0]).toEqual(['e1', { latitude: 12.97, longitude: 77.59, accuracy: 8 }])
  })
})

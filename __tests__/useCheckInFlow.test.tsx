/**
 * The check-in, as every door runs it (`lib/useCheckInFlow.ts`).
 *
 * The owner removed the "Rules and regulations" tray (docs/redesign/SCREENS.md,
 * Flow 4: the press or the hold is the consent), and the design puts the pour
 * where the "Checked in / Go to Chat" tray and the confetti were (DESIGN-BRIEF
 * §9.3 #9). Flow 4's order (Tonight #12–#14, motion #9): the pour, then the
 * reveal offer and "Why do you go out?" (SCRUM-77) if the server asks, then
 * the room — and nothing navigates while any of it is still on screen.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import { readFileSync } from 'fs'
import { join } from 'path'
import React from 'react'
import { AccessibilityInfo } from 'react-native'

import { ASK_AT, MomentPour, ROOM_AT } from '../components/ds/MomentPour'
import { DURATION } from '../lib/design/tokens'
import { apiClient } from '../lib/apiClient'
import { askIntentRoute, intentAnswered, revealOffer, submitCheckIn, type CheckInOutcome } from '../lib/checkIn'
import { checkInRefusal } from '../lib/checkInRefusal'
import { H } from '../lib/haptics'
import { useCheckInFlow, type UseCheckInFlowOptions } from '../lib/useCheckInFlow'

jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default)
jest.mock('react-native-reanimated', () => ({ ...jest.requireActual('react-native-reanimated'), __esModule: true, useReducedMotion: () => false }))
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }))
jest.mock('../lib/logger', () => ({
  Logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(), journey: jest.fn() },
}))
jest.mock('../lib/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1', name: 'Sam Rao', image: null } }) }))
jest.mock('../lib/apiClient', () => ({ apiClient: { setMatchPreferences: jest.fn(async () => ({ success: true })) } }))
jest.mock('../lib/locationFix', () => ({ warmLocationFix: jest.fn(async () => {}), getCurrentLocation: jest.fn(async () => ({ latitude: 12.97, longitude: 77.59, accuracy: 8 })) }))
jest.mock('../lib/roomVisibilityStorage', () => ({}))
jest.mock('../lib/checkIn', () => ({
  ...jest.requireActual('../lib/checkIn'),
  submitCheckIn: jest.fn(),
  revealOffer: jest.fn(),
}))

const { router } = jest.requireMock('expo-router') as { router: { push: jest.Mock } }
const submit = submitCheckIn as jest.Mock
const offer = revealOffer as jest.Mock
const HIDDEN = { includeHiddenElements: true }
const advance = (ms: number) => act(async () => jest.advanceTimersByTime(ms))

const fresh = (o: Partial<Extract<CheckInOutcome, { kind: 'checkedIn' }>> = {}): CheckInOutcome => ({
  kind: 'checkedIn',
  checkInId: 'c1',
  askIntent: false,
  revealSuggestion: false,
  left: [],
  ...o,
})

let flow: ReturnType<typeof useCheckInFlow>
/** A door as the two screens draw one: the hook, and its pour while `pours` is above 0. */
function Door(props: UseCheckInFlowOptions) {
  flow = useCheckInFlow(props)
  return flow.pours > 0 ? <MomentPour key={flow.pours} venue="Toit" asks={flow.asks} onDone={flow.pourDone} testID="pour" /> : null
}

let props: jest.Mocked<Required<Pick<UseCheckInFlowOptions, 'showTray' | 'closeTray' | 'onCheckedIn' | 'onEnterRoom'>>>
let success: jest.SpyInstance
let error: jest.SpyInstance
beforeEach(() => {
  jest.useFakeTimers()
  props = { showTray: jest.fn(), closeTray: jest.fn(), onCheckedIn: jest.fn(), onEnterRoom: jest.fn(async () => {}) }
  success = jest.spyOn(H, 'success').mockImplementation(() => {})
  error = jest.spyOn(H, 'error').mockImplementation(() => {})
  jest.spyOn(AccessibilityInfo, 'announceForAccessibilityWithOptions').mockImplementation(() => {})
  jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(false)
  jest.spyOn(AccessibilityInfo, 'isReduceTransparencyEnabled').mockResolvedValue(false)
  jest.spyOn(AccessibilityInfo, 'isBoldTextEnabled').mockResolvedValue(false)
})
afterEach(() => jest.useRealTimers())

/**
 * Mount a door and press it. The check-in is left running, waiting on its pour,
 * so its promise comes back in a box: an async function returning it bare
 * would wait for it.
 */
async function checkIn(outcome: CheckInOutcome) {
  submit.mockResolvedValue(outcome)
  await render(<Door eventId="e1" {...props} />)
  let done!: Promise<string>
  await act(async () => {
    done = flow.start()
  })
  return { done }
}

describe('a check-in', () => {
  it('goes straight to the request: no rules tray, nothing to agree to', async () => {
    await checkIn(fresh())
    expect(submit).toHaveBeenCalledWith('e1', { latitude: 12.97, longitude: 77.59, accuracy: 8 })
    // Nothing asked before the request, and nothing after it but the pour.
    expect(props.showTray).not.toHaveBeenCalled()
  })

  it('a fresh one pours once, with one H.success, and enters the room as the pour hands off', async () => {
    const { done } = await checkIn(fresh())
    expect(props.onCheckedIn).toHaveBeenCalledWith(fresh())
    expect(flow.youreIn).toBe(true)
    expect(screen.getAllByTestId('pour', HIDDEN)).toHaveLength(1)
    await advance(699)
    expect(props.onEnterRoom).not.toHaveBeenCalled()
    await advance(1)
    expect(props.onEnterRoom).toHaveBeenCalledTimes(1)
    expect(await done).toBe('checkedIn')
    expect(flow.youreIn).toBe(false)
    await advance(1000)
    // The pour's haptic is the check-in's only one: the hook plays none of its own.
    expect(success).toHaveBeenCalledTimes(1)
    expect(success).toHaveBeenCalledWith({ important: true })
    // No "Checked in / Go to Chat" tray.
    expect(props.showTray).not.toHaveBeenCalled()
  })

  it('a tap skips the pour into the room at once', async () => {
    const { done } = await checkIn(fresh())
    await fireEvent.press(screen.getByTestId('pour-skip', HIDDEN))
    expect(await done).toBe('checkedIn')
    expect(props.onEnterRoom).toHaveBeenCalledTimes(1)
    expect(success).toHaveBeenCalledTimes(1)
  })

  it('a tap skips to the hand-off before a question too, and the pour still clears before the sheet', async () => {
    await checkIn(fresh({ askIntent: true }))
    await fireEvent.press(screen.getByTestId('pour-skip', HIDDEN))
    expect(router.push).not.toHaveBeenCalled()
    await advance(DURATION.base)
    expect(router.push).toHaveBeenCalledWith(askIntentRoute('e1'))
    expect(success).toHaveBeenCalledTimes(1)
  })

  it('asks "Why do you go out?" only once the pour has played out and cleared, then the room once it is answered', async () => {
    const { done } = await checkIn(fresh({ askIntent: true }))
    expect(flow.asks).toBe(true)
    expect(router.push).not.toHaveBeenCalled()
    // Not at the Room's 700 ms: "You're in." is held readable to ASK_AT, then the pour fades.
    await advance(ROOM_AT)
    expect(router.push).not.toHaveBeenCalled()
    await advance(ASK_AT - ROOM_AT)
    // The fade has started, not finished: the question waits for it.
    expect(router.push).not.toHaveBeenCalled()
    await advance(DURATION.base - 1)
    expect(router.push).not.toHaveBeenCalled()
    await advance(1)
    expect(router.push).toHaveBeenCalledWith(askIntentRoute('e1'))
    // Flow 4 Tonight #14: the sheet is over the screen the pour cleared onto; the room waits for it.
    await advance(5000)
    expect(props.onEnterRoom).not.toHaveBeenCalled()
    expect(flow.youreIn).toBe(true)
    await act(async () => intentAnswered())
    expect(await done).toBe('checkedIn')
    expect(props.onEnterRoom).toHaveBeenCalledTimes(1)
  })

  it('a question closed for a link (abandoned) does not go on to the room: they went elsewhere (review MED-2)', async () => {
    const { done } = await checkIn(fresh({ askIntent: true }))
    await fireEvent.press(screen.getByTestId('pour-skip', HIDDEN))
    await advance(DURATION.base)
    expect(router.push).toHaveBeenCalledWith(askIntentRoute('e1'))

    await act(async () => intentAnswered('abandoned'))

    expect(await done).toBe('checkedIn')
    expect(props.onEnterRoom).not.toHaveBeenCalled()
    // SCRUM-977: no room comes to step aside onto, so the pour goes too, rather than leaving its scrim over the page.
    expect(flow.pours).toBe(0)
    expect(screen.queryByTestId('pour', HIDDEN)).toBeNull()
  })

  it('a pour whose check-in fails after it (the reveal offer throwing) clears too, leaving the failure sheet over the page', async () => {
    offer.mockRejectedValueOnce(new Error('offline'))
    const { done } = await checkIn(fresh({ revealSuggestion: true }))
    await fireEvent.press(screen.getByTestId('pour-skip', HIDDEN))
    await advance(DURATION.base)

    expect(await done).toBe('failed')
    expect(props.showTray).toHaveBeenCalledWith('Check-in failed', expect.any(String), expect.any(Array), expect.anything())
    expect(screen.queryByTestId('pour', HIDDEN)).toBeNull()
  })

  it('the next pour after a cleared one is a new pour, not the old one remounted', async () => {
    const { done } = await checkIn(fresh({ askIntent: true }))
    await fireEvent.press(screen.getByTestId('pour-skip', HIDDEN))
    await advance(DURATION.base)
    await act(async () => intentAnswered('abandoned'))
    await done
    submit.mockResolvedValue(fresh())
    await act(async () => {
      void flow.start()
    })
    expect(flow.pours).toBe(2)
    expect(screen.getByTestId('pour', HIDDEN)).toBeTruthy()
  })

  it('offers the reveal after the pour has cleared, then the intent, then the room', async () => {
    offer.mockResolvedValue({ title: 'Show who you are?', message: 'm', confirm: 'Show me', cancel: 'Not now' })
    const { done } = await checkIn(fresh({ revealSuggestion: true, askIntent: true }))
    expect(props.showTray).not.toHaveBeenCalled()
    await advance(ASK_AT)
    await advance(DURATION.base - 1)
    expect(props.showTray).not.toHaveBeenCalled()
    await advance(1)
    expect(props.showTray).toHaveBeenCalledTimes(1)
    const [title, , buttons] = props.showTray.mock.calls[0]
    expect(title).toBe('Show who you are?')
    await act(async () => buttons!.find((b) => b.label === 'Show me')!.onPress())
    expect(props.closeTray).toHaveBeenCalled()
    expect(apiClient.setMatchPreferences).toHaveBeenCalledWith('e1', { revealed: true })
    // The question waits for the tray to leave (iOS drops a push made while it is).
    await advance(1000)
    expect(router.push).toHaveBeenCalledWith(askIntentRoute('e1'))
    expect(props.onEnterRoom).not.toHaveBeenCalled()
    await act(async () => intentAnswered())
    await done
    expect(props.onEnterRoom).toHaveBeenCalledTimes(1)
  })

  it('a reveal offer closed from its backdrop is a "no", and the room still comes', async () => {
    offer.mockResolvedValue({ title: 'Show who you are?', message: 'm', confirm: 'Show me', cancel: 'Not now' })
    const { done } = await checkIn(fresh({ revealSuggestion: true }))
    await advance(ASK_AT)
    await advance(DURATION.base)
    expect(props.showTray).toHaveBeenCalledTimes(1)
    await act(async () => flow.dismissTray())
    await done
    expect(apiClient.setMatchPreferences).not.toHaveBeenCalled()
    expect(props.onEnterRoom).toHaveBeenCalledTimes(1)
  })

  it('"You were already in" is a quiet way in: no sheet, no pour, no haptic, straight into the room (ROUND3 C12)', async () => {
    const already: CheckInOutcome = {
      kind: 'refused',
      refusal: { title: 'Already checked in', message: 'You’re already in.', offerDirections: false },
      errorCode: 'ALREADY_CHECKED_IN',
      alreadyCheckedIn: true,
    } as CheckInOutcome
    expect(await (await checkIn(already)).done).toBe('checkedIn')
    expect(props.onCheckedIn).toHaveBeenCalledWith(already)
    expect(props.showTray).not.toHaveBeenCalled()
    expect(props.onEnterRoom).toHaveBeenCalledTimes(1)
    expect(screen.queryByTestId('pour', HIDDEN)).toBeNull()
    await advance(1000)
    expect(success).not.toHaveBeenCalled()
    expect(error).not.toHaveBeenCalled()
  })
})

describe('the sheets it asks for (Flow 4 Tonight #15–#22)', () => {
  const refused = (errorCode: string, title: string, offerDirections = false): CheckInOutcome =>
    ({ kind: 'refused', refusal: { ...checkInRefusal(errorCode, 'The server’s sentence.'), title, offerDirections }, errorCode, alreadyCheckedIn: false }) as CheckInOutcome
  const buttons = () => (props.showTray.mock.calls[0][2] as { label: string; kind?: string }[]).map((b) => [b.label, b.kind])

  it('Not quite there yet: the server’s sentence, map-pin, Open Maps (lit) and Close, one H.error', async () => {
    const { done } = await checkIn(refused('OUT_OF_RANGE', 'Not quite there yet', true))
    expect(await done).toBe('refused')
    expect(props.showTray).toHaveBeenCalledWith('Not quite there yet', 'The server’s sentence.', expect.any(Array), { icon: 'map-pin' })
    expect(buttons()).toEqual([['Close', 'tertiary'], ['Open Maps', 'lit']])
    expect(error).toHaveBeenCalledTimes(1)
    expect(success).not.toHaveBeenCalled()
  })

  it.each([
    ['EVENT_NOT_STARTED', 'Doors aren’t open', 'door-closed'],
    ['EVENT_ENDED', 'This one’s over', 'moon'],
    ['AGE_RESTRICTED', 'Not open to you', 'circle-slash'],
  ])('%s: its glyph and one Close', async (code, title, icon) => {
    await checkIn(refused(code, title))
    expect(props.showTray).toHaveBeenCalledWith(title, 'The server’s sentence.', expect.any(Array), { icon })
    expect(buttons()).toEqual([['Close', 'secondary']])
  })

  describe('the refusals with a fix (Flow 15 15.22)', () => {
    const outcome = (errorCode: string, message: string): CheckInOutcome =>
      ({ kind: 'refused', refusal: checkInRefusal(errorCode, message), errorCode, alreadyCheckedIn: false }) as CheckInOutcome

    it.each([
      ['FORBIDDEN', 'Finish setting up your profile first. Blend\'n is for people 18 and over.', 'Finish your profile first', 'Finish profile', 'user-round-pen'],
      ['PROFILE_INCOMPLETE', 'whatever the server says', 'Finish your profile first', 'Finish profile', 'user-round-pen'],
      ['AGE_RESTRICTED', 'This event is 18+. Add your age to your profile to check in.', 'Add your age to check in', 'Add your age', 'calendar'],
      ['AGE_UNKNOWN', 'whatever the server says', 'Add your age to check in', 'Add your age', 'calendar'],
    ])('%s: the frame’s sheet with the fix as the primary and Not now beside it, and no haptic of its own', async (code, message, title, fix, icon) => {
      const { done } = await checkIn(outcome(code, message))
      expect(await done).toBe('refused')
      expect(props.showTray).toHaveBeenCalledWith(title, expect.any(String), expect.any(Array), { icon })
      expect(buttons()).toEqual([['Not now', 'tertiary'], [fix, 'primary']])
      // "A refusal never carries a haptic; the fix does": no H.error as the sheet opens.
      expect(error).not.toHaveBeenCalled()
    })

    it('the fix closes the sheet and opens Edit profile; Not now only closes', async () => {
      await checkIn(outcome('AGE_UNKNOWN', 'x'))
      const [notNow, fix] = props.showTray.mock.calls[0][2] as { onPress: () => void }[]
      notNow.onPress()
      expect(router.push).not.toHaveBeenCalledWith('/edit-profile')
      fix.onPress()
      expect(props.closeTray).toHaveBeenCalled()
      expect(router.push).toHaveBeenCalledWith('/edit-profile')
    })

    it('an age the server knows is under the event’s gets no fix: a plain "Not open to you"', async () => {
      await checkIn(outcome('AGE_RESTRICTED', 'This event is 21+.'))
      expect(props.showTray).toHaveBeenCalledWith('Not open to you', 'This event is 21+.', expect.any(Array), { icon: 'circle-slash' })
      expect(buttons()).toEqual([['Close', 'secondary']])
    })
  })

  it('a failure on our side offers Try again, which runs the check-in again', async () => {
    await checkIn(refused('INTERNAL', 'Check-in failed'))
    expect(props.showTray).toHaveBeenCalledWith('Check-in failed', 'The server’s sentence.', expect.any(Array), { icon: 'cloud-off' })
    expect(buttons()).toEqual([['Close', 'tertiary'], ['Try again', 'primary']])
    submit.mockClear()
    await act(async () => (props.showTray.mock.calls[0][2] as { label: string; onPress: () => void }[])[1].onPress())
    expect(submit).toHaveBeenCalledTimes(1)
  })

  it('the server timing out: "Still checking you in", hourglass, Retry resumes it', async () => {
    await checkIn({ kind: 'timeout' } as CheckInOutcome)
    expect(props.showTray).toHaveBeenCalledWith(
      'Still checking you in',
      'The server hasn’t answered yet. Your hold still counts.',
      expect.any(Array),
      { icon: 'hourglass' }
    )
    expect(buttons()).toEqual([['Cancel', 'tertiary'], ['Retry', 'primary']])
  })
})

describe('the hold under a tray (Flow 4 Tonight #15, #23–#26: "Your hold still counts")', () => {
  const { getCurrentLocation } = jest.requireMock('../lib/locationFix') as { getCurrentLocation: jest.Mock }

  it('a location tray keeps the pass full until it closes; then it drains', async () => {
    let trays!: { closeTray: () => void; onRetry: () => void }
    getCurrentLocation.mockImplementationOnce(async (t: typeof trays) => {
      trays = t
      return null
    })
    const { done } = await checkIn(fresh())
    expect(await done).toBe('failed')
    expect(flow.checkingIn).toBe(true)
    await act(async () => trays.closeTray())
    expect(props.closeTray).toHaveBeenCalled()
    expect(flow.checkingIn).toBe(false)
  })

  it('its Try again resumes the check-in, and the pass stays full through it', async () => {
    let trays!: { closeTray: () => void; onRetry: () => void }
    getCurrentLocation.mockImplementationOnce(async (t: typeof trays) => {
      trays = t
      return null
    })
    await checkIn(fresh())
    submit.mockClear()
    await act(async () => {
      trays.closeTray()
      trays.onRetry()
    })
    expect(submit).toHaveBeenCalledTimes(1)
    expect(flow.checkingIn).toBe(true)
  })

  it('the server’s timeout keeps it full too; Cancel drains it', async () => {
    await checkIn({ kind: 'timeout' } as CheckInOutcome)
    expect(flow.checkingIn).toBe(true)
    const cancel = (props.showTray.mock.calls[0][2] as { label: string; onPress: () => void }[]).find((b) => b.label === 'Cancel')!
    await act(async () => cancel.onPress())
    expect(flow.checkingIn).toBe(false)
  })

  it('a refusal drains at once (#16–#22)', async () => {
    await checkIn({ kind: 'refused', refusal: checkInRefusal('EVENT_ENDED', 'Over.'), errorCode: 'EVENT_ENDED', alreadyCheckedIn: false } as CheckInOutcome)
    expect(flow.checkingIn).toBe(false)
  })
})

describe('every door is this flow', () => {
  const read = (file: string) =>
    readFileSync(join(__dirname, '..', file), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')

  it.each(['components/blendn/BlendnScreen.tsx'])(
    '%s runs it, draws its pour and lets it hear the tray close',
    (file) => {
      const src = read(file)
      expect(src).toContain('useCheckInFlow({')
      expect(src).toMatch(/<MomentPour[^>]*key=\{(checkIn\.)?pours\}[^>]*onDone=\{(?:(checkIn\.)?pourDone|onPourDone)\}/)
      // The overlay's wrapper (the pour's timeline, for the hidden Room mount) still hands the flow its pourDone.
      if (src.includes('onDone={onPourDone}')) expect(src).toMatch(/useLatest\(checkIn\.pourDone\)[\s\S]*pourDoneNow\.current\(\)/)
      // Without it a question comes up over a pour still on screen (the bug ASK_AT fixed).
      expect(src).toMatch(/<MomentPour[^>]*asks=\{(checkIn\.)?asks\}/)
      expect(src).toMatch(/onClose=\{(checkIn\.)?dismissTray\}/)
    }
  )

  it('the event page’s "Blend in" is the hold: this flow, from the page, with no stop in Tonight (SCRUM-966)', () => {
    const src = read('components/screens/EventDetailScreen.tsx')
    // The page itself still sends nothing: the hook is `useEventCheckIn`, which runs this one flow.
    expect(src).not.toContain('useCheckInFlow(')
    expect(src).not.toContain('submitCheckIn(')
    expect(src).toContain('useEventCheckIn(')
    expect(read('components/scene/useEventCheckIn.tsx')).toContain('useCheckInFlow({')
    // To the tabs first: the overlay is under the root stack.
    expect(src).toContain("router.dismissTo('/(tabs)/events')")
    expect(read('components/scene/useEventCheckIn.tsx')).toContain("router.dismissTo('/(tabs)/events')")
  })

  it('the Pulse’s "Blend in" opens the Blend’n pass rather than checking in on its own', () => {
    // A check-in always goes through the hold (docs/redesign/SCREENS.md, Pulse).
    const src = read('app/(tabs)/events.tsx')
    expect(src).not.toContain('submitCheckIn(')
    // The peek's Check in item (the frame's label) is the pass's hold: it only ever opens the overlay.
    expect(src).toMatch(/action === 'checkIn'\) return openBlendn\(\)/)
  })
})

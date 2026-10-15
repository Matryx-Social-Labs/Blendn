/**
 * The check-in, as every door runs it (`lib/useCheckInFlow.ts`).
 *
 * The owner removed the "Rules and regulations" tray (docs/redesign/SCREENS.md,
 * Flow 4: the press or the hold is the consent), and the design puts the pour
 * where the "Checked in / Go to Chat" tray and the confetti were (DESIGN-BRIEF
 * §9.3 #9). A fresh check-in pours straight into the room; the reveal offer and
 * "Why do you go out?" (SCRUM-77) still follow it, because they are about the
 * user, not the screen.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import { readFileSync } from 'fs'
import { join } from 'path'
import React from 'react'
import { AccessibilityInfo } from 'react-native'

import { MomentPour } from '../components/ds/MomentPour'
import { apiClient } from '../lib/apiClient'
import { askIntentRoute, revealOffer, submitCheckIn, type CheckInOutcome } from '../lib/checkIn'
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
jest.mock('../lib/locationFix', () => ({ getCurrentLocation: jest.fn(async () => ({ latitude: 12.97, longitude: 77.59, accuracy: 8 })) }))
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
  ...o,
})

let flow: ReturnType<typeof useCheckInFlow>
/** A door as the two screens draw one: the hook, and its pour while `pours` is above 0. */
function Door(props: UseCheckInFlowOptions) {
  flow = useCheckInFlow(props)
  return flow.pours > 0 ? <MomentPour key={flow.pours} venue="Toit" onDone={flow.pourDone} testID="pour" /> : null
}

let props: jest.Mocked<Required<Pick<UseCheckInFlowOptions, 'showTray' | 'closeTray' | 'onCheckedIn' | 'onOpenChat'>>>
let success: jest.SpyInstance
let error: jest.SpyInstance
beforeEach(() => {
  jest.useFakeTimers()
  props = { showTray: jest.fn(), closeTray: jest.fn(), onCheckedIn: jest.fn(), onOpenChat: jest.fn(async () => {}) }
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

  it('a fresh one pours once, with one H.success, and hands off into the room as the pour does', async () => {
    const { done } = await checkIn(fresh())
    expect(props.onCheckedIn).toHaveBeenCalledWith(fresh())
    expect(screen.getAllByTestId('pour', HIDDEN)).toHaveLength(1)
    await advance(699)
    expect(props.onOpenChat).not.toHaveBeenCalled()
    await advance(1)
    expect(props.onOpenChat).toHaveBeenCalledTimes(1)
    expect(await done).toBe('checkedIn')
    await advance(1000)
    // The pour's haptic is the check-in's only one: the hook plays none of its own.
    expect(success).toHaveBeenCalledTimes(1)
    expect(success).toHaveBeenCalledWith({ important: true })
    expect(screen.getAllByTestId('pour', HIDDEN)).toHaveLength(1)
    // No "Checked in / Go to Chat" tray: the pour went straight into the room.
    expect(props.showTray).not.toHaveBeenCalled()
  })

  it('a tap skips the pour into the room at once', async () => {
    const { done } = await checkIn(fresh())
    await fireEvent.press(screen.getByTestId('pour-skip', HIDDEN))
    expect(await done).toBe('checkedIn')
    expect(props.onOpenChat).toHaveBeenCalledTimes(1)
    expect(success).toHaveBeenCalledTimes(1)
  })

  it('asks "Why do you go out?" on top of the room, after the hand-off', async () => {
    const { done } = await checkIn(fresh({ askIntent: true }))
    expect(router.push).not.toHaveBeenCalled()
    await advance(700)
    await done
    expect(props.onOpenChat).toHaveBeenCalledTimes(1)
    expect(router.push).toHaveBeenCalledWith(askIntentRoute('e1'))
    expect(props.onOpenChat.mock.invocationCallOrder[0]).toBeLessThan(router.push.mock.invocationCallOrder[0])
  })

  it('offers the reveal once the pour has handed off, and its answer enters the room', async () => {
    offer.mockResolvedValue({ title: 'Show who you are?', message: 'm', confirm: 'Show me', cancel: 'Not now' })
    const { done } = await checkIn(fresh({ revealSuggestion: true, askIntent: true }))
    expect(props.showTray).not.toHaveBeenCalled()
    await advance(700)
    await done
    expect(props.showTray).toHaveBeenCalledTimes(1)
    const [title, , buttons] = props.showTray.mock.calls[0]
    expect(title).toBe('Show who you are?')
    // The offer is the room's door here: nothing enters before it is answered.
    expect(props.onOpenChat).not.toHaveBeenCalled()
    await act(async () => buttons!.find((b) => b.label === 'Show me')!.onPress())
    expect(props.closeTray).toHaveBeenCalled()
    expect(apiClient.setMatchPreferences).toHaveBeenCalledWith('e1', { revealed: true })
    expect(props.onOpenChat).toHaveBeenCalledTimes(1)
    expect(router.push).toHaveBeenCalledWith(askIntentRoute('e1'))
  })

  it('"You were already in" is a quiet way in: no pour, no success haptic', async () => {
    const already: CheckInOutcome = {
      kind: 'refused',
      refusal: { title: 'Already checked in', message: 'You’re already in.', offerDirections: false },
      errorCode: 'ALREADY_CHECKED_IN',
      alreadyCheckedIn: true,
    } as CheckInOutcome
    expect(await (await checkIn(already)).done).toBe('checkedIn')
    expect(props.onCheckedIn).toHaveBeenCalledWith(already)
    expect(screen.queryByTestId('pour', HIDDEN)).toBeNull()
    await advance(1000)
    expect(success).not.toHaveBeenCalled()
    expect(error).not.toHaveBeenCalled()
  })
})

describe('every door is this flow', () => {
  const read = (file: string) =>
    readFileSync(join(__dirname, '..', file), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')

  it.each(['components/screens/EventDetailScreen.tsx', 'components/blendn/BlendnScreen.tsx'])(
    '%s runs it and draws its pour, not confetti',
    (file) => {
      const src = read(file)
      expect(src).toContain('useCheckInFlow({')
      expect(src).toMatch(/<MomentPour key=\{(checkIn\.)?pours\}[^>]*onDone=\{(checkIn\.)?pourDone\}/)
      expect(src).not.toContain('ConfettiBurst')
    }
  )

  it('the Pulse’s "Blend in" opens the Blend’n pass rather than checking in on its own', () => {
    // A check-in always goes through the hold (docs/redesign/SCREENS.md, Pulse).
    const src = read('app/(tabs)/events.tsx')
    expect(src).not.toContain('submitCheckIn(')
    expect(src).toMatch(/label: 'Blend in',[\s\S]{0,200}closeTray\(\)\s*openBlendn\(\)/)
  })
})

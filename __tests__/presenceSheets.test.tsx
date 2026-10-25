/**
 * What the presence monitor says (Flow 7 sheet frames 08, 09), on the one DS Sheet: "Still at the event?" is a question
 * that must be answered (no handle, no Cancel, back and the scrim ignored), "I'm still here" plays nothing, "Check me out"
 * plays the destructive tick on press-in, and the automatic checkout is a calm notice with no haptic.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native'

jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default)
jest.mock('expo-glass-effect', () => {
  const { View } = jest.requireActual('react-native')
  return { GlassView: (props: object) => <View {...props} />, isGlassEffectAPIAvailable: jest.fn(() => true), isLiquidGlassAvailable: jest.fn(() => true) }
})
jest.mock('expo-linear-gradient', () => {
  const { View } = jest.requireActual('react-native')
  return { LinearGradient: (props: object) => <View {...props} /> }
})
jest.mock('../lib/haptics', () => ({ H: { destructive: jest.fn(), primary: jest.fn(), detent: jest.fn(), select: jest.fn() } }))

/* eslint-disable import/first */
import { PresenceSheets } from '../components/PresenceSheets'
import { H } from '../lib/haptics'
import { PRESENCE_COPY } from '../lib/presence'
/* eslint-enable import/first */

const mount = async (o: Partial<React.ComponentProps<typeof PresenceSheets>> = {}) => {
  const props = { asking: true, onStay: jest.fn(), onLeave: jest.fn(), notice: false, onNoticeDone: jest.fn(), ...o }
  await render(<PresenceSheets {...props} />)
  return { props }
}
beforeEach(() => jest.clearAllMocks())

describe('Still at the event?', () => {
  it('says why it asks, in the frame’s words, and offers exactly two ways to answer', async () => {
    await mount()
    expect(await screen.findByText('Still at the event?')).toBeTruthy()
    expect(screen.getByText(PRESENCE_COPY.ask.body)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'I’m still here' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Check me out' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Cancel|Dismiss/ })).toBeNull()
  })

  it('cannot be dismissed: no handle, back and the backdrop do nothing', async () => {
    const { props } = await mount()
    await screen.findByText('Still at the event?')
    expect(screen.queryByTestId('presence-ask-handle', { includeHiddenElements: true })).toBeNull()
    await fireEvent(screen.getByTestId('presence-ask-modal'), 'requestClose')
    expect(props.onStay).not.toHaveBeenCalled()
    expect(props.onLeave).not.toHaveBeenCalled()
  })

  it('I’m still here records the reprieve and plays nothing', async () => {
    const { props } = await mount()
    const stay = await screen.findByRole('button', { name: 'I’m still here' })
    await act(async () => fireEvent(stay, 'pressIn'))
    fireEvent.press(stay)
    expect(props.onStay).toHaveBeenCalledTimes(1)
    expect(H.destructive).not.toHaveBeenCalled()
    expect(H.primary).not.toHaveBeenCalled()
  })

  it('Check me out plays the destructive tick on press-in, once, and checks out', async () => {
    const { props } = await mount()
    const leave = await screen.findByRole('button', { name: 'Check me out' })
    await act(async () => fireEvent(leave, 'pressIn'))
    expect(H.destructive).toHaveBeenCalledTimes(1)
    fireEvent.press(leave)
    expect(props.onLeave).toHaveBeenCalledTimes(1)
    expect(H.destructive).toHaveBeenCalledTimes(1)
  })
})

describe('Checked out (automatic)', () => {
  it('is a calm notice: the copy, one Got it, no haptic, dismissible', async () => {
    const { props } = await mount({ asking: false, notice: true })
    expect(await screen.findByText('Checked out')).toBeTruthy()
    expect(screen.getByText(PRESENCE_COPY.autoCheckedOut.body)).toBeTruthy()
    const done = screen.getByRole('button', { name: 'Got it' })
    await act(async () => fireEvent(done, 'pressIn'))
    fireEvent.press(done)
    expect(props.onNoticeDone).toHaveBeenCalledTimes(1)
    expect(H.destructive).not.toHaveBeenCalled()
    expect(H.primary).not.toHaveBeenCalled()
    fireEvent.press(screen.getByRole('button', { name: 'Dismiss' }))
    expect(props.onNoticeDone).toHaveBeenCalledTimes(2)
  })

  it('draws neither sheet when there is nothing to say', async () => {
    await mount({ asking: false, notice: false })
    expect(screen.queryByText('Still at the event?')).toBeNull()
    expect(screen.queryByText('Checked out')).toBeNull()
  })
})

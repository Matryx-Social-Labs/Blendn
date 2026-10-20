/*
 * Make a crew's steps (audit H4, DS Flow 10 · 10.2): 24 pt in the direction of travel, never the screen's width; back comes
 * from the left; the old step leaves instead of being cut; Reduce Motion fades in place.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'

jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() } }))
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }))
jest.mock('../lib/apiClient', () => ({ apiClient: { getFriends: jest.fn() } }))
jest.mock('../lib/crewsApi', () => ({ crewsApi: { create: jest.fn(), crew: jest.fn() } }))
let mockRM = false
jest.mock('../lib/motion', () => ({ ...jest.requireActual('../lib/motion'), useReducedMotion: () => mockRM }))

import NewCrewScreen from '../app/crews/new'
import { stepIn, stepOut, STEP_SHIFT } from '../components/crews/stepMotion'
import { apiClient } from '../lib/apiClient'

const api = apiClient as jest.Mocked<typeof apiClient>

const at = (v: 1 | -1) => ({ get: () => v })

describe('the builders', () => {
  it('forward comes from the right by 24, back from the left, and reduce motion from nowhere', () => {
    expect(STEP_SHIFT).toBe(24)
    expect(stepIn(at(1), false)().initialValues.transform[0].translateX).toBe(24)
    expect(stepIn(at(-1), false)().initialValues.transform[0].translateX).toBe(-24)
    expect(stepIn(at(1), true)().initialValues.transform[0].translateX).toBe(0)
    expect(stepIn(at(-1), true)().initialValues.opacity).toBe(0)
  })

  it('the old step leaves with a short drift the way it was going, and only fades under reduce motion', () => {
    const out = stepOut(at(1), false)()
    expect(out.initialValues).toEqual({ opacity: 1, transform: [{ translateX: 0 }] })
    expect(stepOut(at(1), true)().initialValues.opacity).toBe(1)
  })
})

describe('the screen', () => {
  beforeEach(() => {
    mockRM = false
    api.getFriends.mockResolvedValue({ success: true, data: { friends: [{ userId: 'u1', name: 'Priya', photo: null, since: '2026-09-01T00:00:00Z' }], count: 1 } })
  })
  const stepNode = () => screen.getByTestId('make-step', { includeHiddenElements: true })
  const entering = () => (stepNode().props.entering ?? stepNode().parent?.props.entering) as () => { initialValues: { transform: { translateX: number }[] } }

  it('Next brings the step from the right, and going back brings it from the left', async () => {
    await render(<NewCrewScreen />)
    await fireEvent.changeText(screen.getByTestId('make-name-input'), 'Nebula')
    await fireEvent.press(screen.getByLabelText('Next'))
    await waitFor(() => screen.getByLabelText('Step 2 of 3, Invite friends'))
    expect(entering()().initialValues.transform[0].translateX).toBe(24)
    await fireEvent(screen.getByTestId('make-modal'), 'requestClose')
    await waitFor(() => screen.getByLabelText('Step 1 of 3, Name and vibe'))
    expect(entering()().initialValues.transform[0].translateX).toBe(-24)
  })

  it('Reduce Motion: no travel either way', async () => {
    mockRM = true
    await render(<NewCrewScreen />)
    await fireEvent.changeText(screen.getByTestId('make-name-input'), 'Nebula')
    await fireEvent.press(screen.getByLabelText('Next'))
    await waitFor(() => screen.getByLabelText('Step 2 of 3, Invite friends'))
    expect(entering()().initialValues.transform[0].translateX).toBe(0)
  })

  it('has an exit, so the old step is not cut', async () => {
    await render(<NewCrewScreen />)
    expect(typeof (stepNode().props.exiting ?? stepNode().parent?.props.exiting)).toBe('function')
  })
})

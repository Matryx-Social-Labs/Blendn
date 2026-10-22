/**
 * After the night (Flow 3 `rate`), state by state: the skeleton that stands in for the form, the failed load that
 * never says "Nothing to rate", the night, a person (Submit docked, issues as a radio group, the note as a TextArea),
 * and the three ways it ends. Behaviour is unchanged from before the rebuild: one tap sends the night; Submit sends
 * a person.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'

jest.mock('../lib/logger', () => ({ Logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() } }))
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
  useLocalSearchParams: () => ({ eventId: 'e1' }),
}))
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 47, bottom: 34, left: 0, right: 0 }),
  SafeAreaView: 'View',
}))
jest.mock('../lib/apiClient', () => ({
  apiClient: {
    getRatablePeers: jest.fn(),
    getConversations: jest.fn(),
    getEvent: jest.fn(),
    getMyEventRating: jest.fn(),
    rateEvent: jest.fn(),
    ratePeer: jest.fn(),
  },
}))
// The session's rated nights are module state: a fake keeps each test its own.
jest.mock('../lib/ratedNights', () => ({ isNightRated: jest.fn(() => false), markNightRated: jest.fn() }))
const mockShowToast = jest.fn()
jest.mock('../components/Toast', () => ({ useToast: () => ({ showToast: mockShowToast }), useToastDock: () => {} }))

/* eslint-disable import/first */
import { router } from 'expo-router'
import { markOffline, markOnline } from '../lib/networkStatus'
import RatePeers from '../app/rate/[eventId]'
import { apiClient } from '../lib/apiClient'
/* eslint-enable import/first */

const api = apiClient as jest.Mocked<typeof apiClient>

function loads({ peers = ['u1', 'u2'], rated = false }: { peers?: string[]; rated?: boolean } = {}) {
  api.getRatablePeers.mockResolvedValue({ success: true, data: { userIds: peers } } as never)
  api.getConversations.mockResolvedValue({
    success: true,
    data: peers.map((id, i) => ({ otherUser: { id, name: i ? 'Quiet Fox' : 'Night Cat', image: null } })),
  } as never)
  api.getEvent.mockResolvedValue({ success: true, data: { title: 'Vinyl Night' } } as never)
  api.getMyEventRating.mockResolvedValue({ success: true, data: rated ? { rating: 4, ratedAt: 'x' } : { rating: null } } as never)
}

beforeEach(() => {
  jest.clearAllMocks()
  markOnline()
  api.rateEvent.mockResolvedValue({ success: true } as never)
  api.ratePeer.mockResolvedValue({ success: true } as never)
})
const view = async () => {
  await render(<RatePeers />)
  await act(async () => {})
}

it('shows a skeleton while it loads, not a lone spinner, and the close is first', async () => {
  api.getRatablePeers.mockReturnValue(new Promise(() => {}) as never)
  api.getConversations.mockReturnValue(new Promise(() => {}) as never)
  api.getEvent.mockReturnValue(new Promise(() => {}) as never)
  api.getMyEventRating.mockReturnValue(new Promise(() => {}) as never)
  await render(<RatePeers />)
  expect(screen.getByTestId('rate-skeleton').props.accessibilityState).toMatchObject({ busy: true })
  expect(screen.getByRole('button', { name: 'Close' })).toBeTruthy()
})

it('a failed load says so and offers Try again; it never says "Nothing to rate"', async () => {
  api.getRatablePeers.mockResolvedValue({ success: false, error: 'x' } as never)
  api.getConversations.mockResolvedValue({ success: true, data: [] } as never)
  api.getEvent.mockResolvedValue({ success: true, data: {} } as never)
  api.getMyEventRating.mockResolvedValue({ success: true, data: { rating: null } } as never)
  await view()
  expect(await screen.findByText('Couldn’t load who you met')).toBeTruthy()
  expect(screen.queryByText('Nothing to rate')).toBeNull()
  loads()
  await fireEvent.press(screen.getByRole('button', { name: 'Try again' }))
  expect(await screen.findByText('How was Vinyl Night?')).toBeTruthy()
})

it('the night: one tap on a number sends it and moves to the first person', async () => {
  loads()
  await view()
  await fireEvent.press(await screen.findByLabelText(/^The night: 5 out of 5, Loved it/))
  await waitFor(() => expect(api.rateEvent).toHaveBeenCalledWith('e1', 5))
  expect(await screen.findByText('Night Cat')).toBeTruthy()
  expect(screen.getByTestId('rate-progress').props.children.join('')).toBe('1 of 2')
})

it('a person: Submit is docked and disabled until a rating; issues are one radio group; the note is labelled', async () => {
  loads()
  await view()
  await fireEvent.press(await screen.findByRole('button', { name: 'Skip to the people' }))
  expect(await screen.findByText('Night Cat')).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Submit' }).props.accessibilityState).toMatchObject({ disabled: true })
  expect(screen.getAllByRole('radio')).toHaveLength(5)
  expect(screen.getByLabelText('Anything you want to tell us?')).toBeTruthy()

  await fireEvent.press(screen.getByLabelText(/^Meeting Night Cat: 4 out of 5/))
  await fireEvent.press(screen.getByRole('radio', { name: 'They made me uncomfortable' }))
  await fireEvent.changeText(screen.getByLabelText('Anything you want to tell us?'), '  too close  ')
  await fireEvent.press(screen.getByRole('button', { name: 'Submit' }))
  await waitFor(() =>
    expect(api.ratePeer).toHaveBeenCalledWith('e1', { userId: 'u1', rating: 4, issue: 'uncomfortable', note: 'too close' })
  )
  expect(await screen.findByText('Quiet Fox')).toBeTruthy()
})

it('harassment says where it goes, in words, under the options', async () => {
  loads({ peers: ['u1'] })
  await view()
  await fireEvent.press(await screen.findByRole('button', { name: 'Skip to the people' }))
  await fireEvent.press(await screen.findByRole('radio', { name: 'They harassed me' }))
  expect(screen.getByText(/straight to our moderation team/)).toBeTruthy()
})

it('a note over the limit is refused by Submit, not truncated', async () => {
  loads({ peers: ['u1'] })
  await view()
  await fireEvent.press(await screen.findByRole('button', { name: 'Skip to the people' }))
  await fireEvent.press(await screen.findByLabelText(/^Meeting Night Cat: 3 out of 5/))
  await fireEvent.changeText(screen.getByLabelText('Anything you want to tell us?'), 'x'.repeat(501))
  expect(screen.getByText('Keep it to 500 characters.')).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Submit' }).props.accessibilityState).toMatchObject({ disabled: true })
})

it('a refused save toasts the fixed sentence with the error haptic and stays on the person', async () => {
  loads({ peers: ['u1'] })
  api.ratePeer.mockResolvedValue({ success: false, error: 'server words' } as never)
  await view()
  await fireEvent.press(await screen.findByRole('button', { name: 'Skip to the people' }))
  await fireEvent.press(await screen.findByLabelText(/^Meeting Night Cat: 2 out of 5/))
  await fireEvent.press(screen.getByRole('button', { name: 'Submit' }))
  await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith("Couldn’t save that. Try again.", 'error', { haptic: 'error' }))
  expect(screen.getByText('Night Cat')).toBeTruthy()
})

it('skipping everything ends on "All done / Nothing was sent", with Done docked', async () => {
  loads({ peers: [] })
  await view()
  await fireEvent.press(await screen.findByRole('button', { name: 'Skip' }))
  expect(await screen.findByText('All done')).toBeTruthy()
  expect(screen.getByText('Nothing was sent. You can come back to this from Going.')).toBeTruthy()
  await fireEvent.press(screen.getByRole('button', { name: 'Done' }))
  expect(router.back).toHaveBeenCalledTimes(1)
})

it('nobody to rate and nothing to ask is the server’s real answer: "Nothing to rate"', async () => {
  loads({ peers: [], rated: false })
  api.getMyEventRating.mockResolvedValue({ success: true, data: { rating: 3, ratedAt: null } } as never)
  await view()
  expect(await screen.findByText('Nothing to rate')).toBeTruthy()
})

it('offline: the banner says so, reads stay, and nothing is sent until it is back', async () => {
  loads({ peers: ['u1'] })
  await view()
  await fireEvent.press(await screen.findByRole('button', { name: 'Skip to the people' }))
  await fireEvent.press(await screen.findByLabelText(/^Meeting Night Cat: 4 out of 5/))
  await act(async () => markOffline())
  expect(screen.getByText('Offline. You can rate once you’re back.')).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Submit' }).props.accessibilityState).toMatchObject({ disabled: true })
  expect(screen.getByText('Night Cat')).toBeTruthy()
  await fireEvent.press(screen.getByRole('button', { name: 'Submit' }))
  expect(api.ratePeer).not.toHaveBeenCalled()
})

describe('the night is not open to rate (Flow 15 #11)', () => {
  it('a night that is gone is the shared card, one that goes back: never "Couldn’t load" with a retry', async () => {
    api.getRatablePeers.mockResolvedValue({ success: false, error: 'Event not found', errorCode: 'NOT_FOUND' } as never)
    api.getConversations.mockResolvedValue({ success: true, data: [] } as never)
    api.getEvent.mockResolvedValue({ success: false } as never)
    api.getMyEventRating.mockResolvedValue({ success: false } as never)
    await view()
    expect(await screen.findByText('Rating isn’t open for this night')).toBeTruthy()
    expect(screen.getByText('The window closed. Nothing else changes.')).toBeTruthy()
    expect(screen.queryByText('Couldn’t load who you met')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull()
    await fireEvent.press(screen.getByTestId('rate-gone'))
    expect(router.back).toHaveBeenCalled()
  })

  it('a send the server refuses as not open (403) ends on the same card, not a toast', async () => {
    loads()
    api.rateEvent.mockResolvedValue({ success: false, error: 'You can rate this event once it has ended', errorCode: 'FORBIDDEN' } as never)
    await view()
    await fireEvent.press(await screen.findByLabelText(/^The night: 5 out of 5, Loved it/))
    expect(await screen.findByText('Rating isn’t open for this night')).toBeTruthy()
    expect(mockShowToast).not.toHaveBeenCalled()
  })

  it('a refusal that is only a failure (500, no code) is still a toast and the form stays', async () => {
    loads()
    api.rateEvent.mockResolvedValue({ success: false, error: 'boom' } as never)
    await view()
    await fireEvent.press(await screen.findByLabelText(/^The night: 5 out of 5, Loved it/))
    await waitFor(() => expect(mockShowToast).toHaveBeenCalled())
    expect(screen.queryByText('Rating isn’t open for this night')).toBeNull()
  })
})

describe('the bar over a form that scrolls under it (#30)', () => {
  it('is at rest on the top of the form, glass once the form has moved, and at rest again for the next person', async () => {
    loads()
    await view()
    await fireEvent.press(await screen.findByLabelText(/^The night: 5 out of 5, Loved it/))
    const form = await screen.findByTestId('rate-submit')
    expect(form).toBeTruthy()
    expect(screen.queryByTestId('rate-bar-bar')).toBeNull()
    await fireEvent.scroll(screen.getByTestId('rate-form'), { nativeEvent: { contentOffset: { y: 40 } } })
    expect(screen.getByTestId('rate-bar-bar')).toBeTruthy()
    // Skip to the next person: a new form, at its top.
    await fireEvent.press(screen.getByTestId('rate-skip-person'))
    await waitFor(() => expect(screen.queryByTestId('rate-bar-bar')).toBeNull())
  })
})

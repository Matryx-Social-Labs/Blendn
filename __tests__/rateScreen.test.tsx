/**
 * After the night (Flow 3 `rate`), state by state: the skeleton that stands in for the form, the failed load that
 * never says "Nothing to rate", the night, a person (Submit docked, issues as a radio group, the note as a TextArea),
 * and the three ways it ends. Behaviour is unchanged from before the rebuild: one tap sends the night; Submit sends
 * a person.
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native'
import { AccessibilityInfo, Dimensions, Keyboard, ScrollView, StyleSheet } from 'react-native'

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
/** Saturday 7 November at 20:00Z is already Sunday 8 November, 1:30 AM, in Bengaluru: the row says the event's own day. */
const NIGHT = { title: 'Vinyl Night', startTime: '2026-11-07T20:00:00.000Z', timezone: 'Asia/Kolkata', venueName: 'High Ultra Lounge' }
/** The night's "Sent" line holds for a beat before the people: long enough for findBy's default to miss it. */
const AFTER_THE_BEAT = { timeout: 3000 }
const PROMISE = 'Only we see this. They’ll never know you rated them.'

function loads({ peers = ['u1', 'u2'], rated = false }: { peers?: string[]; rated?: boolean } = {}) {
  api.getRatablePeers.mockResolvedValue({ success: true, data: { userIds: peers } } as never)
  api.getConversations.mockResolvedValue({
    success: true,
    data: peers.map((id, i) => ({ otherUser: { id, name: i ? 'Quiet Fox' : 'Night Cat', image: null } })),
  } as never)
  api.getEvent.mockResolvedValue({ success: true, data: NIGHT } as never)
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
  expect(await screen.findByRole('header', { name: 'How was the night?' })).toBeTruthy()
})

it('the night: the event in a row (its title, the day in its own zone, the venue), "How was the night?", and step 1 of 3', async () => {
  loads()
  await view()
  const row = await screen.findByTestId('rate-event')
  expect(within(row).getByText('Vinyl Night')).toBeTruthy()
  expect(within(row).getByText('Sun 8 Nov')).toBeTruthy()
  expect(within(row).getByText('High Ultra Lounge')).toBeTruthy()
  // Two lines at most, then an ellipsis: a long title never pushes the question down the page.
  expect(within(row).getByText('Vinyl Night').props.numberOfLines).toBe(2)
  expect(screen.getByRole('header', { name: 'How was the night?' })).toBeTruthy()
  expect(screen.getByText('One tap. It helps whoever puts on the next one.')).toBeTruthy()
  // The night, then each person: one pager across both.
  expect(screen.getByTestId('rate-bar-progress').props.children).toBe('1 of 3')
  expect(screen.getByLabelText('Step 1 of 3')).toBeTruthy()
  // Skip sits at the foot, docked, as on a person.
  expect(within(screen.getByTestId('rate-dock')).getByRole('button', { name: 'Skip to the people' })).toBeTruthy()
})

it('the night: one tap sends it, says "Sent. Only we see this." in place, and after a beat moves to the first person', async () => {
  const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {})
  loads()
  await view()
  await fireEvent.press(await screen.findByLabelText(/^The night: 5 out of 5, Loved it/))
  await waitFor(() => expect(api.rateEvent).toHaveBeenCalledWith('e1', 5))
  expect(await screen.findByText('Sent. Only we see this.')).toBeTruthy()
  expect(announce).toHaveBeenCalledWith('Sent. Only we see this.')
  // Still the night: the line is read before the step moves on.
  expect(screen.queryByText('Night Cat')).toBeNull()
  expect(await screen.findByText('Night Cat', {}, AFTER_THE_BEAT)).toBeTruthy()
  expect(screen.getByTestId('rate-bar-progress').props.children).toBe('2 of 3')
  expect(screen.getByLabelText('Step 2 of 3')).toBeTruthy()
})

it('a person: their face and name in a row, "You both waved at this event", and "How was meeting them?"', async () => {
  // At the default text size (jest's own default is 2×): the board's one line.
  const window = Dimensions.get('window')
  await act(async () => Dimensions.set({ window: { ...window, fontScale: 1 }, screen: { ...window, fontScale: 1 } }))
  loads()
  await view()
  await fireEvent.press(await screen.findByRole('button', { name: 'Skip to the people' }))
  const row = await screen.findByTestId('rate-person')
  expect(within(row).getByText('Night Cat')).toBeTruthy()
  expect(within(row).getByText('You both waved at this event')).toBeTruthy()
  expect(within(row).getByText('Night Cat').props.numberOfLines).toBe(1)
  expect(screen.getByRole('header', { name: 'How was meeting them?' })).toBeTruthy()
  expect(screen.getByRole('header', { name: 'Did anything go wrong?' })).toBeTruthy()
  // The issues are a radio list, "Nothing went wrong" picked to begin with.
  expect(screen.getByRole('radio', { name: 'Nothing went wrong' }).props.accessibilityState).toMatchObject({ checked: true })
  expect(screen.getByRole('radio', { name: 'They harassed me' }).props.accessibilityState).toMatchObject({ checked: false })
  await act(async () => Dimensions.set({ window, screen: window }))
})

/*
 * Audit C-1 (SCRUM-1045): before the redesign the person step promised, under their face, that they would never know.
 * The board dropped it; the owner put it back as one line under the scale, where someone decides how honest to be.
 */
it('a person: "Only we see this. They’ll never know you rated them." (the board’s words, one line) sits under the scale, before the issues', async () => {
  loads()
  await view()
  // Control: the night has its own line ("Sent. Only we see this."), not this one.
  await screen.findByRole('header', { name: 'How was the night?' })
  expect(screen.queryByText(PROMISE)).toBeNull()
  await fireEvent.press(await screen.findByRole('button', { name: 'Skip to the people' }))
  await screen.findByTestId('rate-person')
  type Tree = string | { children?: Tree[] | null } | Tree[] | null
  const strings = (n: Tree): string[] => (!n ? [] : typeof n === 'string' ? [n] : Array.isArray(n) ? n.flatMap(strings) : strings(n.children ?? null))
  const texts = strings(screen.toJSON() as Tree)
  const at = (t: string) => texts.indexOf(t)
  expect(at(PROMISE)).toBeGreaterThan(at('Would meet again'))
  expect(at(PROMISE)).toBeLessThan(at('Did anything go wrong?'))
  expect(within(screen.getByTestId('rate-promise')).getByText(PROMISE)).toBeTruthy()
})

it('at the larger text sizes the name and its line wrap to two rather than lose who it is (driven at AX XXXL)', async () => {
  const window = Dimensions.get('window')
  await act(async () => Dimensions.set({ window: { ...window, fontScale: 3.571 }, screen: { ...window, fontScale: 3.571 } }))
  try {
    loads()
    await view()
    await fireEvent.press(await screen.findByRole('button', { name: 'Skip to the people' }))
    const row = await screen.findByTestId('rate-person')
    expect(within(row).getByText('Night Cat').props.numberOfLines).toBe(2)
    expect(within(row).getByText('You both waved at this event').props.numberOfLines).toBe(2)
  } finally {
    await act(async () => Dimensions.set({ window, screen: window }))
  }
})

it('focus moves to each new card’s header (M5): the night’s question, then the person', async () => {
  const focus = jest.spyOn(AccessibilityInfo, 'sendAccessibilityEvent').mockImplementation(() => {})
  loads()
  await view()
  await screen.findByRole('header', { name: 'How was the night?' })
  await waitFor(() => expect(focus).toHaveBeenCalledWith(expect.anything(), 'focus'))
  const first = focus.mock.calls.length
  await fireEvent.press(screen.getByRole('button', { name: 'Skip to the people' }))
  await screen.findByTestId('rate-person')
  await waitFor(() => expect(focus.mock.calls.length).toBeGreaterThan(first))
  const target = focus.mock.calls.at(-1)![0] as unknown as { props: { accessibilityLabel?: string } }
  expect(target.props.accessibilityLabel).toBe('Night Cat. You both waved at this event')
})

it('one step only (no night to ask, one person): no pager, for "1 of 1" says nothing', async () => {
  loads({ peers: ['u1'], rated: true })
  await view()
  await screen.findByTestId('rate-person')
  expect(screen.queryByTestId('rate-bar-progress')).toBeNull()
})

it('a person: Submit is docked and disabled until a rating; issues are one radio group; the note is labelled', async () => {
  loads()
  await view()
  await fireEvent.press(await screen.findByRole('button', { name: 'Skip to the people' }))
  expect(await screen.findByText('Night Cat')).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Submit' }).props.accessibilityState).toMatchObject({ disabled: true })
  // Two radio groups now: the rating's five steps (audit L11) and the five issues.
  const radios = screen.getAllByRole('radio').map((r) => String(r.props.accessibilityLabel))
  expect(radios.filter((l) => / out of 5/.test(l))).toHaveLength(5)
  expect(radios.filter((l) => !/ out of 5/.test(l))).toHaveLength(5)
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

  it('a night rating refused (403) says why and goes on to the people: asking again cannot change it', async () => {
    loads()
    api.rateEvent.mockResolvedValue({ success: false, error: 'x', errorCode: 'FORBIDDEN', reasonCode: 'NOT_ENDED' } as never)
    await view()
    await fireEvent.press(await screen.findByLabelText(/^The night: 5 out of 5, Loved it/))
    await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith('You can rate this night once it has ended.', 'error', { haptic: 'error' }))
    expect(screen.queryByText('Rating isn’t open for this night')).toBeNull()
    expect(await screen.findByText('Night Cat')).toBeTruthy()
  })

  it('a person refused (403) toasts the server\'s reason and advances to the next person, never the gone card', async () => {
    loads()
    api.ratePeer.mockResolvedValue({ success: false, error: 'x', errorCode: 'FORBIDDEN', reasonCode: 'NOT_CONNECTED' } as never)
    await view()
    await fireEvent.press(await screen.findByLabelText(/^The night: 5 out of 5, Loved it/))
    await fireEvent.press(await screen.findByLabelText(/^Meeting Night Cat: 4 out of 5/, {}, AFTER_THE_BEAT))
    await fireEvent.press(screen.getByTestId('rate-submit'))
    await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith('You can only rate people you connected with.', 'error', { haptic: 'error' }))
    expect(screen.queryByText('Rating isn’t open for this night')).toBeNull()
    expect(await screen.findByText('Quiet Fox')).toBeTruthy()
  })

  it('a 403 with no reason named (an older server) still says something, and moves on', async () => {
    loads()
    api.ratePeer.mockResolvedValue({ success: false, error: 'x', errorCode: 'FORBIDDEN' } as never)
    await view()
    await fireEvent.press(await screen.findByLabelText(/^The night: 5 out of 5, Loved it/))
    await fireEvent.press(await screen.findByLabelText(/^Meeting Night Cat: 4 out of 5/, {}, AFTER_THE_BEAT))
    await fireEvent.press(screen.getByTestId('rate-submit'))
    await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith('That one can’t be rated.', 'error', { haptic: 'error' }))
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
    const form = await screen.findByTestId('rate-submit', {}, AFTER_THE_BEAT)
    expect(form).toBeTruthy()
    expect(screen.queryByTestId('rate-bar-bar')).toBeNull()
    await fireEvent.scroll(screen.getByTestId('rate-form'), { nativeEvent: { contentOffset: { y: 40 } } })
    expect(screen.getByTestId('rate-bar-bar')).toBeTruthy()
    // Skip to the next person: a new form, at its top.
    await fireEvent.press(screen.getByTestId('rate-skip-person'))
    await waitFor(() => expect(screen.queryByTestId('rate-bar-bar')).toBeNull())
  })
})

describe('the night has its art, and a held Submit says why (TG-08)', () => {
  it('the night’s row draws its cover as the thumb', async () => {
    loads()
    api.getEvent.mockResolvedValue({ success: true, data: { ...NIGHT, title: 'QA Scale night 1', coverImageUrl: 'https://cdn.blendn.app/c.jpg' } } as never)
    await view()
    const row = await screen.findByTestId('rate-event')
    expect(JSON.stringify(screen.toJSON())).toContain('https://cdn.blendn.app/c.jpg')
  })

  // TG-06. Negative control: with the old `load.cover ? … : null`, the step draws no art and the plate is missing.
  it('a night with no cover still has its art: the category plate', async () => {
    loads()
    api.getEvent.mockResolvedValue({ success: true, data: { ...NIGHT, title: 'QA Scale night 1', categories: [{ id: 'c', name: 'Comedy', slug: 'comedy' }] } } as never)
    await view()
    await screen.findByTestId('rate-event')
    expect(screen.getByTestId('event-cover-plate', { includeHiddenElements: true })).toBeTruthy()
    expect(JSON.stringify(screen.toJSON())).toContain('mic-vocal')
  })

  it('a person: "Pick a number to send" shows while Submit is held, and goes once a number is picked', async () => {
    loads()
    await view()
    await fireEvent.press(await screen.findByRole('button', { name: 'Skip to the people' }))
    await screen.findByText('Night Cat')
    expect(screen.getByRole('button', { name: 'Submit' }).props.accessibilityState).toMatchObject({ disabled: true })
    // Docked with Submit, so the form above sits where the board draws it.
    expect(within(screen.getByTestId('rate-dock')).getByTestId('rate-hint')).toHaveTextContent('Pick a number to send')
    await fireEvent.press(screen.getByLabelText(/^Meeting Night Cat: 4 out of 5/))
    expect(screen.queryByTestId('rate-hint')).toBeNull()
    expect(screen.getByRole('button', { name: 'Submit' }).props.accessibilityState).not.toMatchObject({ disabled: true })
  })

  /*
   * Driven on a 402×874 iPhone (2026-11-06): with Submit and the note kept, a floating dock sat over
   * "They harassed me" at rest. The dock is in the flow on a person's step, so the form scrolls above it
   * and no option is ever under it. Control: `floating` back on the person's Dock fails both.
   */
  it('a person: the dock is under the form, not over it, so no issue option can sit behind Submit', async () => {
    loads()
    await view()
    await fireEvent.press(await screen.findByRole('button', { name: 'Skip to the people' }))
    await screen.findByText('Night Cat')
    expect(StyleSheet.flatten(screen.getByTestId('rate-dock').props.style).position).not.toBe('absolute')
    await fireEvent(screen.getByTestId('rate-dock'), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 402, height: 190 } } })
    const pad = StyleSheet.flatten(screen.getByTestId('rate-form').props.contentContainerStyle).paddingBottom
    expect(pad).toBeLessThan(190)
  })
})

/*
 * SCRUM-1045 group 3 (driven, iOS 27): opened straight onto a person (the night already rated), the form sat at its
 * end, the face, the name and the scale scrolled out of sight under the bar. The note's keyboard listener scrolled to
 * the end on any keyboardDidShow, and iOS sends one with no field focused. It is the note's own scroll, so it waits
 * for the note.
 */
describe('the note pulls the form to its end, nothing else does', () => {
  it('a keyboard event with the note not focused leaves the person at the top; focused, it scrolls to the note', async () => {
    const shown: (() => void)[] = []
    const addListener = jest.spyOn(Keyboard, 'addListener').mockImplementation(((event: string, fn: () => void) => {
      if (event === 'keyboardDidShow') shown.push(fn)
      return { remove: () => {} }
    }) as never)
    const scrollToEnd = jest.spyOn(ScrollView.prototype, 'scrollToEnd').mockImplementation(() => {})
    try {
      loads({ rated: true })
      await view()
      await screen.findByTestId('rate-person')
      await act(async () => shown.forEach((fn) => fn()))
      expect(scrollToEnd).not.toHaveBeenCalled()

      await fireEvent(screen.getByTestId('rate-note-input'), 'focus')
      await act(async () => shown.forEach((fn) => fn()))
      expect(scrollToEnd).toHaveBeenCalledTimes(1)

      // Out of the note again: the next keyboard event (another app's, a hardware keyboard's) moves nothing.
      await fireEvent(screen.getByTestId('rate-note-input'), 'blur')
      scrollToEnd.mockClear()
      await act(async () => shown.forEach((fn) => fn()))
      expect(scrollToEnd).not.toHaveBeenCalled()
    } finally {
      addListener.mockRestore()
      scrollToEnd.mockRestore()
    }
  })
})

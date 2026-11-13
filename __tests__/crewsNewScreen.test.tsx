/**
 * Make a crew (board 02 A) against a mocked API: the two steps (name and friends, then the optional vibe), the
 * server's limits held on the client, the consent on the Make button, the
 * server's sentences under the field they are about, and one create per tap.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { StyleSheet } from 'react-native'

jest.mock('expo-router', () => ({
  // A router modal holds the screen while focused (components/system/RouteModal): here it is focused while mounted.
  // A router modal releases the screen on its transitionEnd (components/system/RouteModal): no navigator here.
  useNavigation: () => undefined,
  useFocusEffect: (effect: () => void | (() => void)) => require('react').useEffect(effect, [effect]),
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() },
}))
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))
jest.mock('../lib/apiClient', () => ({ apiClient: { getFriends: jest.fn() } }))
jest.mock('../lib/crewsApi', () => ({ crewsApi: { create: jest.fn(), crew: jest.fn() } }))
jest.mock('../lib/useAuth', () => ({ useAuth: () => ({ user: { id: 'u-me' } }) }))
// The link-closing signal as lib/pendingRoute gives it; `mockCloseForLink()` is a link closing the modals.
const mockLinkClosers = new Set<() => void>()
const mockCloseForLink = () => [...mockLinkClosers].forEach((listener) => listener())
jest.mock('../lib/linkClosers', () => ({
  onClosingForLink: (listener: () => void) => {
    mockLinkClosers.add(listener)
    return () => mockLinkClosers.delete(listener)
  },
}))

import { router } from 'expo-router'
import NewCrewScreen from '../app/crews/new'
import { apiClient } from '../lib/apiClient'
import { CONSENT_LINE, KEEP_ANONYMOUS_LABEL } from '../lib/crews'
import { crewsApi } from '../lib/crewsApi'
import { crewDraftThread, draftOf, setDraft } from '../lib/chatOutbox'

const api = apiClient as jest.Mocked<typeof apiClient>
const crews = crewsApi as jest.Mocked<typeof crewsApi>

const friend = (userId: string, name: string) => ({ userId, name, photo: null, since: '2026-09-01T00:00:00Z' })

beforeEach(() => {
  jest.clearAllMocks()
  setDraft(crewDraftThread('u-me'), '')
  crews.create.mockReset()
  crews.crew.mockReset()
  api.getFriends.mockResolvedValue({ success: true, data: { friends: [friend('u-priya', 'Priya'), friend('u-rohan', 'Rohan')], count: 2 } })
})

const name = (text: string) => fireEvent.changeText(screen.getByTestId('make-name-input'), text)
const press = (label: string) => fireEvent.press(screen.getByLabelText(label))

const S1 = 'Step 1 of 2, Name and friends'
const S2 = 'Step 2 of 2, Your crew’s vibe'
const makeButton = () => screen.getByTestId('make-send')
const pressMake = () => fireEvent.press(makeButton())
const pick = (who: string) => fireEvent.press(screen.getByRole('checkbox', { name: `Ask ${who}` }))

/** Step 1 with a name typed and the friends listed. */
async function atStart(crewName = 'Nebula') {
  await render(<NewCrewScreen />)
  await name(crewName)
  await waitFor(() => screen.getByRole('checkbox', { name: 'Ask Priya' }))
}

/** On to step 2 with Priya and Rohan asked. */
async function toVibe(crewName = 'Nebula') {
  await atStart(crewName)
  await pick('Priya')
  await pick('Rohan')
  await press('Next')
  await waitFor(() => screen.getByLabelText(S2))
}

describe('step 1 · name and friends (board 02 A)', () => {
  it('opens on "1 of 2 · Name and friends": the emblem beside the name, and the friends on the same step', async () => {
    await render(<NewCrewScreen />)
    expect(screen.getByText('Make a crew')).toBeTruthy()
    expect(screen.getByLabelText(S1)).toBeTruthy()
    expect(screen.getByTestId('make-emblem-live', { includeHiddenElements: true })).toBeTruthy()
    // The counter is drawn for the eye; the field speaks its limit to a screen reader.
    expect(screen.getByText('0/32', { includeHiddenElements: true })).toBeTruthy()
    await waitFor(() => screen.getByRole('checkbox', { name: 'Ask Priya' }))
    expect(screen.getByText('Friends to ask · 0 picked')).toBeTruthy()
    // The vibe waits for step 2: none of it is on the first screen.
    expect(screen.queryByText('Room for one more')).toBeNull()
    expect(screen.queryByTestId('make-bio-input')).toBeNull()
    expect(screen.queryByText(CONSENT_LINE)).toBeNull()
  })

  it('Next waits for a friend, and the label counts the picks', async () => {
    await atStart()
    expect(screen.getByLabelText('Next')).toBeDisabled()
    await pick('Priya')
    expect(screen.getByRole('checkbox', { name: 'Ask Priya' }).props.accessibilityState).toEqual({ checked: true, disabled: false })
    expect(screen.getByText('Friends to ask · 1 picked')).toBeTruthy()
    expect(screen.getByLabelText('Next')).not.toBeDisabled()
  })

  it('a name under two characters is refused where it stands, in the design’s words, and Next stays', async () => {
    await atStart('N')
    await pick('Priya')
    await press('Next')
    expect(screen.getByText('A crew name is 2–32 characters')).toBeTruthy()
    expect(screen.getByLabelText(S1)).toBeTruthy()
    // Typing again clears it.
    await name('Ne')
    expect(screen.queryByText('A crew name is 2–32 characters')).toBeNull()
  })

  it('one character is not a name: refused at Next and on leaving the field', async () => {
    await atStart('x')
    await fireEvent(screen.getByTestId('make-name-input'), 'blur')
    expect(screen.getByText('A crew name is 2–32 characters')).toBeTruthy()
    await name('xy')
    expect(screen.queryByText('A crew name is 2–32 characters')).toBeNull()
    await name('x')
    await pick('Priya')
    await press('Next')
    expect(screen.getByLabelText(S1)).toBeTruthy()
    expect(screen.getByText('A crew name is 2–32 characters')).toBeTruthy()
  })

  it('counts an emoji as one character, as the server’s char_length does', async () => {
    await atStart('🎉')
    await pick('Priya')
    await press('Next')
    expect(screen.getByText('A crew name is 2–32 characters')).toBeTruthy()
    await name('🎉🎉')
    await press('Next')
    await waitFor(() => screen.getByLabelText(S2))
  })

  it('a name of only spaces is not a name', async () => {
    await atStart('     ')
    await pick('Priya')
    await press('Next')
    expect(screen.getByText('A crew name is 2–32 characters')).toBeTruthy()
  })

  it('a failed friends read is not "no friends": it offers the retry', async () => {
    api.getFriends.mockResolvedValueOnce({ success: false, error: 'No internet connection.' })
    await render(<NewCrewScreen />)
    await waitFor(() => screen.getByLabelText('Your friends didn’t load — try again'))
    expect(screen.queryByText('Add friends first — a crew is made from your friends.')).toBeNull()
    await press('Your friends didn’t load — try again')
    await waitFor(() => screen.getByRole('checkbox', { name: 'Ask Priya' }))
  })

  it('no friends says a crew is made from them', async () => {
    api.getFriends.mockResolvedValue({ success: true, data: { friends: [], count: 0 } })
    await render(<NewCrewScreen />)
    await waitFor(() => screen.getByText('Add friends first — a crew is made from your friends.'))
  })

  it('stops at eleven: a crew has at most twelve people, you included', async () => {
    const many = Array.from({ length: 12 }, (_, i) => friend(`u${i}`, `Friend${i}`))
    api.getFriends.mockResolvedValue({ success: true, data: { friends: many, count: 12 } })
    await render(<NewCrewScreen />)
    await waitFor(() => screen.getByRole('checkbox', { name: 'Ask Friend0' }))
    expect(screen.queryByText('A crew has at most 12 people.')).toBeNull()
    for (const f of many) await pick(f.name)
    expect(screen.getByRole('checkbox', { name: 'Ask Friend11' }).props.accessibilityState).toEqual({ checked: false, disabled: true })
    expect(screen.getByText('Friends to ask · 11 picked')).toBeTruthy()
    // At the cap the foot says why, instead of the rows doing nothing in silence.
    expect(screen.getByText('A crew has at most 12 people.')).toBeTruthy()
  })
})

describe('step 2 · the vibe, optional, and the consent on the button (board 02 A)', () => {
  it('shows here-for, tags, Room for one more and the consent — board 02 A’s four, no more — with nothing sent yet', async () => {
    await toVibe()
    expect(screen.getByText('Here for · optional')).toBeTruthy()
    expect(screen.getByText('Tags · optional')).toBeTruthy()
    expect(screen.getByLabelText('0 of 3')).toBeTruthy()
    // The line about the crew is not on the board's Make: it is written on the crew page (Edit crew), as before.
    expect(screen.queryByTestId('make-bio-input')).toBeNull()
    expect(screen.getByText('Room for one more')).toBeTruthy()
    expect(screen.getByText('Solo people who opt in can find you. Crews of 6 or fewer.')).toBeTruthy()
    expect(screen.getByText(CONSENT_LINE)).toBeTruthy()
    expect(screen.getByRole('switch', { name: KEEP_ANONYMOUS_LABEL })).toBeTruthy()
    // The button names the crew and the count asked: tapping it is the agreement.
    expect(screen.getByLabelText('Make Nebula · ask 2 friends')).toBeTruthy()
    // The stranger's-card preview and the summary step are gone: the emblem lives beside the name.
    expect(screen.queryByText('As strangers will see it')).toBeNull()
    expect(crews.create).not.toHaveBeenCalled()
  })

  it('a long name is "the crew" on the button, so the count asked is never cut off', async () => {
    await toVibe('Indiranagar Sunrise Run Club Cre')
    expect(screen.getByLabelText('Make the crew · ask 2 friends')).toBeTruthy()
  })

  it('"Here for" is chips, each the width of its word: Friendship is chosen, never a third of a row it breaks in (R6-6)', async () => {
    await toVibe()
    expect(screen.queryByTestId('make-intent-0')).toBeNull()
    expect(screen.getByTestId('make-intent-friendship').props.accessibilityState).toMatchObject({ selected: true })
    await fireEvent.press(screen.getByTestId('make-intent-dating'))
    expect(screen.getByTestId('make-intent-dating').props.accessibilityState).toMatchObject({ selected: true })
    expect(screen.getByTestId('make-intent-friendship').props.accessibilityState).toMatchObject({ selected: false })
  })

  it('the tags fold after four behind "+6 more", as the board draws them, and a pick beyond the four stays drawn', async () => {
    await toVibe()
    expect(screen.queryByLabelText('Dance floor')).toBeNull()
    await fireEvent.press(screen.getByLabelText('6 more tags'))
    await fireEvent.press(screen.getByLabelText('Dance floor'))
    await fireEvent.press(screen.getByLabelText('Show fewer'))
    expect(screen.getByLabelText('Dance floor')).toBeTruthy()
    expect(screen.queryByLabelText('Book club')).toBeNull()
  })

  it('the consent is the meta line the board draws, so it stands above the button without a scroll', async () => {
    await toVibe()
    expect(StyleSheet.flatten(screen.getByText(CONSENT_LINE).props.style).fontSize).toBeLessThan(15)
  })

  it('holds the tags to three: a fourth does nothing, and a picked one can be put back', async () => {
    await toVibe()
    for (const t of ['Quiz team', 'Run club', 'Techno heads']) await fireEvent.press(screen.getByLabelText(t))
    expect(screen.getByLabelText('3 of 3')).toBeTruthy()
    await fireEvent.press(screen.getByLabelText('Office gang'))
    expect(screen.getByLabelText('3 of 3')).toBeTruthy()
    await fireEvent.press(screen.getByLabelText('Run club'))
    expect(screen.getByLabelText('2 of 3')).toBeTruthy()
  })

  it('insets a label once, 4 pt, at the field label’s own edge: the row around it adds no second left', async () => {
    await toVibe()
    const label = screen.getByText('Here for · optional')
    let left = StyleSheet.flatten(label.props.style).paddingLeft ?? 0
    const row = label.parent
    left += StyleSheet.flatten(row?.props.style)?.paddingLeft ?? StyleSheet.flatten(row?.props.style)?.paddingHorizontal ?? 0
    expect(left).toBe(4)
  })

  it('the button is the agreement: it sends the consent, the choices and the friends asked', async () => {
    crews.create.mockResolvedValue({ success: true, data: { crewId: 'c1', chatGroupId: 'g1', invited: 1 } })
    crews.crew.mockResolvedValue({ success: true, data: { crewId: 'c1', emblemSeed: 'real-seed' } as never })
    await atStart('  Nebula ')
    await pick('Priya')
    await press('Next')
    await waitFor(() => screen.getByLabelText(S2))
    await fireEvent.press(screen.getByLabelText('Dating'))
    await fireEvent.press(screen.getByLabelText('6 more tags'))
    await fireEvent.press(screen.getByLabelText('Dance floor'))
    await fireEvent.press(screen.getByRole('switch', { name: 'Room for one more' }))
    await fireEvent.press(screen.getByRole('switch', { name: KEEP_ANONYMOUS_LABEL }))
    await press('Make Nebula · ask 1 friend')

    await waitFor(() => expect(crews.create).toHaveBeenCalledTimes(1))
    expect(crews.create.mock.calls[0][0]).toEqual({
      name: 'Nebula',
      intent: ['dating'],
      tags: ['dance-floor'],
      openToSolo: true,
      inviteUserIds: ['u-priya'],
      revealConsent: true,
      keepMeAnonymous: true,
      // The look Make showed: random, Shuffle for another, fixed once sent (SCRUM-1053).
      emblemSeed: expect.stringMatching(/^[0-9a-f]{16}$/),
    })
  })

  it('skipping the vibe sends today’s defaults: Friendship, no tags, no line', async () => {
    crews.create.mockResolvedValue({ success: true, data: { crewId: 'c1', chatGroupId: 'g1', invited: 2 } })
    crews.crew.mockResolvedValue({ success: true, data: { crewId: 'c1', emblemSeed: 'real-seed' } as never })
    await toVibe()
    await pressMake()
    await waitFor(() => expect(crews.create).toHaveBeenCalledTimes(1))
    expect(crews.create.mock.calls[0][0]).toEqual(
      expect.objectContaining({ intent: ['friendship'], tags: [], openToSolo: false, inviteUserIds: ['u-priya', 'u-rohan'], revealConsent: true, keepMeAnonymous: false }),
    )
  })

  it('Shuffle draws another look on step 1, and the one showing is the one sent', async () => {
    crews.create.mockResolvedValue({ success: true, data: { crewId: 'c1', chatGroupId: 'g1', invited: 1 } })
    crews.crew.mockResolvedValue({ success: true, data: { crewId: 'c1', emblemSeed: 'real-seed' } as never })
    const random = jest.spyOn(Math, 'random')
    await atStart()
    random.mockReturnValue(0.999999)
    await fireEvent.press(screen.getByLabelText('Shuffle the crew’s look'))
    random.mockRestore()
    await pick('Priya')
    await press('Next')
    await waitFor(() => screen.getByLabelText(S2))
    await pressMake()
    await waitFor(() => expect(crews.create).toHaveBeenCalledTimes(1))
    expect(crews.create.mock.calls[0][0]).toEqual(expect.objectContaining({ emblemSeed: 'ffffffffffffffff' }))
  })

  it('then the crew is made: its name, the count asked, and Continue opens the chat — not before', async () => {
    crews.create.mockResolvedValue({ success: true, data: { crewId: 'c1', chatGroupId: 'g1', invited: 2 } })
    crews.crew.mockResolvedValue({ success: true, data: { crewId: 'c1', emblemSeed: 'real-seed' } as never })
    await toVibe()
    await pressMake()
    await waitFor(() => screen.getByText('Your crew. 2 invited; it starts when someone joins.'))
    expect(screen.getByText('The crew chat opens next.')).toBeTruthy()
    expect(router.replace).not.toHaveBeenCalled()
    await press('Continue')
    expect(router.replace).toHaveBeenCalledWith({
      pathname: '/chat/[id]',
      params: { id: 'g1', roomName: 'Nebula', kind: 'crew', crewId: 'c1' },
    })
  })

  it('the moment plays as soon as the crew is made, before its emblem has been read (the old order jumped to the room)', async () => {
    crews.create.mockResolvedValue({ success: true, data: { crewId: 'c1', chatGroupId: 'g1', invited: 2 } })
    crews.crew.mockReturnValue(new Promise(() => {}) as never)
    await toVibe()
    await pressMake()
    await waitFor(() => screen.getByText('Your crew. 2 invited; it starts when someone joins.'))
    expect(screen.getByTestId('make-emblem-pending')).toBeTruthy()
    expect(router.replace).not.toHaveBeenCalled()
  })

  it('it stays until Continue: no timer takes the crew on to the chat', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] })
    try {
      crews.create.mockResolvedValue({ success: true, data: { crewId: 'c1', chatGroupId: 'g1', invited: 2 } })
      crews.crew.mockResolvedValue({ success: true, data: { crewId: 'c1', emblemSeed: 'real-seed' } as never })
      await toVibe()
      await pressMake()
      await waitFor(() => screen.getByTestId('make-done'))
      await act(async () => jest.advanceTimersByTime(30_000))
      expect(router.replace).not.toHaveBeenCalled()
      expect(screen.getByTestId('make-done')).toBeTruthy()
    } finally {
      jest.useRealTimers()
    }
  })

  it('a crew whose emblem cannot be read is still shown as made, and still opens its chat on Continue', async () => {
    crews.create.mockResolvedValue({ success: true, data: { crewId: 'c1', chatGroupId: 'g1', invited: 2 } })
    crews.crew.mockResolvedValue({ success: false, error: 'No internet connection.' })
    await toVibe()
    await pressMake()
    await waitFor(() => screen.getByText('Your crew. 2 invited; it starts when someone joins.'))
    expect(router.replace).not.toHaveBeenCalled()
    await press('Continue')
    expect(router.replace).toHaveBeenCalledTimes(1)
  })

  it('the real emblem takes the pending one’s place once it is read', async () => {
    crews.create.mockResolvedValue({ success: true, data: { crewId: 'c1', chatGroupId: 'g1', invited: 2 } })
    crews.crew.mockResolvedValue({ success: true, data: { crewId: 'c1', emblemSeed: 'real-seed' } as never })
    await toVibe()
    await pressMake()
    await waitFor(() => screen.getByTestId('make-emblem'))
    // The placeholder stays underneath: the emblem fades in over it, not instead of it.
    expect(screen.getByTestId('make-emblem-pending')).toBeTruthy()
    expect(screen.getByTestId('make-emblem').props.entering).toBeDefined()
  })

  it('two fast taps on Make send one create', async () => {
    let finish: (v: unknown) => void = () => {}
    crews.create.mockReturnValue(new Promise((r) => (finish = r)) as never)
    crews.crew.mockResolvedValue({ success: true, data: { crewId: 'c1', emblemSeed: 's' } as never })
    await toVibe()
    const make = makeButton()
    await act(async () => {
      void fireEvent.press(make)
      void fireEvent.press(make)
    })
    expect(crews.create).toHaveBeenCalledTimes(1)
    await act(async () => finish({ success: true, data: { crewId: 'c1', chatGroupId: 'g1', invited: 2 } }))
  })
})

describe('what the server refuses', () => {
  it('the server’s own length refusal comes back under the name, with no field named', async () => {
    crews.create.mockResolvedValue({ success: false, error: 'Validation failed', errorCode: 'VALIDATION_FAILED', errors: [{ path: 'name', message: 'A crew name is 2–32 characters' }] })
    await toVibe()
    await pressMake()
    await waitFor(() => screen.getByLabelText(S1))
    expect(screen.getByText('A crew name is 2–32 characters')).toBeTruthy()
  })

  it('a name it will not take comes back under the name, on step 1, in its words', async () => {
    crews.create.mockResolvedValue({ success: false, error: 'This can’t be a crew’s name.', errorCode: 'BAD_REQUEST' })
    await toVibe('Blend’n Official')
    await pressMake()
    await waitFor(() => screen.getByText('This can’t be a crew’s name.'))
    expect(screen.getByLabelText(S1)).toBeTruthy()
  })

  it('contact details with no field are the form’s: a sheet in the server’s words, not under the line', async () => {
    const said = 'A phone number. A crew card is shown to people you haven’t met, so contact details can’t go on it.'
    crews.create.mockResolvedValue({ success: false, error: said, errorCode: 'BAD_REQUEST' })
    await toVibe()
    await pressMake()
    await waitFor(() => screen.getByText(said))
    expect(screen.getByLabelText(S2)).toBeTruthy()
  })

  it('the server naming the line (not on Make any more) is a sheet in its words, on step 2', async () => {
    const said = 'A phone number. A crew card is shown to people you haven’t met, so contact details can’t go on it.'
    crews.create.mockResolvedValue({ success: false, error: said, errorCode: 'BAD_REQUEST', field: 'bio' })
    await toVibe()
    await pressMake()
    await waitFor(() => screen.getByText(said))
    expect(screen.getByLabelText(S2)).toBeTruthy()
  })

  it.each([
    ['You can own up to 3 crews at a time.', 'Can’t make another crew'],
    ['That’s enough new crews for today — try again tomorrow.', 'Can’t make another crew'],
    ['You can only invite your friends into a crew.', 'Couldn’t do that'],
  ])('%s is a sheet in the server’s words', async (said, title) => {
    crews.create.mockResolvedValue({ success: false, error: said, errorCode: 'CONFLICT' })
    await toVibe()
    await pressMake()
    await waitFor(() => screen.getByText(title))
    expect(screen.getByText(said)).toBeTruthy()
    // The form is as it was: Make can be tried again.
    expect(makeButton()).toBeTruthy()
  })

  it('the 18+ gate offers the way through', async () => {
    crews.create.mockResolvedValue({
      success: false,
      error: 'Crews are for people 18 and over who have finished setting up.',
      errorCode: 'FORBIDDEN',
    })
    await toVibe()
    await pressMake()
    await waitFor(() => screen.getByText('Not yet'))
    await press('Finish setting up')
    expect(router.push).toHaveBeenCalledWith('/onboarding/basics')
  })
})

describe('going back', () => {
  it('system back goes back a step before it closes, and keeps what was typed', async () => {
    await toVibe()
    await act(async () => screen.getByTestId('make-modal').props.onRequestClose())
    await waitFor(() => screen.getByLabelText(S1))
    expect(screen.getByTestId('make-name-input').props.value).toBe('Nebula')
  })
})

describe('a link that closes the sheet keeps what was typed (review LOW)', () => {
  const nameField = () => screen.getByTestId('make-name-input')

  it('closed for a link: reopening gives back the name, the friends picked and the rest', async () => {
    await atStart('Nebula')
    await pick('Priya')
    await act(async () => mockCloseForLink())
    await screen.unmount()

    await render(<NewCrewScreen />)
    expect(nameField().props.value).toBe('Nebula')
    await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Ask Priya' }).props.accessibilityState?.checked).toBe(true))
  })

  it('it is given back once: closed by the person after that, the next open is empty', async () => {
    await render(<NewCrewScreen />)
    await name('Nebula')
    await act(async () => mockCloseForLink())
    await screen.unmount()
    await render(<NewCrewScreen />)
    expect(nameField().props.value).toBe('Nebula')
    await screen.unmount()

    await render(<NewCrewScreen />)
    expect(nameField().props.value).toBe('')
  })

  it('closed by the person, nothing is kept; and an empty sheet closed for a link keeps nothing either', async () => {
    await render(<NewCrewScreen />)
    await name('Nebula')
    await screen.unmount()
    expect(draftOf(crewDraftThread('u-me'))).toBe('')

    await render(<NewCrewScreen />)
    await act(async () => mockCloseForLink())
    await screen.unmount()
    expect(draftOf(crewDraftThread('u-me'))).toBe('')
  })
})


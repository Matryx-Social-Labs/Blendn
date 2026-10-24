/**
 * Make a crew (Flow 10 · 10.2) against a mocked API: the three steps, the
 * server's limits held on the client, the consent beside Make the crew, the
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

async function toFriends(crewName = 'Nebula') {
  await render(<NewCrewScreen />)
  await name(crewName)
  await press('Next')
  await waitFor(() => screen.getByText('Friends only. The count says how many, never who was skipped.'))
}

async function toConsent(crewName = 'Nebula') {
  await toFriends(crewName)
  await waitFor(() => screen.getByRole('checkbox', { name: 'Ask Priya' }))
  await fireEvent.press(screen.getByRole('checkbox', { name: 'Ask Priya' }))
  await fireEvent.press(screen.getByRole('checkbox', { name: 'Ask Rohan' }))
  await press('Next')
  await waitFor(() => screen.getByText(CONSENT_LINE))
}

describe('step 1 · name and vibe', () => {
  it('opens on the title and "1 of 3 · Name and vibe", with the limits on the fields', async () => {
    await render(<NewCrewScreen />)
    expect(screen.getByText('Make a crew')).toBeTruthy()
    expect(screen.getByLabelText('Step 1 of 3, Name and vibe')).toBeTruthy()
    // The counters are drawn for the eye; the fields speak their limits to a screen reader.
    expect(screen.getByText('0/32', { includeHiddenElements: true })).toBeTruthy()
    expect(screen.getByText('0/140', { includeHiddenElements: true })).toBeTruthy()
    expect(screen.getByLabelText('0 of 3')).toBeTruthy()
    expect(screen.getByText('Room for one more')).toBeTruthy()
  })

  it('a name under two characters is refused where it stands, in the design’s words, and Next stays', async () => {
    await render(<NewCrewScreen />)
    await name('N')
    await press('Next')
    expect(screen.getByText('A crew name is 2–32 characters')).toBeTruthy()
    expect(screen.queryByText('Friends only. The count says how many, never who was skipped.')).toBeNull()
    // Typing again clears it.
    await name('Ne')
    expect(screen.queryByText('A crew name is 2–32 characters')).toBeNull()
  })

  it('one character is not a name: refused at Next, by the keyboard’s next key, and on leaving the field', async () => {
    await render(<NewCrewScreen />)
    await name('x')
    await fireEvent(screen.getByTestId('make-name-input'), 'blur')
    expect(screen.getByText('A crew name is 2–32 characters')).toBeTruthy()
    await name('xy')
    expect(screen.queryByText('A crew name is 2–32 characters')).toBeNull()
    await name('x')
    await press('Next')
    expect(screen.getByLabelText('Step 1 of 3, Name and vibe')).toBeTruthy()
    expect(screen.getByText('A crew name is 2–32 characters')).toBeTruthy()
    // The keyboard's own next key moves on to the line; it does not move the sheet on.
    await fireEvent(screen.getByTestId('make-name-input'), 'submitEditing')
    expect(screen.getByLabelText('Step 1 of 3, Name and vibe')).toBeTruthy()
  })

  it('counts an emoji as one character, as the server’s char_length does', async () => {
    await render(<NewCrewScreen />)
    await name('🎉')
    await press('Next')
    expect(screen.getByText('A crew name is 2–32 characters')).toBeTruthy()
    await name('🎉🎉')
    await press('Next')
    await waitFor(() => screen.getByLabelText('Step 2 of 3, Invite friends'))
  })

  it('a name of only spaces is not a name', async () => {
    await render(<NewCrewScreen />)
    await name('     ')
    await press('Next')
    expect(screen.getByText('A crew name is 2–32 characters')).toBeTruthy()
  })

  it('a bio over 140 characters cannot go on', async () => {
    await render(<NewCrewScreen />)
    await name('Nebula')
    await fireEvent.changeText(screen.getByTestId('make-bio-input'), 'x'.repeat(141))
    await press('Next')
    expect(screen.getByText('A crew bio is at most 140 characters')).toBeTruthy()
  })

  it('holds the tags to three: a fourth does nothing, and a picked one can be put back', async () => {
    await render(<NewCrewScreen />)
    // The first is the picker's chip; the card below it draws the picked ones too.
    for (const t of ['Quiz team', 'Run club', 'Foodies']) await fireEvent.press(screen.getAllByLabelText(t)[0])
    expect(screen.getByLabelText('3 of 3')).toBeTruthy()
    await fireEvent.press(screen.getAllByLabelText('Book club')[0])
    expect(screen.getByLabelText('3 of 3')).toBeTruthy()
    await fireEvent.press(screen.getAllByLabelText('Run club')[0])
    expect(screen.getByLabelText('2 of 3')).toBeTruthy()
  })

  it('insets a label once, 4 pt, at the field label’s own edge: the row around it adds no second left', async () => {
    await render(<NewCrewScreen />)
    for (const text of ['Here for', 'As strangers will see it']) {
      const label = screen.getByText(text)
      let left = StyleSheet.flatten(label.props.style).paddingLeft ?? 0
      const row = label.parent
      left += StyleSheet.flatten(row?.props.style)?.paddingLeft ?? StyleSheet.flatten(row?.props.style)?.paddingHorizontal ?? 0
      expect(left).toBe(4)
    }
  })

  it('draws the card as strangers will see it as you type', async () => {
    await render(<NewCrewScreen />)
    expect(screen.getByText('As strangers will see it')).toBeTruthy()
    expect(screen.getByText('Crew name')).toBeTruthy()
    await name('Nebula')
    await fireEvent.changeText(screen.getByTestId('make-bio-input'), 'Late sets, early trains.')
    await fireEvent.press(screen.getAllByLabelText('Dance floor')[0])
    await fireEvent.press(screen.getByLabelText('Both'))
    expect(screen.getAllByText('Nebula').length).toBeGreaterThan(0)
    expect(screen.getByText('Late sets, early trains.')).toBeTruthy()
    expect(screen.getAllByText('Dance floor').length).toBeGreaterThan(1)
    expect(screen.getByText('Friendship · Dating')).toBeTruthy()
  })
})

describe('step 2 · invite friends', () => {
  it('lists your friends with a count of how many, and Next waits for one', async () => {
    await toFriends()
    await waitFor(() => screen.getByRole('checkbox', { name: 'Ask Priya' }))
    expect(screen.getByLabelText('Step 2 of 3, Invite friends')).toBeTruthy()
    expect(screen.getByLabelText('Next')).toBeDisabled()
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Ask Priya' }))
    expect(screen.getByRole('checkbox', { name: 'Ask Priya' }).props.accessibilityState).toEqual({ checked: true, disabled: false })
    expect(screen.getByText('1')).toBeTruthy()
    expect(screen.getByText('Invites last 14 days')).toBeTruthy()
    expect(screen.getByLabelText('Next')).not.toBeDisabled()
  })

  it('a failed friends read is not "no friends": it offers the retry', async () => {
    api.getFriends.mockResolvedValueOnce({ success: false, error: 'No internet connection.' })
    await toFriends()
    await waitFor(() => screen.getByLabelText('Your friends didn’t load — try again'))
    expect(screen.queryByText('Add friends first — a crew is made from your friends.')).toBeNull()
    await press('Your friends didn’t load — try again')
    await waitFor(() => screen.getByRole('checkbox', { name: 'Ask Priya' }))
  })

  it('no friends says a crew is made from them', async () => {
    api.getFriends.mockResolvedValue({ success: true, data: { friends: [], count: 0 } })
    await toFriends()
    await waitFor(() => screen.getByText('Add friends first — a crew is made from your friends.'))
  })

  it('stops at eleven: a crew has at most twelve people, you included', async () => {
    const many = Array.from({ length: 12 }, (_, i) => friend(`u${i}`, `Friend${i}`))
    api.getFriends.mockResolvedValue({ success: true, data: { friends: many, count: 12 } })
    await toFriends()
    await waitFor(() => screen.getByRole('checkbox', { name: 'Ask Friend0' }))
    for (const f of many) await fireEvent.press(screen.getByRole('checkbox', { name: `Ask ${f.name}` }))
    expect(screen.getByRole('checkbox', { name: 'Ask Friend11' }).props.accessibilityState).toEqual({ checked: false, disabled: true })
    expect(screen.getByText('11')).toBeTruthy()
    // At the cap the footer says why, instead of the rows doing nothing in silence.
    expect(screen.getByText('A crew has at most 12 people.')).toBeTruthy()
  })
})

describe('step 3 · consent', () => {
  it('shows the sentence, the anonymity switch and the summary, with nothing sent yet', async () => {
    await toConsent()
    expect(screen.getByLabelText('Step 3 of 3, Consent')).toBeTruthy()
    expect(screen.getByRole('switch', { name: KEEP_ANONYMOUS_LABEL })).toBeTruthy()
    expect(screen.getByText('2 invited · Friendship')).toBeTruthy()
        expect(crews.create).not.toHaveBeenCalled()
  })

  it('Make the crew is the agreement: it sends the consent, the choices and the friends asked', async () => {
    crews.create.mockResolvedValue({ success: true, data: { crewId: 'c1', chatGroupId: 'g1', invited: 2 } })
    crews.crew.mockResolvedValue({ success: true, data: { crewId: 'c1', emblemSeed: 'real-seed' } as never })
    await render(<NewCrewScreen />)
    await name('  Nebula ')
    await fireEvent.changeText(screen.getByTestId('make-bio-input'), 'Late sets.')
    await fireEvent.press(screen.getByLabelText('Dating'))
    await fireEvent.press(screen.getAllByLabelText('Dance floor')[0])
    await fireEvent.press(screen.getByRole('switch', { name: 'Room for one more' }))
    await press('Next')
    await waitFor(() => screen.getByRole('checkbox', { name: 'Ask Priya' }))
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Ask Priya' }))
    await press('Next')
    await waitFor(() => screen.getByText(CONSENT_LINE))
    await fireEvent.press(screen.getByRole('switch', { name: KEEP_ANONYMOUS_LABEL }))
    await press('Make the crew')

    await waitFor(() => expect(crews.create).toHaveBeenCalledTimes(1))
    expect(crews.create.mock.calls[0][0]).toEqual({
      name: 'Nebula',
      bio: 'Late sets.',
      intent: ['dating'],
      tags: ['dance-floor'],
      openToSolo: true,
      inviteUserIds: ['u-priya'],
      revealConsent: true,
      keepMeAnonymous: true,
    })
  })

  it('then the crew is made: its name, the count asked, and Continue opens the chat — not before', async () => {
    crews.create.mockResolvedValue({ success: true, data: { crewId: 'c1', chatGroupId: 'g1', invited: 2 } })
    crews.crew.mockResolvedValue({ success: true, data: { crewId: 'c1', emblemSeed: 'real-seed' } as never })
    await toConsent()
    await press('Make the crew')
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
    await toConsent()
    await press('Make the crew')
    await waitFor(() => screen.getByText('Your crew. 2 invited; it starts when someone joins.'))
    expect(screen.getByTestId('make-emblem-pending')).toBeTruthy()
    expect(router.replace).not.toHaveBeenCalled()
  })

  it('it stays until Continue: no timer takes the crew on to the chat', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] })
    try {
      crews.create.mockResolvedValue({ success: true, data: { crewId: 'c1', chatGroupId: 'g1', invited: 2 } })
      crews.crew.mockResolvedValue({ success: true, data: { crewId: 'c1', emblemSeed: 'real-seed' } as never })
      await toConsent()
      await press('Make the crew')
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
    await toConsent()
    await press('Make the crew')
    await waitFor(() => screen.getByText('Your crew. 2 invited; it starts when someone joins.'))
    expect(router.replace).not.toHaveBeenCalled()
    await press('Continue')
    expect(router.replace).toHaveBeenCalledTimes(1)
  })

  it('the real emblem takes the pending one’s place once it is read', async () => {
    crews.create.mockResolvedValue({ success: true, data: { crewId: 'c1', chatGroupId: 'g1', invited: 2 } })
    crews.crew.mockResolvedValue({ success: true, data: { crewId: 'c1', emblemSeed: 'real-seed' } as never })
    await toConsent()
    await press('Make the crew')
    await waitFor(() => screen.getByTestId('make-emblem'))
    // The placeholder stays underneath: the emblem fades in over it, not instead of it.
    expect(screen.getByTestId('make-emblem-pending')).toBeTruthy()
    expect(screen.getByTestId('make-emblem').props.entering).toBeDefined()
  })

  it('two fast taps on Make the crew send one create', async () => {
    let finish: (v: unknown) => void = () => {}
    crews.create.mockReturnValue(new Promise((r) => (finish = r)) as never)
    crews.crew.mockResolvedValue({ success: true, data: { crewId: 'c1', emblemSeed: 's' } as never })
    await toConsent()
    const make = screen.getByLabelText('Make the crew')
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
    await toConsent()
    await press('Make the crew')
    await waitFor(() => screen.getByLabelText('Step 1 of 3, Name and vibe'))
    expect(screen.getByText('A crew name is 2–32 characters')).toBeTruthy()
  })

  it('a name it will not take comes back under the name, on step 1, in its words', async () => {
    crews.create.mockResolvedValue({ success: false, error: 'This can’t be a crew’s name.', errorCode: 'BAD_REQUEST' })
    await toConsent('Blend’n Official')
    await press('Make the crew')
    await waitFor(() => screen.getByText('This can’t be a crew’s name.'))
    expect(screen.getByLabelText('Step 1 of 3, Name and vibe')).toBeTruthy()
  })

  it('contact details with no field are the form’s: a sheet in the server’s words, not under the line', async () => {
    const said = 'A phone number. A crew card is shown to people you haven’t met, so contact details can’t go on it.'
    crews.create.mockResolvedValue({ success: false, error: said, errorCode: 'BAD_REQUEST' })
    await toConsent()
    await press('Make the crew')
    await waitFor(() => screen.getByText(said))
    expect(screen.getByLabelText('Step 3 of 3, Consent')).toBeTruthy()
  })

  it('the server naming the line puts its sentence under the line', async () => {
    const said = 'A phone number. A crew card is shown to people you haven’t met, so contact details can’t go on it.'
    crews.create.mockResolvedValue({ success: false, error: said, errorCode: 'BAD_REQUEST', field: 'bio' })
    await toConsent()
    await press('Make the crew')
    await waitFor(() => screen.getByLabelText('Step 1 of 3, Name and vibe'))
    expect(screen.getByText(said)).toBeTruthy()
  })

  it.each([
    ['You can own up to 3 crews at a time.', 'Can’t make another crew'],
    ['That’s enough new crews for today — try again tomorrow.', 'Can’t make another crew'],
    ['You can only invite your friends into a crew.', 'Couldn’t do that'],
  ])('%s is a sheet in the server’s words', async (said, title) => {
    crews.create.mockResolvedValue({ success: false, error: said, errorCode: 'CONFLICT' })
    await toConsent()
    await press('Make the crew')
    await waitFor(() => screen.getByText(title))
    expect(screen.getByText(said)).toBeTruthy()
    // The form is as it was: Make the crew can be tried again.
    expect(screen.getByLabelText('Make the crew')).toBeTruthy()
  })

  it('the 18+ gate offers the way through', async () => {
    crews.create.mockResolvedValue({
      success: false,
      error: 'Crews are for people 18 and over who have finished setting up.',
      errorCode: 'FORBIDDEN',
    })
    await toConsent()
    await press('Make the crew')
    await waitFor(() => screen.getByText('Not yet'))
    await press('Finish setting up')
    expect(router.push).toHaveBeenCalledWith('/onboarding/basics')
  })
})

describe('going back', () => {
  it('system back goes back a step before it closes, and keeps what was typed', async () => {
    await toFriends()
    await act(async () => screen.getByTestId('make-modal').props.onRequestClose())
    await waitFor(() => screen.getByLabelText('Step 1 of 3, Name and vibe'))
    expect(screen.getByTestId('make-name-input').props.value).toBe('Nebula')
  })
})

describe('a link that closes the sheet keeps what was typed (review LOW)', () => {
  const nameField = () => screen.getByTestId('make-name-input')

  it('closed for a link: reopening gives back the name, the friends picked and the rest', async () => {
    await toFriends('Nebula')
    await waitFor(() => screen.getByRole('checkbox', { name: 'Ask Priya' }))
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Ask Priya' }))
    await act(async () => mockCloseForLink())
    await screen.unmount()

    await render(<NewCrewScreen />)
    expect(nameField().props.value).toBe('Nebula')
    await press('Next')
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


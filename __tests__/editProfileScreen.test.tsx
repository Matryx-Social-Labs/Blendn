/**
 * Edit profile on the design system (Flow 6 `edit`): the cards in the frame's order, the loading frame at its final geometry, Goals and
 * Looking for as DS chips with an Add sheet, and Save held while offline.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { StyleSheet } from 'react-native'

let mockOffline = false
jest.mock('../lib/networkStatus', () => ({
  getNetworkState: () => (mockOffline ? 'offline' : 'online'),
  subscribeNetworkState: () => () => {},
}))
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn() },
  useNavigation: () => ({ dispatch: jest.fn() }),
}))
jest.mock('expo-router/react-navigation', () => ({ usePreventRemove: () => {} }))
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 34, left: 0, right: 0 }) }))
jest.mock('../lib/useAuth', () => {
  const auth = { user: { id: 'me', name: 'Sam' } }
  return { useAuth: () => auth, refreshAuthUser: jest.fn() }
})
const mockShowToast = jest.fn()
jest.mock('../components/Toast', () => ({ useToast: () => ({ showToast: mockShowToast }) }))
jest.mock('../lib/sheet', () => ({ showSheet: jest.fn() }))
jest.mock('../components/PhotoManager', () => {
  const React = require('react')
  const { Pressable } = require('react-native')
  // A stand-in that can lift and drop a tile, as the real grid tells its host.
  return {
    __esModule: true,
    default: (p: { onDragging?: (d: boolean) => void }) => (
      <Pressable testID="photo-lift" onPressIn={() => p.onDragging?.(true)} onPressOut={() => p.onDragging?.(false)} />
    ),
  }
})
let mockPickInterests: (ids: string[]) => void = () => {}
jest.mock('../components/InterestPicker', () => ({ InterestPicker: (p: { onChange: (ids: string[]) => void }) => { mockPickInterests = p.onChange; return null }, MAX_INTERESTS: 10 }))
jest.mock('../lib/apiClient', () => ({
  ProfileCache: { clear: jest.fn() },
  apiClient: {
    getProfile: jest.fn(),
    getWorkFields: jest.fn(async () => ({ success: true, data: { workFields: [] } })),
    updateProfile: jest.fn(async () => ({ success: true })),
    addProfileInterests: jest.fn(),
    removeProfileInterests: jest.fn(),
  },
}))

/* eslint-disable import/first */
import EditProfile, { JOB_TITLE_LABEL } from '../app/edit-profile'
import { WORK_FIELD_HINT } from '../components/profile/MatchingFields'
import { apiClient } from '../lib/apiClient'
/* eslint-enable import/first */

const api = apiClient as jest.Mocked<typeof apiClient>
const LOADED = {
  success: true,
  data: { name: 'Sam', interests: [], profile: { age: 28, location: 'Bengaluru', bio: 'Records.', goals: ['Meet people'], looking_for: [] } },
}

beforeEach(() => {
  jest.clearAllMocks()
  mockOffline = false
  api.getProfile.mockResolvedValue(LOADED as never)
})

it('draws the cards in the frame’s order, matching between Photos and Basics', async () => {
  await render(<EditProfile />)
  await screen.findByDisplayValue('Sam')
  const titles = screen.getAllByRole('header').map((h) => h.props.children)
  const order = ['You and matching', 'Basic information', 'About you', 'Interests', 'Goals', 'Looking for']
  expect(titles.filter((t: string) => order.includes(t))).toEqual(order)
})

// DS-07: picked things count "n of max", the one format ChipSet uses; the spaced "0 / 10" goes. Negative control: the
// old format fails.
it('counts the interests picked as "n of max"', async () => {
  await render(<EditProfile />)
  await screen.findByDisplayValue('Sam')
  expect(screen.getByText('0 of 10')).toBeTruthy()
  expect(screen.queryByText(/\d+ \/ \d+/)).toBeNull()
})

it('says one interest is not enough to be matched, and stops saying it at two (SCRUM-519)', async () => {
  await render(<EditProfile />)
  await screen.findByDisplayValue('Sam')
  expect(screen.getByText('Pick at least 2 so we can match you.')).toBeTruthy()
  await act(async () => mockPickInterests(['a']))
  expect(screen.getByText('1 of 10')).toBeTruthy()
  expect(screen.getByText('Pick at least 2 so we can match you.')).toBeTruthy()
  await act(async () => mockPickInterests(['a', 'b']))
  expect(screen.getByText('2 of 10')).toBeTruthy()
  expect(screen.queryByText('Pick at least 2 so we can match you.')).toBeNull()
})

it('is the six fields’ shape while it loads, then the fields', async () => {
  api.getProfile.mockReturnValue(new Promise(() => {}))
  await render(<EditProfile />)
  expect(screen.getByTestId('fields-skeleton')).toBeTruthy()
  expect(screen.queryByTestId('edit-profile-name')).toBeNull()
})

it('counts the bio against its limit once, in the field’s own counter (not also in the card’s header)', async () => {
  await render(<EditProfile />)
  await screen.findByDisplayValue('Sam')
  expect(screen.getAllByText('8/500', { includeHiddenElements: true })).toHaveLength(1)
  expect(screen.queryByText('8 / 500')).toBeNull()
})

describe('no silent truncation: the server’s caps, with the count shown (SCRUM-745)', () => {
  const loadWith = (over: { name?: string; location?: string }) =>
    api.getProfile.mockResolvedValue({
      ...LOADED,
      data: { ...LOADED.data, name: over.name ?? 'Sam', profile: { ...LOADED.data.profile, location: over.location ?? 'Bengaluru' } },
    } as never)

  it('keeps a 90-character name and a 170-character location whole, and saves them as they are', async () => {
    const name = 'N'.repeat(90)
    const location = 'L'.repeat(170)
    loadWith({ name, location })
    await render(<EditProfile />)
    expect(await screen.findByDisplayValue(name)).toBeTruthy()
    expect(screen.getByDisplayValue(location)).toBeTruthy()
    // Typing one more character does not cut anything.
    await fireEvent.changeText(screen.getByTestId('edit-profile-location'), `${location}x`)
    expect(screen.getByDisplayValue(`${location}x`)).toBeTruthy()
    // Near the cap the DS counter appears: 171 of the server’s 200.
    // The counter is decoration for a screen reader (the field says the count in its hint), so look past that.
    expect(screen.getByText('171/200', { includeHiddenElements: true })).toBeTruthy()
    expect(screen.getByText('90/100', { includeHiddenElements: true })).toBeTruthy()
    await fireEvent.press(screen.getByText('Save'))
    await waitFor(() => expect(api.updateProfile).toHaveBeenCalledWith('me', expect.objectContaining({ location: `${location}x` })))
  })

  it('a field far from its cap shows no counter', async () => {
    await render(<EditProfile />)
    await screen.findByDisplayValue('Sam')
    expect(screen.queryByText(/^\d+\/(100|200)$/, { includeHiddenElements: true })).toBeNull()
  })

  it('a paste past the cap stays on screen, says by how much, and Save waits', async () => {
    await render(<EditProfile />)
    await screen.findByDisplayValue('Sam')
    const tooLong = 'L'.repeat(205)
    await fireEvent.changeText(screen.getByTestId('edit-profile-location'), tooLong)
    expect(screen.getByDisplayValue(tooLong)).toBeTruthy()
    expect(screen.getByText('200 characters at most.')).toBeTruthy()
    await fireEvent.press(screen.getByText('Save'))
    expect(api.updateProfile).not.toHaveBeenCalled()
    // Back inside the cap, Save goes through again.
    await fireEvent.changeText(screen.getByTestId('edit-profile-location'), 'L'.repeat(200))
    expect(screen.queryByText(/characters at most/)).toBeNull()
    await fireEvent.press(screen.getByText('Save'))
    await waitFor(() => expect(api.updateProfile).toHaveBeenCalled())
  })

  it('the name takes up to 100 (the server’s cap), not 50', async () => {
    await render(<EditProfile />)
    await screen.findByDisplayValue('Sam')
    const name = 'N'.repeat(100)
    await fireEvent.changeText(screen.getByTestId('edit-profile-name'), name)
    expect(screen.getByDisplayValue(name)).toBeTruthy()
    expect(screen.queryByText(/characters at most/)).toBeNull()
    await fireEvent.changeText(screen.getByTestId('edit-profile-name'), `${name}!`)
    expect(screen.getByText('100 characters at most.')).toBeTruthy()
  })
})

describe('Goals and Looking for', () => {
  it('are removable chips, with Add opening a sheet with one field', async () => {
    await render(<EditProfile />)
    await screen.findByDisplayValue('Sam')
    expect(screen.getByLabelText('Meet people, remove filter')).toBeTruthy()
    await fireEvent.press(screen.getByText('Add goal'))
    const input = await screen.findByTestId('edit-profile-goals-input-input')
    await fireEvent.changeText(input, 'Find a band')
    await fireEvent.press(screen.getByText('Add'))
    await screen.findByLabelText('Find a band, remove filter')
  })

  it('adds a phrase once, however many times it is typed', async () => {
    await render(<EditProfile />)
    await screen.findByDisplayValue('Sam')
    await fireEvent.press(screen.getByText('Add goal'))
    await fireEvent.changeText(await screen.findByTestId('edit-profile-goals-input-input'), 'Meet people')
    await fireEvent.press(screen.getByText('Add'))
    expect(screen.getAllByLabelText('Meet people, remove filter')).toHaveLength(1)
  })

  it('removes one by its ×', async () => {
    await render(<EditProfile />)
    await screen.findByDisplayValue('Sam')
    await fireEvent.press(screen.getByLabelText('Meet people, remove filter'))
    await waitFor(() => expect(screen.queryByLabelText('Meet people, remove filter')).toBeNull())
  })
})

it('holds Save while offline and says so', async () => {
  mockOffline = true
  await render(<EditProfile />)
  await screen.findByDisplayValue('Sam')
  expect(screen.getByTestId('offline-banner')).toBeTruthy()
  await fireEvent.press(screen.getByText('Save'))
  expect(api.updateProfile).not.toHaveBeenCalled()
})

describe('expertise, step 2 of the field of work (14.3)', () => {
  const WORK = {
    success: true,
    data: {
      workFields: [{ slug: 'design', label: 'Design' }, { slug: 'finance', label: 'Finance' }],
      expertiseByField: {
        design: [{ slug: 'design_product', label: 'Product design' }, { slug: 'design_ux', label: 'UX research' }],
        finance: [{ slug: 'finance_banking', label: 'Banking' }],
      },
      maxExpertise: 3,
    },
  }
  const PROFILE = { ...LOADED, data: { ...LOADED.data, profile: { ...LOADED.data.profile, work_field: 'design', expertise: ['design_product'] } } }

  beforeEach(() => {
    api.getProfile.mockResolvedValue(PROFILE as never)
    api.getWorkFields.mockResolvedValue(WORK as never)
  })

  it('offers the chips of the chosen field, with the saved ones on', async () => {
    await render(<EditProfile />)
    await screen.findByText('Product design')
    expect(screen.getByText('UX research')).toBeTruthy()
    expect(screen.queryByText('Banking')).toBeNull()
  })

  it('sends the expertise only when it changed', async () => {
    await render(<EditProfile />)
    await screen.findByText('UX research')
    await fireEvent.press(screen.getByText('Save'))
    await waitFor(() => expect(api.updateProfile).toHaveBeenCalled())
    expect(api.updateProfile.mock.calls[0][1]).not.toHaveProperty('expertise')

    api.updateProfile.mockClear()
    await fireEvent.press(screen.getByText('UX research'))
    await fireEvent.press(screen.getByText('Save'))
    await waitFor(() => expect(api.updateProfile).toHaveBeenCalled())
    expect(api.updateProfile.mock.calls[0][1]).toMatchObject({ expertise: ['design_product', 'design_ux'] })
  })

  it('clears them silently when the field changes, and sends the empty list with the new field', async () => {
    await render(<EditProfile />)
    await screen.findByText('UX research')
    await fireEvent.press(screen.getByText('Finance'))
    await waitFor(() => expect(screen.queryByText('UX research')).toBeNull())
    await fireEvent.press(screen.getByText('Save'))
    await waitFor(() => expect(api.updateProfile).toHaveBeenCalled())
    expect(api.updateProfile.mock.calls[0][1]).toMatchObject({ work_field: 'finance', expertise: [] })
  })
})

describe('fields of work that did not load (6-3, Edit profile · 04)', () => {
  it('the heading stands with the failure line under it, and the line reads them again', async () => {
    api.getWorkFields.mockResolvedValueOnce({ success: false, error: 'No internet connection.' } as never)
    await render(<EditProfile />)
    await screen.findByText('Couldn’t load fields of work. Try again.')
    expect(screen.getByText('WHAT DO YOU DO?')).toBeTruthy()
    api.getWorkFields.mockResolvedValueOnce({ success: true, data: { workFields: [{ slug: 'design', label: 'Design' }] } } as never)
    await fireEvent.press(screen.getByLabelText('Couldn’t load fields of work. Try again.'))
    await screen.findByText('Design')
    expect(screen.queryByText('Couldn’t load fields of work. Try again.')).toBeNull()
  })

  it('M8: the line is a full target tall, reaches up and down only, and holds still while it retries', async () => {
    api.getWorkFields.mockResolvedValueOnce({ success: false, error: 'No internet connection.' } as never)
    await render(<EditProfile />)
    const line = await screen.findByLabelText('Couldn’t load fields of work. Try again.')
    expect(StyleSheet.flatten(line.props.style).minHeight).toBeGreaterThanOrEqual(44)
    expect(line.props.hitSlop).toEqual({ top: 4, bottom: 4 })
    let answer: (v: unknown) => void = () => {}
    api.getWorkFields.mockReturnValueOnce(new Promise((r) => (answer = r)) as never)
    await fireEvent.press(line)
    const busy = await screen.findByLabelText('Trying again')
    expect(busy.props.accessibilityState).toMatchObject({ disabled: true, busy: true })
    await act(async () => answer({ success: false }))
    await screen.findByLabelText('Couldn’t load fields of work. Try again.')
  })

  it('a list that loaded draws no failure line', async () => {
    await render(<EditProfile />)
    await screen.findByDisplayValue('Sam')
    expect(screen.queryByText('Couldn’t load fields of work. Try again.')).toBeNull()
  })
})

it('stops the page scrolling while a photo is in the hand', async () => {
  await render(<EditProfile />)
  await screen.findByDisplayValue('Sam')
  const scroll = () => screen.getByTestId('edit-profile-scroll')
  expect(scroll().props.scrollEnabled).toBe(true)
  await fireEvent(screen.getByTestId('photo-lift'), 'pressIn')
  expect(scroll().props.scrollEnabled).toBe(false)
  await fireEvent(screen.getByTestId('photo-lift'), 'pressOut')
  expect(scroll().props.scrollEnabled).toBe(true)
})

it('a card’s label starts on its sets’ labels’ edge, and the about-you row’s title fits one line (r7 L8)', async () => {
  const { StyleSheet } = require('react-native')
  const { SPACE } = require('../lib/design/tokens')
  await render(<EditProfile />)
  await screen.findByDisplayValue('Sam')
  // FieldLabel's 4 pt inset, the one every set label inside the card has.
  expect(StyleSheet.flatten(screen.getByRole('header', { name: 'You and matching' }).props.style).paddingLeft).toBe(SPACE.xs)
  expect(screen.getByText('Languages, home & more')).toBeTruthy()
})

// D20 / D-L6: the free field says it is the job title and when it shows; placeholders fit an India-first app.
// Negative control: the old "Occupation" label or the US placeholders fail it.
it('names the job title and who sees it, with placeholders that fit here', async () => {
  await render(<EditProfile />)
  await screen.findByDisplayValue('Sam')
  expect(screen.getByText(JOB_TITLE_LABEL)).toBeTruthy()
  expect(screen.getByText(WORK_FIELD_HINT)).toBeTruthy()
  expect(screen.getByPlaceholderText('Area, city')).toBeTruthy()
  expect(screen.getByPlaceholderText('e.g. Christ University')).toBeTruthy()
  expect(screen.getByPlaceholderText('Tell people about yourself…')).toBeTruthy()
})

describe('a profile that fails to load (YOU-05, Edit profile 6-1)', () => {
  const retry = () => mockShowToast.mock.calls.at(-1)?.[2]?.action

  it('toasts with Try again, keeps Save off, and never writes a blank profile', async () => {
    api.getProfile.mockResolvedValue({ success: false, error: 'boom' } as never)
    await render(<EditProfile />)
    await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith('Couldn’t load your profile.', 'error', expect.objectContaining({ action: expect.objectContaining({ label: 'Try again' }) })))
    const save = await screen.findByRole('button', { name: /^Save/ })
    expect(save.props.accessibilityState?.disabled).toBe(true)
    await fireEvent.press(save)
    expect(api.updateProfile).not.toHaveBeenCalled()
  })

  it('Try again reads it again and, once it loads, the form is filled and Save is on', async () => {
    api.getProfile.mockResolvedValueOnce({ success: false, error: 'boom' } as never)
    await render(<EditProfile />)
    await waitFor(() => expect(retry()).toBeTruthy())
    await act(async () => retry().onPress())
    expect(await screen.findByDisplayValue('Sam')).toBeTruthy()
    expect(api.getProfile).toHaveBeenCalledTimes(2)
    const save = await screen.findByRole('button', { name: /^Save/ })
    expect(save.props.accessibilityState?.disabled).not.toBe(true)
  })

  it('a thrown read says the same', async () => {
    api.getProfile.mockRejectedValue(new Error('net') as never)
    await render(<EditProfile />)
    await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith('Couldn’t load your profile.', 'error', expect.anything()))
  })
})

describe('who sees each field on Edit profile (YOU-07, 14.0)', () => {
  const dating = (profile: Record<string, unknown>) =>
    api.getProfile.mockResolvedValue({ success: true, data: { name: 'Sam', interests: [], profile: { age: 28, location: 'Bengaluru', bio: 'Records.', goals: [], looking_for: [], intent_default: ['dating'], ...profile } } } as never)

  it('names the tier under intent, interests and the college', async () => {
    await render(<EditProfile />)
    await screen.findByDisplayValue('Sam')
    expect(screen.getByTestId('who-sees-intent')).toBeTruthy()
    expect(screen.getByTestId('who-sees-interests')).toBeTruthy()
    expect(screen.getByTestId('who-sees-college').props.accessibilityLabel).toBe('Shown only after you reveal yourself.')
  })

  it('orientation reads Nobody but you while show_orientation is off', async () => {
    dating({ show_orientation: false })
    await render(<EditProfile />)
    await screen.findByDisplayValue('Sam')
    expect(screen.getByTestId('who-sees-orientation').props.accessibilityLabel).toBe('Nobody but you sees this.')
  })

  it('orientation reads the reveal tier when the profile says show_orientation is on', async () => {
    dating({ show_orientation: true })
    await render(<EditProfile />)
    await screen.findByDisplayValue('Sam')
    expect(screen.getByTestId('who-sees-orientation').props.accessibilityLabel).toBe('Shown only after you reveal yourself.')
  })
})

it('swaps an interest at the cap: removes before it adds, because the server checks an add against what is held (SCRUM-747)', async () => {
  const calls: string[] = []
  api.removeProfileInterests.mockImplementation(async () => { calls.push('remove'); return { success: true } as never })
  api.addProfileInterests.mockImplementation(async () => { calls.push('add'); return { success: true } as never })
  api.getProfile.mockResolvedValue({ ...LOADED, data: { ...LOADED.data, interests: [{ id: 'held' }] } } as never)
  await render(<EditProfile />)
  await screen.findByDisplayValue('Sam')
  await act(async () => mockPickInterests(['new']))
  await fireEvent.press(screen.getByText('Save'))
  await waitFor(() => expect(calls).toEqual(['remove', 'add']))
  expect(api.removeProfileInterests).toHaveBeenCalledWith('me', ['held'])
  expect(api.addProfileInterests).toHaveBeenCalledWith('me', ['new'])
})

describe('the field of work at its daily limit (SCRUM-986)', () => {
  const save = async () => {
    await render(<EditProfile />)
    await screen.findByDisplayValue('Sam')
    await fireEvent.changeText(screen.getByTestId('edit-profile-location'), 'Mysuru')
    await fireEvent.press(screen.getByTestId('matching-work-field-software'))
    await fireEvent.press(screen.getByText('Save'))
  }
  beforeEach(() => {
    api.getWorkFields.mockResolvedValue({ success: true, data: { workFields: [{ slug: 'software', label: 'Software' }], expertiseByField: {} } } as never)
  })

  it('goes alone, so its refusal costs nothing else, and says why', async () => {
    api.updateProfile.mockResolvedValueOnce({ success: true } as never)
    api.updateProfile.mockResolvedValueOnce({ success: false, error: 'limit', errorCode: 'RATE_LIMITED' } as never)
    await save()
    await waitFor(() => expect(api.updateProfile).toHaveBeenCalledTimes(2))
    expect(api.updateProfile.mock.calls[0][1]).toEqual(expect.objectContaining({ location: 'Mysuru' }))
    expect(api.updateProfile.mock.calls[0][1]).not.toHaveProperty('work_field')
    expect(api.updateProfile.mock.calls[1][1]).toEqual({ work_field: 'software', expertise: [] })
    await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith('Saved, except your field of work. limit', 'error', expect.anything()))
    expect(mockShowToast).not.toHaveBeenCalledWith('Profile saved', 'success', expect.anything())
    // It reads the form again, so what was saved is the baseline and the field goes back.
    await waitFor(() => expect(api.getProfile).toHaveBeenCalledTimes(2))
  })

  it('says "Not saved" when the field was all there was, in the server’s words', async () => {
    api.updateProfile.mockResolvedValueOnce({ success: false, error: 'Three times a day.', errorCode: 'RATE_LIMITED' } as never)
    await render(<EditProfile />)
    await screen.findByDisplayValue('Sam')
    await fireEvent.press(screen.getByTestId('matching-work-field-software'))
    await fireEvent.press(screen.getByText('Save'))
    await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith('Not saved. Three times a day.', 'error', expect.anything()))
    expect(api.updateProfile).toHaveBeenCalledTimes(1)
  })

  it('any other failure of the field stays a plain failure', async () => {
    api.updateProfile.mockResolvedValueOnce({ success: true } as never)
    api.updateProfile.mockResolvedValueOnce({ success: false, error: 'boom', errorCode: 'SERVER_ERROR' } as never)
    await save()
    await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith('Couldn’t save your profile. Try again.', 'error', expect.anything()))
  })
})

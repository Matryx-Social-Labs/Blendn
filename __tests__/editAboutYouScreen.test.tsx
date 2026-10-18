/**
 * The about-you editor against a mocked API (step 10 review M4, M3, H1).
 *
 * Every field saves what the person chose: a test per field that the payload
 * matches the choice (this project once stored `true` for a preference somebody
 * said no to). The sign is never preselected: turning the switch on says the sign shows
 * next to the age, offers the birthday's sign as a hint to tap, and saves no
 * sign until one is picked. "Show my badges" saves off. A refused Tier B change
 * shows the server's own sentence.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'

jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() } }))
jest.mock('react-native-safe-area-context', () => {
  const React = require('react')
  const { View } = require('react-native')
  return { SafeAreaView: (p: object) => React.createElement(View, p), useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }
})
jest.mock('expo-linear-gradient', () => {
  const React = require('react')
  const { View } = require('react-native')
  return { LinearGradient: (p: object) => React.createElement(View, p) }
})
jest.mock('../lib/apiClient', () => ({
  apiClient: {
    getProfileOptions: jest.fn(),
    getProfile: jest.fn(),
    getThisOrThat: jest.fn(),
    updateProfile: jest.fn(),
    putThisOrThat: jest.fn(),
  },
  ProfileCache: { clear: jest.fn() },
}))
// One user object for the whole run, as the real singleton is: the screen loads once per user.
const mockMe = { user: { id: 'me' } }
jest.mock('../lib/useAuth', () => ({ useAuth: () => mockMe, refreshAuthUser: jest.fn() }))
const mockToast = jest.fn()
jest.mock('../components/Toast', () => ({ useToast: () => ({ showToast: mockToast }) }))
jest.mock('../lib/logger', () => ({ Logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() } }))

import { router } from 'expo-router'
import EditAboutYouScreen from '../app/edit-about-you'
import { apiClient, ProfileCache } from '../lib/apiClient'

const api = apiClient as unknown as Record<string, jest.Mock>

const OPTIONS = {
  languages: [
    { slug: 'tulu', label: 'Tulu' },
    { slug: 'kannada', label: 'Kannada' },
    { slug: 'tamil', label: 'Tamil' },
  ],
  maxLanguages: 2,
  homeStates: [
    { slug: 'kerala', label: 'Kerala' },
    { slug: 'goa', label: 'Goa' },
  ],
  signs: [
    { slug: 'leo', western: 'Leo', rashi: 'Simha', symbol: '♌' },
    { slug: 'virgo', western: 'Virgo', rashi: 'Kanya', symbol: '♍' },
  ],
  thisOrThat: [
    { slug: 'chai', a: 'Filter coffee', b: 'Chai' },
    { slug: 'beach', a: 'Beach', b: 'Hills' },
  ],
}

/** The profile as the server sends it; a test overrides only what it is about. */
const profile = (over: Record<string, unknown> = {}) => ({
  success: true,
  data: { profile: { suggested_sun_sign: 'leo', languages: [], home_state: null, ...over } },
})

beforeEach(() => {
  jest.clearAllMocks()
  api.getProfileOptions.mockResolvedValue({ success: true, data: OPTIONS })
  api.getProfile.mockResolvedValue(profile())
  api.getThisOrThat.mockResolvedValue({ success: true, data: { answers: {} } })
  api.updateProfile.mockResolvedValue({ success: true, data: {} })
  api.putThisOrThat.mockResolvedValue({ success: true, data: {} })
})

const open = async () => {
  await render(<EditAboutYouScreen />)
  await waitFor(() => expect(screen.getByText('Show my sign')).toBeTruthy())
}
const tap = async (text: string) => {
  await act(async () => {
    fireEvent.press(screen.getByText(text))
  })
}

const save = async () => {
  await act(async () => {
    fireEvent.press(screen.getByText('Save'))
  })
}

describe('the sign is never preselected (M4)', () => {
  it('says it shows next to the age, offers the birthday sign as a hint, and saves none until picked', async () => {
    await open()
    await act(async () => {
      fireEvent.press(screen.getByText('Show my sign'))
    })
    expect(screen.getByText(/Your sign shows next to your age/)).toBeTruthy()
    expect(screen.getByText('From your birthday: Leo ♌ — tap to use')).toBeTruthy()
    expect(screen.getByLabelText('Leo ♌').props.accessibilityState).toMatchObject({ selected: false })
    await save()
    expect(api.updateProfile).not.toHaveBeenCalled()

    await act(async () => {
      fireEvent.press(screen.getByText('From your birthday: Leo ♌ — tap to use'))
    })
    await save()
    expect(api.updateProfile).toHaveBeenCalledWith('me', { sun_sign: 'leo', sign_system: 'western' })
  })
})

describe('"Show my badges" (M3) and the Tier B refusal (H1)', () => {
  it('saves badges off', async () => {
    await open()
    await act(async () => {
      fireEvent.press(screen.getByText('Show my badges'))
    })
    await save()
    expect(api.updateProfile).toHaveBeenCalledWith('me', { show_badges: false })
  })

  it("shows the server's sentence when the day's changes are spent", async () => {
    const sentence = 'You can change your languages, home state, sign or field of work three times a day. Try again tomorrow.'
    api.updateProfile.mockResolvedValue({ success: false, error: sentence, errorCode: 'RATE_LIMITED' })
    await open()
    await act(async () => {
      fireEvent.press(screen.getByText('Tulu'))
    })
    await save()
    expect(mockToast).toHaveBeenCalledWith(sentence, 'error')
  })
})

describe('every field saves what the person chose', () => {
  it('languages: the pick, in the order picked; a pick taken back; nothing past the cap', async () => {
    await open()
    await tap('Kannada')
    await tap('Tulu')
    await tap('Tamil') // the cap is two: this one is not taken
    expect(screen.getByLabelText('Tamil').props.accessibilityState).toMatchObject({ selected: false })
    await save()
    expect(api.updateProfile).toHaveBeenCalledWith('me', { languages: ['kannada', 'tulu'] })
    expect(api.putThisOrThat).not.toHaveBeenCalled()
  })

  it('languages: taking the only one back saves an empty list, not the old one', async () => {
    api.getProfile.mockResolvedValue(profile({ languages: ['tulu'] }))
    await open()
    expect(screen.getByLabelText('Tulu').props.accessibilityState).toMatchObject({ selected: true })
    await tap('Tulu')
    await save()
    expect(api.updateProfile).toHaveBeenCalledWith('me', { languages: [] })
  })

  it('home state: the pick; tapping it again saves null', async () => {
    await open()
    await tap('Goa')
    await save()
    expect(api.updateProfile).toHaveBeenLastCalledWith('me', { home_state: 'goa' })

    api.getProfile.mockResolvedValue(profile({ home_state: 'kerala' }))
    await open()
    await tap('Kerala')
    await save()
    expect(api.updateProfile).toHaveBeenLastCalledWith('me', { home_state: null })
  })

  it('sign: the pick travels with its calendar; Western by default, My rashi instead when chosen', async () => {
    await open()
    await tap('Show my sign')
    await tap('Virgo ♍')
    await save()
    expect(api.updateProfile).toHaveBeenLastCalledWith('me', { sun_sign: 'virgo', sign_system: 'western' })
  })

  it('sign: the calendar is changed after the pick, and the pick follows it', async () => {
    await open()
    await tap('Show my sign')
    await tap('Leo ♌')
    await tap('My rashi instead')
    expect(screen.getByLabelText('Simha ♌').props.accessibilityState).toMatchObject({ selected: true })
    await save()
    expect(api.updateProfile).toHaveBeenLastCalledWith('me', { sun_sign: 'leo', sign_system: 'rashi' })
  })

  it('sign: the switch off saves no sign and no calendar', async () => {
    api.getProfile.mockResolvedValue(profile({ sun_sign: 'leo', sign_system: 'rashi' }))
    await open()
    await tap('Show my sign')
    await save()
    expect(api.updateProfile).toHaveBeenCalledWith('me', { sun_sign: null, sign_system: null })
  })

  it('this or that: a is a, b is b, the same again takes it back (null), and each question is its own', async () => {
    api.getThisOrThat.mockResolvedValue({ success: true, data: { answers: { beach: 'a' } } })
    await open()
    await tap('Chai')
    await tap('Beach') // already a: taken back
    await save()
    expect(api.putThisOrThat).toHaveBeenCalledWith({ chai: 'b', beach: null })
    expect(api.updateProfile).not.toHaveBeenCalled()
  })

  it('this or that: a switch from a to b saves b', async () => {
    api.getThisOrThat.mockResolvedValue({ success: true, data: { answers: { chai: 'a' } } })
    await open()
    await tap('Chai')
    await save()
    expect(api.putThisOrThat).toHaveBeenCalledWith({ chai: 'b' })
  })

  it('show my badges: on to off saves false; off to on saves true', async () => {
    await open()
    await tap('Show my badges')
    await save()
    expect(api.updateProfile).toHaveBeenLastCalledWith('me', { show_badges: false })

    api.getProfile.mockResolvedValue(profile({ show_badges: false }))
    await open()
    await tap('Show my badges')
    await save()
    expect(api.updateProfile).toHaveBeenLastCalledWith('me', { show_badges: true })
  })

  it('"Shows up": off to on saves true; on to off saves false — and never touches the badges', async () => {
    await open()
    await tap('Show “Shows up” on my card')
    await save()
    expect(api.updateProfile).toHaveBeenLastCalledWith('me', { shows_up_badge: true })

    api.getProfile.mockResolvedValue(profile({ shows_up_badge: true }))
    await open()
    await tap('Show “Shows up” on my card')
    await save()
    expect(api.updateProfile).toHaveBeenLastCalledWith('me', { shows_up_badge: false })
  })

  it('opening and saving writes nothing, and goes back', async () => {
    await open()
    await save()
    expect(api.updateProfile).not.toHaveBeenCalled()
    expect(api.putThisOrThat).not.toHaveBeenCalled()
    expect(router.back).toHaveBeenCalled()
  })

  it('every field at once is one profile write and one this-or-that write, each with only its own fields', async () => {
    await open()
    await tap('Tulu')
    await tap('Goa')
    await tap('Show my sign')
    await tap('Leo ♌')
    await tap('Filter coffee')
    await tap('Show my badges')
    await tap('Show “Shows up” on my card')
    await save()
    expect(api.updateProfile).toHaveBeenCalledTimes(1)
    expect(api.updateProfile).toHaveBeenCalledWith('me', {
      languages: ['tulu'],
      home_state: 'goa',
      sun_sign: 'leo',
      sign_system: 'western',
      show_badges: false,
      shows_up_badge: true,
    })
    expect(api.putThisOrThat).toHaveBeenCalledWith({ chai: 'a' })
  })

  it('a slug the server no longer offers is dropped from the form: the save never carries it, and clears a retired home state', async () => {
    api.getProfile.mockResolvedValue(profile({ languages: ['tulu', 'klingon'], home_state: 'atlantis' }))
    await open()
    await tap('Kannada')
    await save()
    expect(api.updateProfile).toHaveBeenCalledWith('me', { languages: ['tulu', 'kannada'], home_state: null })
  })
})

describe('the words and the grouping', () => {
  it('the design’s intro, the cap in words from the server’s number, and each pair named for a screen reader', async () => {
    await open()
    expect(screen.getByText('Where you’re from, what you speak, your sign. Each shows only to people who may already see who you are.')).toBeTruthy()
    expect(screen.getByText('Besides English, up to two.')).toBeTruthy()
    expect(screen.getByLabelText('Filter coffee or Chai')).toBeTruthy()
    expect(screen.getByLabelText('Beach or Hills')).toBeTruthy()
  })
})

describe('the states', () => {
  it('loading: the intro only, and Save is off', async () => {
    api.getProfileOptions.mockReturnValue(new Promise(() => {}))
    await render(<EditAboutYouScreen />)
    expect(screen.getByText(/Where you’re from, what you speak, your sign/)).toBeTruthy()
    expect(screen.queryByText('Languages you speak', { exact: false })).toBeNull()
    expect(screen.getByRole('button', { name: 'Save' }).props.accessibilityState.disabled).toBe(true)
    await save()
    expect(api.updateProfile).not.toHaveBeenCalled()
  })

  it('couldn’t load: one state with Try again, which asks again', async () => {
    api.getProfileOptions.mockResolvedValueOnce({ success: false, error: 'offline' })
    await render(<EditAboutYouScreen />)
    await waitFor(() => expect(screen.getByText('Couldn’t load this')).toBeTruthy())
    expect(screen.getByText('Check your connection and try again.')).toBeTruthy()
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Try again' }))
    })
    await waitFor(() => expect(screen.getByText('Show my sign')).toBeTruthy())
    expect(screen.queryByText('Couldn’t load this')).toBeNull()
  })

  it('couldn’t save: a toast, and the screen stays with the form as it was', async () => {
    api.updateProfile.mockResolvedValue({ success: false, error: 'boom' })
    await open()
    await tap('Goa')
    await save()
    expect(mockToast).toHaveBeenCalledWith('Couldn’t save. Try again.', 'error')
    expect(router.back).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Goa').props.accessibilityState).toMatchObject({ selected: true })
  })

  it('couldn’t save the answers: the same toast, and it stays', async () => {
    api.putThisOrThat.mockResolvedValue({ success: false, error: 'boom' })
    await open()
    await tap('Chai')
    await save()
    expect(mockToast).toHaveBeenCalledWith('Couldn’t save. Try again.', 'error')
    expect(router.back).not.toHaveBeenCalled()
  })

  it('saved: a toast, the caches dropped, and back', async () => {
    await open()
    await tap('Goa')
    await save()
    expect(mockToast).toHaveBeenCalledWith('Saved', 'success')
    expect(ProfileCache.clear).toHaveBeenCalled()
    expect(router.back).toHaveBeenCalled()
  })
})

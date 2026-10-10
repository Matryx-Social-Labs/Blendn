/**
 * The about-you editor against a mocked API (step 10 review M4, M3, H1).
 *
 * The sign is never preselected: turning the switch on says the sign shows
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
// The header's spinner is not under test; Save is.
jest.mock('../components/AppHeader', () => {
  const React = require('react')
  const { Pressable, Text } = require('react-native')
  return {
    AppHeader: (p: { rightTextButton: { label: string; onPress: () => void } }) =>
      React.createElement(Pressable, { onPress: p.rightTextButton.onPress }, React.createElement(Text, null, p.rightTextButton.label)),
  }
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

import EditAboutYouScreen from '../app/edit-about-you'
import { apiClient } from '../lib/apiClient'

const api = apiClient as unknown as Record<string, jest.Mock>

beforeEach(() => {
  jest.clearAllMocks()
  api.getProfileOptions.mockResolvedValue({
    success: true,
    data: {
      languages: [{ slug: 'tulu', label: 'Tulu' }],
      maxLanguages: 5,
      homeStates: [{ slug: 'kerala', label: 'Kerala' }],
      signs: [
        { slug: 'leo', western: 'Leo', rashi: 'Simha', symbol: '♌' },
        { slug: 'virgo', western: 'Virgo', rashi: 'Kanya', symbol: '♍' },
      ],
      thisOrThat: [],
    },
  })
  api.getProfile.mockResolvedValue({ success: true, data: { profile: { suggested_sun_sign: 'leo', languages: [], home_state: null } } })
  api.getThisOrThat.mockResolvedValue({ success: true, data: { answers: {} } })
  api.updateProfile.mockResolvedValue({ success: true, data: {} })
})

const save = async () => {
  await act(async () => {
    fireEvent.press(screen.getByText('Save'))
  })
}

describe('the sign is never preselected (M4)', () => {
  it('says it shows next to the age, offers the birthday sign as a hint, and saves none until picked', async () => {
    render(<EditAboutYouScreen />)
    await waitFor(() => expect(screen.getByText('Show my sign')).toBeTruthy())
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
    render(<EditAboutYouScreen />)
    await waitFor(() => expect(screen.getByText('Show my badges')).toBeTruthy())
    await act(async () => {
      fireEvent.press(screen.getByText('Show my badges'))
    })
    await save()
    expect(api.updateProfile).toHaveBeenCalledWith('me', { show_badges: false })
  })

  it("shows the server's sentence when the day's changes are spent", async () => {
    const sentence = 'You can change your languages, home state, sign or field of work three times a day. Try again tomorrow.'
    api.updateProfile.mockResolvedValue({ success: false, error: sentence, errorCode: 'RATE_LIMITED' })
    render(<EditAboutYouScreen />)
    await waitFor(() => expect(screen.getByText('Tulu')).toBeTruthy())
    await act(async () => {
      fireEvent.press(screen.getByText('Tulu'))
    })
    await save()
    expect(mockToast).toHaveBeenCalledWith(sentence, 'error')
  })
})

/**
 * Edit profile on the design system (Flow 6 `edit`): the cards in the frame's order, the loading frame at its final geometry, Goals and
 * Looking for as DS chips with an Add sheet, and Save held while offline.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'

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
jest.mock('../components/PhotoManager', () => ({ __esModule: true, default: () => null }))
jest.mock('../components/InterestPicker', () => ({ InterestPicker: () => null, MAX_INTERESTS: 10 }))
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
import EditProfile from '../app/edit-profile'
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

it('is the six fields’ shape while it loads, then the fields', async () => {
  api.getProfile.mockReturnValue(new Promise(() => {}))
  await render(<EditProfile />)
  expect(screen.getByTestId('fields-skeleton')).toBeTruthy()
  expect(screen.queryByTestId('edit-profile-name')).toBeNull()
})

it('counts the bio against its limit in the card’s header', async () => {
  await render(<EditProfile />)
  await screen.findByDisplayValue('Sam')
  expect(screen.getByText('8 / 500')).toBeTruthy()
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

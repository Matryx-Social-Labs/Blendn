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

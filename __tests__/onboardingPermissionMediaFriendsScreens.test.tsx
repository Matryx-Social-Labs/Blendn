/*
 * Location, Photos, Bring your friends, Preferences (Flow 2): the precise-location notice, the Settings sheet, a photo's
 * progress and its Retry, the friends primary that never dies, and the anonymity switch.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import React from 'react'

import { H } from '../lib/haptics'

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'))
const mockCommit = jest.fn(async (_patch?: unknown) => true)
let mockDraft: Record<string, unknown> = {}
const mockPerm = jest.fn()
const mockSelect = jest.fn()
const mockUpload = jest.fn()
const mockInvite = jest.fn()
const mockPulled = jest.fn(async (..._a: unknown[]) => [] as unknown[])
const mockSeen = jest.fn()
jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() }, useFocusEffect: jest.fn() }))
jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default)
jest.mock('../lib/perf', () => ({ ScreenProfiler: ({ children }: { children: React.ReactNode }) => children }))
jest.mock('../lib/useOnboarding', () => ({
  useOnboarding: () => ({ draft: mockDraft, loaded: true, saving: false, commit: mockCommit, skip: jest.fn(), goBack: jest.fn() }),
}))
jest.mock('../lib/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))
jest.mock('../components/Toast', () => ({ useToast: () => ({ showToast: jest.fn() }) }))
jest.mock('../components/OptimizedImage', () => ({ OptimizedImage: () => null }))
jest.mock('../lib/photoUtils', () => ({
  selectPhoto: () => mockSelect(),
  uploadPhoto: (...args: unknown[]) => mockUpload(...args),
  loadPulledPhotos: (...args: unknown[]) => mockPulled(...args),
}))
jest.mock('../lib/pulledNotices', () => ({ markPulledSeen: (...args: unknown[]) => mockSeen(...args) }))
jest.mock('../lib/useFriendInvite', () => ({ useFriendInvite: () => mockInvite() }))
jest.mock('../lib/cityStorage', () => ({ readStoredCity: jest.fn(async () => ({ city: 'Bengaluru', source: 'chosen' })) }))
jest.mock('expo-location', () => ({
  getForegroundPermissionsAsync: (...args: unknown[]) => mockPerm(...args),
  requestForegroundPermissionsAsync: jest.fn(async () => ({ status: 'denied' })),
}))

import FriendsIntroScreen from '../app/onboarding/friends'
import LocationScreen from '../app/onboarding/location'
import MediaScreen from '../app/onboarding/media'
import { PhotoTile } from '../components/onboarding/PhotoTile'
import PreferencesScreen from '../app/onboarding/preferences'

beforeEach(() => {
  jest.clearAllMocks()
  mockDraft = {}
  mockPulled.mockImplementation(async () => [])
})

describe('location', () => {
  it('draws the map with the browse city when there is one', async () => {
    mockPerm.mockResolvedValue({ granted: false, canAskAgain: true })
    await render(<LocationScreen />)
    expect(await screen.findByText('NEAR YOU · BENGALURU', { includeHiddenElements: true })).toBeTruthy()
    expect(screen.queryByTestId('precise-off-notice')).toBeNull()
  })

  it('Precise Location off is said above the map, and the map shortens to make room', async () => {
    mockPerm.mockResolvedValue({ granted: true, canAskAgain: true, ios: { accuracy: 'reduced' } })
    await render(<LocationScreen />)
    expect(await screen.findByTestId('precise-off-notice')).toBeTruthy()
    expect(screen.getByText('Precise location is off, so check-in can’t confirm you’re inside the venue. Turn it on in Settings.')).toBeTruthy()
  })

  it('a location the phone will not ask for again opens the Settings sheet, and the step waits', async () => {
    mockPerm.mockResolvedValue({ granted: false, canAskAgain: false })
    await render(<LocationScreen />)
    await fireEvent.press(screen.getByTestId('onboarding-primary'))
    expect(await screen.findByText('Turn this on in Settings')).toBeTruthy()
    expect(mockCommit).not.toHaveBeenCalled()
  })
})

describe('photos', () => {
  const picked = { ok: true, uri: 'file://one.jpg' }

  it('an empty step is one large well, and Continue sends nothing it has not got', async () => {
    await render(<MediaScreen />)
    expect(screen.getByLabelText('Add your main photo')).toBeTruthy()
    await fireEvent.press(screen.getByTestId('onboarding-primary'))
    expect(mockCommit).toHaveBeenCalledWith({ photos: [] })
  })

  it('an uploading tile shows its ring and percentage, is not “made main”, and carries no label pill', async () => {
    await render(
      <PhotoTile tile={{ key: 'k', state: 'uploading', uri: 'f', progress: 0.62 }} index={1} slot={160} onMakeMain={jest.fn()} onRemove={jest.fn()} onRetry={jest.fn()} />
    )
    expect(screen.getByText('62%')).toBeTruthy()
    expect(screen.getByLabelText('Uploading photo').props.accessibilityValue).toMatchObject({ now: 62 })
    expect(screen.queryByText('Make main')).toBeNull()
    expect(screen.getByLabelText('Photo 2, uploading').props.accessibilityState).toMatchObject({ disabled: true })
  })

  it('Continue waits while a tile uploads', async () => {
    mockSelect.mockResolvedValue(picked)
    let finish: (value: unknown) => void = () => {}
    mockUpload.mockImplementation(() => new Promise((resolve) => (finish = resolve)))
    await render(<MediaScreen />)
    const pressing = fireEvent.press(screen.getByLabelText('Add your main photo'))
    await waitFor(() => expect(screen.getByTestId('onboarding-primary').props.accessibilityState).toMatchObject({ disabled: true }))
    await act(async () => finish({ success: true, url: 'https://media/one' }))
    await pressing
    expect(screen.getByTestId('onboarding-primary').props.accessibilityState).toMatchObject({ disabled: false })
  })

  it('a failed upload keeps its file under Retry with one H.error, and Retry sends the same file again', async () => {
    const error = jest.spyOn(H, 'error').mockImplementation(() => {})
    mockSelect.mockResolvedValue(picked)
    mockUpload.mockResolvedValueOnce({ success: false, error: 'x' }).mockResolvedValueOnce({ success: true, url: 'https://media/one' })
    await render(<MediaScreen />)
    await fireEvent.press(screen.getByLabelText('Add your main photo'))
    expect(screen.getByText('Didn’t upload')).toBeTruthy()
    expect(error).toHaveBeenCalledTimes(1)
    await fireEvent.press(screen.getByTestId('photo-retry-0'))
    expect(mockUpload).toHaveBeenLastCalledWith('file://one.jpg', 'u1', undefined, 'profile', expect.any(Function))
    expect(screen.queryByText('Didn’t upload')).toBeNull()
    await fireEvent.press(screen.getByTestId('onboarding-primary'))
    expect(mockCommit).toHaveBeenCalledWith({ photos: ['https://media/one'] })
  })

  it('making another photo the main one ticks the selection once and puts it first', async () => {
    const select = jest.spyOn(H, 'select').mockImplementation(() => {})
    mockDraft = { photos: ['https://media/a', 'https://media/b'] }
    await render(<MediaScreen />)
    await fireEvent.press(screen.getByLabelText('Make photo 2 your main photo'))
    expect(select).toHaveBeenCalledTimes(1)
    await fireEvent.press(screen.getByTestId('onboarding-primary'))
    expect(mockCommit).toHaveBeenCalledWith({ photos: ['https://media/b', 'https://media/a'] })
  })

  describe('a photo moderation took down (2.3 #19, C13)', () => {
    const PULLED = { pulledAt: '2026-10-20T10:00:00Z', wasMain: false }
    const REMOVED = 'Removed. This photo didn’t meet the photo rules. Add a different photo'

    it('is an empty tile with the shield glyph, beside the photos, and the add well is still there', async () => {
      mockDraft = { photos: ['https://media/a', 'https://media/b'] }
      mockPulled.mockResolvedValue([PULLED])
      await render(<MediaScreen />)
      await screen.findByTestId('photo-tile-pulled')
      expect(screen.getByLabelText(REMOVED)).toBeTruthy()
      expect(screen.queryByText(/photo rules/)).toBeNull()
      expect(screen.getByLabelText('Add a photo')).toBeTruthy()
      expect(mockPulled).toHaveBeenCalledWith('u1')
    })

    it('× clears it for good, and says so to the phone so it is not drawn again', async () => {
      mockDraft = { photos: ['https://media/a'] }
      mockPulled.mockResolvedValue([PULLED])
      await render(<MediaScreen />)
      await fireEvent.press(await screen.findByLabelText('Dismiss removed photo'))
      expect(screen.queryByTestId('photo-tile-pulled')).toBeNull()
      expect(mockSeen).toHaveBeenCalledWith('u1', PULLED)
    })

    it('adding a different photo takes its notice away', async () => {
      mockDraft = { photos: ['https://media/a'] }
      mockPulled.mockResolvedValue([PULLED])
      mockSelect.mockResolvedValue(picked)
      mockUpload.mockResolvedValue({ success: true, url: 'https://media/two' })
      await render(<MediaScreen />)
      await fireEvent.press(await screen.findByLabelText(REMOVED))
      await waitFor(() => expect(screen.queryByTestId('photo-tile-pulled')).toBeNull())
      expect(mockSeen).toHaveBeenCalledWith('u1', PULLED)
    })

    it('a removed main photo says the next one is main now, and where to write', async () => {
      mockDraft = { photos: ['https://media/a'] }
      mockPulled.mockResolvedValue([{ ...PULLED, wasMain: true }])
      await render(<MediaScreen />)
      await screen.findByTestId('media-main-pulled')
      expect(screen.getByText('Your main photo was removed. The next one is your main photo now.')).toBeTruthy()
      expect(screen.getByText(/Think we got it wrong\? Write to/)).toBeTruthy()
    })

    it('with nothing left, it is only "Your main photo was removed."', async () => {
      mockDraft = {}
      mockPulled.mockResolvedValue([{ ...PULLED, wasMain: true }])
      await render(<MediaScreen />)
      await screen.findByText('Your main photo was removed.')
    })

    it('five photos leave the sixth place to the well: no empty tile takes it', async () => {
      mockDraft = { photos: ['a', 'b', 'c', 'd', 'e'].map((k) => `https://media/${k}`) }
      mockPulled.mockResolvedValue([PULLED])
      await render(<MediaScreen />)
      await screen.findByLabelText('Add a photo')
      expect(screen.queryByTestId('photo-tile-pulled')).toBeNull()
    })
  })

  it('a cancelled picker adds no tile', async () => {
    mockSelect.mockResolvedValue({ ok: false, cancelled: true })
    await render(<MediaScreen />)
    await fireEvent.press(screen.getByLabelText('Add your main photo'))
    expect(mockUpload).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Add your main photo')).toBeTruthy()
  })
})

describe('Bring your friends', () => {
  const invite = (over: object) => ({ invite: null, failed: false, share: jest.fn(async () => false), reload: jest.fn(async () => {}), ...over })

  it('a link that did not load makes Try again the primary, which reloads (never a dead button)', async () => {
    const state = invite({ failed: true })
    mockInvite.mockReturnValue(state)
    await render(<FriendsIntroScreen />)
    expect(screen.getByText('Your link didn’t load. Check your connection and try again.')).toBeTruthy()
    const primary = screen.getByTestId('onboarding-primary')
    expect(primary.props.accessibilityLabel).toBe('Try again')
    expect(primary.props.accessibilityState).toMatchObject({ disabled: false })
    await fireEvent.press(primary)
    expect(state.reload).toHaveBeenCalledTimes(1)
  })

  it('shows Share my link when ready, and Start Blend’n once it went somewhere', async () => {
    const state = invite({ invite: { url: 'https://blendn.app/i/8f3a' }, share: jest.fn(async () => true) })
    mockInvite.mockReturnValue(state)
    await render(<FriendsIntroScreen />)
    expect(screen.getByTestId('onboarding-primary').props.accessibilityLabel).toBe('Share my link')
    await fireEvent.press(screen.getByTestId('onboarding-primary'))
    expect(await screen.findByLabelText('Start Blend’n')).toBeTruthy()
    expect(screen.getByText('Shared. Anyone with the link can ask to be your friend.')).toBeTruthy()
    expect(screen.getByTestId('onboarding-secondary').props.accessibilityLabel).toBe('Share again')
  })

  it('keeps the glass bar even with nothing in it, as the frame draws it', async () => {
    mockInvite.mockReturnValue(invite({}))
    await render(<FriendsIntroScreen />)
    expect(screen.getByTestId('onboarding-header')).toBeTruthy()
    expect(screen.queryByTestId('onboarding-step')).toBeNull()
    expect(screen.queryByTestId('onboarding-back')).toBeNull()
  })

  it('while the link loads the primary is busy and the card says so', async () => {
    mockInvite.mockReturnValue(invite({}))
    await render(<FriendsIntroScreen />)
    expect(screen.getByText('Getting your link')).toBeTruthy()
    expect(screen.getByTestId('onboarding-primary').props.accessibilityState).toMatchObject({ busy: true })
  })
})

describe('preferences', () => {
  it('anonymous by default; the switch flips it, and what is stored is the inverse', async () => {
    await render(<PreferencesScreen />)
    expect(screen.getByText('You’d appear under a made-up name')).toBeTruthy()
    await fireEvent.press(screen.getByTestId('onboarding-anonymous'))
    expect(screen.getByText('Your name and photo, if you say so')).toBeTruthy()
    await fireEvent.press(screen.getByTestId('onboarding-primary'))
    expect(mockCommit).toHaveBeenCalledWith(expect.objectContaining({ reveal_by_default: true }))
  })

  it('Show on profile is there but out of the tree until an orientation is chosen', async () => {
    mockDraft = { dateOfBirth: '1990-01-01' }
    await render(<PreferencesScreen />)
    expect(screen.queryByTestId('onboarding-show-orientation')).toBeNull()
    await fireEvent.press(screen.getByLabelText(/^Bisexual/))
    expect(screen.getByTestId('onboarding-show-orientation')).toBeTruthy()
    expect(screen.getByText('Only people you match or talk with will see it. Never a room.')).toBeTruthy()
  })

  it('draws the looking-for tiles as the design system’s, and a minor never sees Dating', async () => {
    mockDraft = { dateOfBirth: `${new Date().getFullYear() - 16}-01-01` }
    await render(<PreferencesScreen />)
    expect(screen.queryByLabelText('Dating')).toBeNull()
    expect(screen.getByLabelText('Friendship')).toBeTruthy()
    expect(screen.queryByLabelText(/^Bisexual/)).toBeNull()
  })
})

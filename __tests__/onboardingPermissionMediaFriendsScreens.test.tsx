/*
 * Location, Photos, Bring your friends, Preferences (Flow 2): the precise-location notice, the Settings sheet, a photo's
 * progress and its Retry, the friends primary that never dies, and the anonymity switch.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import React from 'react'
import { StyleSheet } from 'react-native'

import { TYPE } from '../lib/design/tokens'
import { H } from '../lib/haptics'

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'))
const mockCommit = jest.fn(async (_patch?: unknown) => true)
let mockDraft: Record<string, unknown> = {}
const mockPerm = jest.fn()
const mockSelect = jest.fn()
const mockUpload = jest.fn()
const mockInvite = jest.fn()
const mockPulled = jest.fn(async (..._a: unknown[]) => ({ pulled: [] as unknown[], live: null as string[] | null }))
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
// Every creature is drawn by this one component: a marker in its place makes "no creature on onboarding" checkable (direction A).
jest.mock('../components/ds/Creature', () => {
  const { View: MockView } = jest.requireActual('react-native')
  return { ...jest.requireActual('../components/ds/Creature'), Creature: () => <MockView testID="creature-glyph" /> }
})
const noCreature = () => expect(screen.queryByTestId('creature-glyph', { includeHiddenElements: true })).toBeNull()
jest.mock('expo-location', () => ({
  getForegroundPermissionsAsync: (...args: unknown[]) => mockPerm(...args),
  requestForegroundPermissionsAsync: jest.fn(async () => ({ status: 'denied' })),
}))

import FriendsIntroScreen from '../app/onboarding/friends'
import LocationScreen from '../app/onboarding/location'
import MediaScreen from '../app/onboarding/media'
import { PhotoTile } from '../components/onboarding/PhotoTile'
import PreferencesScreen from '../app/onboarding/preferences'
import { stepPayload } from '../lib/onboarding'

beforeEach(() => {
  jest.clearAllMocks()
  mockDraft = {}
  mockPulled.mockImplementation(async () => ({ pulled: [], live: null }))
})

describe('location', () => {
  it('a still of the lit map, naming no city even with a browsed one stored (SCRUM-997), and no creature', async () => {
    mockPerm.mockResolvedValue({ granted: false, canAskAgain: true })
    await render(<LocationScreen />)
    expect(screen.getByRole('header', { name: 'See what’s on near you' })).toBeTruthy()
    expect(await screen.findByTestId('location-map', { includeHiddenElements: true })).toBeTruthy()
    expect(screen.queryByText(/BENGALURU|NEAR YOU|·/, { includeHiddenElements: true })).toBeNull()
    expect(screen.queryByTestId('precise-off-notice')).toBeNull()
    expect(screen.getByText('Maybe later')).toBeTruthy()
    noCreature()
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

  it('an empty step is one large well, and its primary is Choose a photo: the picker, never a save of nothing', async () => {
    mockSelect.mockResolvedValue({ ok: false, cancelled: true })
    await render(<MediaScreen />)
    expect(screen.getByRole('header', { name: 'Add a photo' })).toBeTruthy()
    expect(screen.getByLabelText('Add your main photo')).toBeTruthy()
    expect(screen.queryByTestId('media-you-they')).toBeNull()
    expect(screen.getByText('Choose a photo')).toBeTruthy()
    await fireEvent.press(screen.getByTestId('onboarding-primary'))
    expect(mockSelect).toHaveBeenCalledTimes(1)
    expect(mockCommit).not.toHaveBeenCalled()
    expect(screen.getByText('Skip')).toBeTruthy()
    noCreature()
  })

  it('with a main photo up it is shown twice, clear and blurred ("You see · They see"), and Continue saves it', async () => {
    mockDraft = { photos: ['https://cdn/one.jpg'] }
    await render(<MediaScreen />)
    const pair = screen.getByTestId('media-you-they')
    expect(pair.props.accessibilityLabel).toBe('Your photo, and how it looks to people before you show who you are: blurred')
    expect(screen.getByText('YOU SEE · THEY SEE', { includeHiddenElements: true })).toBeTruthy()
    expect(screen.getByTestId('media-they-see', { includeHiddenElements: true }).props.blurRadius).toBeGreaterThan(0)
    expect(screen.getByTestId('media-you-see', { includeHiddenElements: true }).props.blurRadius ?? 0).toBe(0)
    await fireEvent.press(screen.getByTestId('onboarding-primary'))
    expect(mockCommit).toHaveBeenCalledWith({ photos: ['https://cdn/one.jpg'] })
  })

  it('an empty step draws its six places: the main well marked "Main photo", and five small slots under it (GO-11, A11)', async () => {
    await render(<MediaScreen />)
    expect(screen.getByText('Main photo')).toBeTruthy()
    expect(screen.getAllByTestId(/^media-slot-hint-/, { includeHiddenElements: true })).toHaveLength(5)
    // One copy line for the limit: the subtitle's "Up to six.", not a second "Add up to 6." under it.
    expect(screen.queryByText(/up to 6/i)).toBeNull()
  })

  it('with two photos and the add well, three small slots say what is left', async () => {
    mockDraft = { photos: ['a', 'b'].map((k) => `https://media/${k}`) }
    await render(<MediaScreen />)
    await screen.findByLabelText('Add a photo')
    expect(screen.getAllByTestId(/^media-slot-hint-/, { includeHiddenElements: true })).toHaveLength(3)
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
      mockPulled.mockResolvedValue({ pulled: [PULLED], live: null })
      await render(<MediaScreen />)
      await screen.findByTestId('photo-tile-pulled')
      expect(screen.getByLabelText(REMOVED)).toBeTruthy()
      expect(screen.queryByText(/photo rules/)).toBeNull()
      expect(screen.getByLabelText('Add a photo')).toBeTruthy()
      expect(mockPulled).toHaveBeenCalledWith('u1')
    })

    it('× clears it for good, and says so to the phone so it is not drawn again', async () => {
      mockDraft = { photos: ['https://media/a'] }
      mockPulled.mockResolvedValue({ pulled: [PULLED], live: null })
      await render(<MediaScreen />)
      await fireEvent.press(await screen.findByLabelText('Dismiss removed photo'))
      expect(screen.queryByTestId('photo-tile-pulled')).toBeNull()
      expect(mockSeen).toHaveBeenCalledWith('u1', PULLED)
    })

    it('adding a different photo takes its notice away', async () => {
      mockDraft = { photos: ['https://media/a'] }
      mockPulled.mockResolvedValue({ pulled: [PULLED], live: null })
      mockSelect.mockResolvedValue(picked)
      mockUpload.mockResolvedValue({ success: true, url: 'https://media/two' })
      await render(<MediaScreen />)
      await fireEvent.press(await screen.findByLabelText(REMOVED))
      await waitFor(() => expect(screen.queryByTestId('photo-tile-pulled')).toBeNull())
      expect(mockSeen).toHaveBeenCalledWith('u1', PULLED)
    })

    it('a removed main photo says the next one is main now, and where to write', async () => {
      mockDraft = { photos: ['https://media/a'] }
      mockPulled.mockResolvedValue({ pulled: [{ ...PULLED, wasMain: true }], live: null })
      await render(<MediaScreen />)
      await screen.findByTestId('media-main-pulled')
      expect(screen.getByText('Your main photo was removed. The next one is your main photo now.')).toBeTruthy()
      expect(screen.getByText(/Think we got it wrong\? Write to/)).toBeTruthy()
    })

    it('with nothing left, it is only "Your main photo was removed."', async () => {
      mockDraft = {}
      mockPulled.mockResolvedValue({ pulled: [{ ...PULLED, wasMain: true }], live: null })
      await render(<MediaScreen />)
      await screen.findByText('Your main photo was removed.')
    })

    it('H2: the draft is reconciled with the photos that are up: Continue never sends a pulled URL, and keeps what is not saved yet', async () => {
      mockDraft = { photos: ['https://media/a', 'https://media/pulled', 'https://media/b'] }
      mockPulled.mockResolvedValue({ pulled: [PULLED], live: ['https://media/a', 'https://media/b'] })
      mockSelect.mockResolvedValue(picked)
      mockUpload.mockResolvedValue({ success: true, url: 'https://media/new' })
      await render(<MediaScreen />)
      await screen.findByTestId('photo-tile-pulled')
      // A photo added here and not saved yet is not in the profile's list: it is kept.
      await fireEvent.press(screen.getByLabelText('Add a photo'))
      await waitFor(() => expect(mockUpload).toHaveBeenCalled())
      await fireEvent.press(screen.getByTestId('onboarding-primary'))
      expect(mockCommit).toHaveBeenCalledWith({ photos: ['https://media/a', 'https://media/b', 'https://media/new'] })
      expect(JSON.stringify(mockCommit.mock.calls)).not.toContain('pulled')
    })

    it('H2: nothing pulled means the draft is the draft, even when the profile lists fewer photos', async () => {
      mockDraft = { photos: ['https://media/a', 'https://media/b'] }
      mockPulled.mockResolvedValue({ pulled: [], live: ['https://media/a'] })
      await render(<MediaScreen />)
      await screen.findByLabelText('Add a photo')
      await fireEvent.press(screen.getByTestId('onboarding-primary'))
      expect(mockCommit).toHaveBeenCalledWith({ photos: ['https://media/a', 'https://media/b'] })
    })

    it('H2: a profile read that failed (no list) judges nothing', async () => {
      mockDraft = { photos: ['https://media/a', 'https://media/pulled'] }
      mockPulled.mockResolvedValue({ pulled: [PULLED], live: null })
      await render(<MediaScreen />)
      await screen.findByTestId('photo-tile-pulled')
      await fireEvent.press(screen.getByTestId('onboarding-primary'))
      expect(mockCommit).toHaveBeenCalledWith({ photos: ['https://media/a', 'https://media/pulled'] })
    })

    it('H2: the draft read again later (a save swaps the uploads) is still held to the photos that are up', async () => {
      mockDraft = { photos: ['https://media/a', 'https://media/pulled'] }
      mockPulled.mockResolvedValue({ pulled: [PULLED], live: ['https://media/a'] })
      const view = await render(<MediaScreen />)
      await screen.findByTestId('photo-tile-pulled')
      mockDraft = { photos: ['https://media/a', 'https://media/pulled'].slice() }
      await view.rerender(<MediaScreen />)
      await fireEvent.press(screen.getByTestId('onboarding-primary'))
      expect(mockCommit).toHaveBeenLastCalledWith({ photos: ['https://media/a'] })
    })

    it('five photos leave the sixth place to the well: no empty tile takes it', async () => {
      mockDraft = { photos: ['a', 'b', 'c', 'd', 'e'].map((k) => `https://media/${k}`) }
      mockPulled.mockResolvedValue({ pulled: [PULLED], live: null })
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

  it('under the link it says how a friend link works, so the screen is not a card over an empty page (GO-11, A9)', async () => {
    mockInvite.mockReturnValue(invite({ invite: { url: 'https://blendn.app/i/8f3a' } }))
    await render(<FriendsIntroScreen />)
    expect(screen.getByTestId('friends-how')).toBeTruthy()
    expect(screen.getByText('They tap it and ask to be your friend.')).toBeTruthy()
  })

  it('while the link loads the primary is busy and the card says so', async () => {
    mockInvite.mockReturnValue(invite({}))
    await render(<FriendsIntroScreen />)
    expect(screen.getByText('Getting your link')).toBeTruthy()
    expect(screen.getByTestId('onboarding-primary').props.accessibilityState).toMatchObject({ busy: true })
  })
})

describe('preferences', () => {
  it('asks one question, its key words lit, with no creature anywhere on the step', async () => {
    await render(<PreferencesScreen />)
    expect(screen.getByRole('header', { name: 'What brings you out?' })).toBeTruthy()
    noCreature()
  })

  it('anonymity is one line with its switch: on by default, flipped, and what is stored is the inverse', async () => {
    await render(<PreferencesScreen />)
    const row = screen.getByTestId('onboarding-anonymous')
    expect(row.props.accessibilityState).toMatchObject({ checked: true })
    expect(screen.getByText('Stay anonymous at events')).toBeTruthy()
    await fireEvent.press(row)
    expect(screen.getByTestId('onboarding-anonymous').props.accessibilityState).toMatchObject({ checked: false })
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

  // What the hook sends: its merge of the draft and the patch, through the step's own fields.
  const sentOnContinue = (draft: Record<string, unknown>) =>
    stepPayload('preferences', { ...draft, ...(mockCommit.mock.calls.at(-1)?.[0] as object) })

  it('OUT-01: one tile, Continue: commit carries intent_default and no looking_for', async () => {
    mockDraft = { dateOfBirth: '1990-01-01' }
    await render(<PreferencesScreen />)
    await fireEvent.press(screen.getByTestId('looking-for-friendship'))
    await fireEvent.press(screen.getByTestId('onboarding-primary'))
    const patch = mockCommit.mock.calls.at(-1)?.[0] as Record<string, unknown>
    expect(patch.intent_default).toEqual(['friendship'])
    expect('looking_for' in patch).toBe(false)
    expect(sentOnContinue(mockDraft).intent_default).toEqual(['friendship'])
  })

  it('OUT-01: a minor whose draft holds a stale dating intent sends no intent at all', async () => {
    mockDraft = { dateOfBirth: `${new Date().getFullYear() - 17}-01-01`, intent_default: ['dating'] }
    await render(<PreferencesScreen />)
    expect(screen.queryByTestId('looking-for-dating')).toBeNull()
    await fireEvent.press(screen.getByTestId('onboarding-primary'))
    // The hook spreads the patch over the draft, so the patch must overwrite the stale value, not omit it.
    expect(sentOnContinue(mockDraft)).not.toHaveProperty('intent_default')
  })

  it('two photo cards and a plain third: Making friends, Networking, and Both (the flow walk’s three); no Dating tile', async () => {
    mockDraft = { dateOfBirth: `${new Date().getFullYear() - 16}-01-01` }
    await render(<PreferencesScreen />)
    expect(screen.getByLabelText('Making friends')).toBeTruthy()
    expect(screen.getByLabelText('Networking')).toBeTruthy()
    expect(screen.getByTestId('looking-for-both')).toBeTruthy()
    expect(screen.queryByLabelText('Dating')).toBeNull()
    expect(screen.queryByLabelText(/^Bisexual/)).toBeNull()
  })

  it('Both stores the two intents it means, and a resumed pair shows Both picked', async () => {
    mockDraft = { dateOfBirth: '1990-01-01' }
    await render(<PreferencesScreen />)
    await fireEvent.press(screen.getByTestId('looking-for-both'))
    await fireEvent.press(screen.getByTestId('onboarding-primary'))
    expect(sentOnContinue(mockDraft).intent_default).toEqual(['friendship', 'networking'])
  })

  it('a resumed pair of intents shows Both picked (control: a single one shows its card)', async () => {
    mockDraft = { dateOfBirth: '1990-01-01', intent_default: ['networking', 'friendship'] }
    await render(<PreferencesScreen />)
    expect(screen.getByRole('radio', { name: 'Both, depends on the night' }).props.accessibilityState).toMatchObject({ checked: true })
    mockDraft = { dateOfBirth: '1990-01-01', intent_default: ['networking'] }
    await render(<PreferencesScreen />)
    expect(screen.getByTestId('looking-for-networking').props.accessibilityState).toMatchObject({ selected: true })
    expect(screen.getByRole('radio', { name: 'Both, depends on the night' }).props.accessibilityState).toMatchObject({ checked: false })
  })

  it('an adult’s resumed intent the step does not show (dating) is kept when nothing is picked', async () => {
    mockDraft = { dateOfBirth: '1990-01-01', intent_default: ['dating'] }
    await render(<PreferencesScreen />)
    await fireEvent.press(screen.getByTestId('onboarding-primary'))
    expect(sentOnContinue(mockDraft).intent_default).toEqual(['dating'])
  })
})

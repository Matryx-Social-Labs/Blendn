/**
 * The photos screen sends what the server stored, after Back (SCRUM-491).
 *
 * Continue on this screen stores each new photo as the server's sealed copy and
 * deletes the upload. Back from the next step returns to this screen still
 * mounted, holding the upload URLs it sent; Continue again re-sent a deleted
 * upload, and the server refused it. The screen follows the draft's photos,
 * which the save replaced with the stored ones.
 */
import { fireEvent, render, screen } from '@testing-library/react-native'

const mockCommit = jest.fn(async () => true)
let mockDraft: { photos?: string[] } = {}
jest.mock('../lib/useOnboarding', () => ({
  useOnboarding: () => ({
    draft: mockDraft,
    loaded: true,
    saving: false,
    commit: mockCommit,
    skip: jest.fn(),
    goBack: jest.fn(),
  }),
}))
jest.mock('../lib/useAuth', () => ({ useAuth: () => ({ user: { id: 'u_1' } }) }))
jest.mock('../components/Toast', () => ({ useToast: () => ({ showToast: jest.fn() }) }))
jest.mock('../lib/photoUtils', () => ({ selectAndUploadPhoto: jest.fn() }))
jest.mock('react-native-safe-area-context', () => {
  const React = require('react')
  const { View } = require('react-native')
  return {
    SafeAreaView: (p: object) => React.createElement(View, p),
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  }
})
jest.mock('../lib/perf', () => ({ ScreenProfiler: ({ children }: { children: React.ReactNode }) => children }))

import MediaScreen from '../app/onboarding/media'

const UPLOAD = 'https://media.example/profile/u_1/1790846575859-7w473i-profile_1.jpg'
const SEALED = 'https://media.example/profile/u_1/1790846661493-rbjp8j-sealed'

it('sends the stored copy, not the deleted upload, when Continue is pressed again', async () => {
  mockDraft = { photos: [UPLOAD] }
  const view = await render(<MediaScreen />)

  // The save landed: the hook's draft now holds what the server stored.
  mockDraft = { photos: [SEALED] }
  await view.rerender(<MediaScreen />)
  await fireEvent.press(screen.getByText('Continue'))

  expect(mockCommit).toHaveBeenLastCalledWith({ photos: [SEALED] })
})

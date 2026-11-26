/**
 * D-030 (SCRUM-1467, client half of SCRUM-1384): before a reveal a person's card and profile page draw no exact age, no city
 * and no location, whatever the server sends. In a room of 20, age plus city picks one person out across rooms. A revealed
 * person (and your own page) keeps them.
 */
import { act, render, screen } from '@testing-library/react-native'

let mockParams: Record<string, string> = {}
const mockUser = { id: 'u_me' }

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn() },
  useLocalSearchParams: () => mockParams,
}))
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))
jest.mock('../lib/useAuth', () => ({ useAuth: () => ({ user: mockUser }) }))
jest.mock('../lib/apiClient', () => ({
  apiClient: {
    getPublicProfile: jest.fn(),
    getProfile: jest.fn(),
    getConversations: jest.fn(),
    getMessageRequests: jest.fn(),
    getSharedEvents: jest.fn(),
  },
}))
jest.mock('../lib/logger', () => ({ Logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(), journey: jest.fn() } }))
jest.mock('../components/Toast', () => ({ useToast: () => ({ showToast: jest.fn() }) }))
jest.mock('../components/profile/PhotoViewer', () => ({ PhotoViewer: () => null }))
jest.mock('../components/Skeleton', () => ({ SkeletonBlock: () => null, SkeletonLine: () => null }))
// The hero as text: its name, its age and its subtitle (the line that carried "· Toronto").
jest.mock('../components/profile/ProfileHeroStage', () => {
  const React = require('react')
  const { Text } = require('react-native')
  return {
    heroHeightFor: (w: number) => Math.round(w * 1.3),
    ProfileHeroStage: (p: { name: string; age?: number | null; subtitle?: string | null }) =>
      React.createElement(Text, null, `hero:${p.name}|age:${p.age ?? ''}|sub:${p.subtitle ?? ''}`),
  }
})

import { apiClient } from '../lib/apiClient'
import { withheldUnlessVisible } from '../lib/profileIdentity'
import { lensView, metaLine } from '../lib/roomLens'
import UserProfile from '../app/user/[id]'

const api = apiClient as jest.Mocked<typeof apiClient>
const LEAKY = { id: 'rh_bison', name: 'Gentle Bison', age: 31, location: 'Toronto' }
/** A deck card that carries an age, as the roster sends today. */
const DECK = { workField: null, sharedIntents: [], interests: [], overlaps: [], badges: [], age: 31 }
const tree = () => JSON.stringify(screen.toJSON())

const open = async (ready: RegExp) => {
  api.getConversations.mockResolvedValue({ success: true, data: [] } as never)
  api.getMessageRequests.mockResolvedValue({ success: true, data: { requests: [] } } as never)
  api.getSharedEvents.mockResolvedValue({ success: true, data: { events: [], pagination: { limit: 5, hasMore: false, nextCursor: null, totalCount: 0 } } } as never)
  await render(<UserProfile />)
  await screen.findByText(ready)
  await act(async () => { await new Promise((r) => setTimeout(r, 0)) })
}

beforeEach(() => {
  jest.clearAllMocks()
  mockParams = { id: 'rh_bison', pseudonym: 'Gentle Bison', roomSeed: 'e1:rh_bison' }
})

describe('the card meta line (`metaLine`, every person sheet and the lens page)', () => {
  it('an unrevealed person: "Anonymous", never their age, even when the deck sent one', () => {
    expect(metaLine(false, 31)).toBe('Anonymous')
    expect(metaLine(false, 31, 'Here 40 min')).toBe('Anonymous · Here 40 min')
    expect(lensView(DECK, null, null, false).meta).toBe('Anonymous')
  })

  it('a person shown to you keeps the age', () => {
    expect(metaLine(true, 31, 'Here 40 min')).toBe('Shown to you · 31 · Here 40 min')
    expect(lensView(DECK, null, null, true).meta).toBe('Shown to you · 31')
  })
})

describe('the profile payload (`withheldUnlessVisible`, both load branches of user/[id])', () => {
  it('drops age and location unless the server said you may see who this is', () => {
    const hidden = withheldUnlessVisible({ ...LEAKY, identityVisible: false })
    expect(hidden.age).toBeUndefined()
    expect(hidden.location).toBeUndefined()
    expect(withheldUnlessVisible({ ...LEAKY, identityVisible: true })).toMatchObject({ age: 31, location: 'Toronto' })
  })
})

describe('the profile page hero', () => {
  it('unrevealed (`GET /users/:id`): the pseudonym, no age, no city, though the payload had both', async () => {
    api.getPublicProfile.mockResolvedValue({ success: true, data: { ...LEAKY, identityVisible: false } } as never)
    await open(/hero:Gentle Bison/)
    expect(screen.getByText('hero:Gentle Bison|age:|sub:')).toBeTruthy()
    expect(tree()).not.toContain('Toronto')
  })

  it('unrevealed (the `/profiles/:id` fallback of an older server): no age, no city either', async () => {
    api.getPublicProfile.mockResolvedValue({ success: false, error: 'nope' } as never)
    api.getProfile.mockResolvedValue({ success: true, data: { name: 'Gentle Bison', profile: { age: 31, location: 'Toronto' } } } as never)
    await open(/hero:Gentle Bison/)
    expect(screen.getByText('hero:Gentle Bison|age:|sub:')).toBeTruthy()
    expect(tree()).not.toContain('Toronto')
  })

  it('revealed: their name, their age and their city', async () => {
    mockParams = { id: 'u_ben' }
    api.getPublicProfile.mockResolvedValue({ success: true, data: { ...LEAKY, id: 'u_ben', name: 'Ben', identityVisible: true } } as never)
    await open(/hero:Ben/)
    expect(screen.getByText('hero:Ben|age:31|sub:Toronto')).toBeTruthy()
  })
})

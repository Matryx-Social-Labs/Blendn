/**
 * "See as others do" (Me + settings A 01, SCRUM-1099): your own card as a room reads it, from `GET /me/preview` and nothing
 * guessed on the phone. Read-only: no Wave, Message or Block / Report. The anonymous side never carries the named side's
 * fields (negative control: a card built from `named` on both sides fails "shows nothing of you").
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native'

import { SeeAsOthersSheet } from '../components/profile/SeeAsOthersSheet'
import { MeIdentity } from '../components/profile/MeSections'
import { mePreviewFrom } from '../lib/mePreview'
import { atScale, resetScale } from './helpers/ax'

const mockPreview = jest.fn()
jest.mock('../lib/apiClient', () => ({ apiClient: { getMePreview: () => mockPreview() } }))
jest.mock('../lib/logger', () => ({ Logger: { debug: jest.fn(), warn: jest.fn(), error: jest.fn(), info: jest.fn() } }))
jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default)
jest.mock('../components/OptimizedImage', () => ({ OptimizedImage: () => null }))
// The Sheet's own behaviour is its own suite's: here it is its title, its content, its actions, and a dismissal on demand.
let mockDismissed: () => void = () => {}
jest.mock('../components/ds/Sheet', () => {
  const { Pressable, Text, View } = jest.requireActual('react-native')
  return {
    Sheet: (p: { visible: boolean; title: string; children: unknown; actions?: { label: string; onPress: () => void; kind?: string; testID?: string }[]; onDismissed?: () => void }) => {
      mockDismissed = p.onDismissed ?? (() => {})
      return p.visible ? (
        <View>
          <Text>{p.title}</Text>
          {p.children as never}
          {p.actions?.map((a) => (
            <Pressable key={a.label} testID={a.testID} onPress={a.onPress}>
              <Text>{a.label}</Text>
            </Pressable>
          ))}
        </View>
      ) : null
    },
  }
})
afterEach(resetScale)

const payload = {
  pseudonym: 'Velvet Otter',
  anonymous: { id: 'me', name: 'Velvet Otter', pseudonym: 'Velvet Otter', age: 27, location: 'Toronto', isOwnProfile: false, identityVisible: false },
  named: {
    id: 'me', name: 'Marc-André', image: 'https://cdn/i.jpg', photos: ['https://cdn/a.jpg'], bio: 'Terrible karaoke singer.', occupation: 'Product designer',
    education: null, languages: [], homeState: null, sign: null, age: 27, location: 'Toronto', interests: [{ id: '1', name: 'Karaoke', slug: 'karaoke', icon: null }],
    isOwnProfile: false, identityVisible: true, badges: [],
  },
}
const sparse = { ...payload, named: { ...payload.named, image: null, photos: [], bio: null, occupation: null, interests: [] } }
const ok = (data: unknown) => ({ success: true, data })
const onClose = jest.fn()
const onEdit = jest.fn()
const sheet = (visible = true) => <SeeAsOthersSheet visible={visible} onClose={onClose} onEdit={onEdit} />
const open = async (data: unknown = ok(payload)) => {
  mockPreview.mockResolvedValue(data)
  await render(sheet())
  await act(async () => {})
}
const show = async () => act(async () => fireEvent.press(screen.getByRole('tab', { name: 'Shown' })))
beforeEach(() => jest.clearAllMocks())

describe('mePreviewFrom', () => {
  it('reads both cards; nothing named reaches the anonymous one', () => {
    expect(mePreviewFrom(payload)).toEqual({
      anonymous: { name: 'Velvet Otter', age: 27 },
      named: { name: 'Marc-André', age: 27, photo: 'https://cdn/a.jpg', about: 'Terrible karaoke singer.', interests: ['Karaoke'], work: 'Product designer' },
    })
  })

  it('has no anonymous card before a first room: the server’s "Attendee" is never drawn as a name', () => {
    expect(mePreviewFrom({ ...payload, pseudonym: null, anonymous: { ...payload.anonymous, name: 'Attendee', pseudonym: undefined } })?.anonymous).toBeNull()
  })

  it('falls back to the account image, and is null for anything that is not a preview', () => {
    expect(mePreviewFrom({ ...payload, named: { ...payload.named, photos: [] } })?.named.photo).toBe('https://cdn/i.jpg')
    for (const bad of [null, undefined, {}, { pseudonym: 'x' }, { ...payload, named: { name: 7 } }]) expect(mePreviewFrom(bad)).toBeNull()
  })
})

describe('the sheet', () => {
  it('opens on Anonymous: the pseudonym, "Anonymous" with no age (D-030), and shows nothing of you', async () => {
    await open()
    expect(screen.getByText('Velvet Otter')).toBeTruthy()
    expect(screen.getByTestId('see-as-card-meta', { includeHiddenElements: true }).props.children).toBe('Anonymous')
    expect(screen.queryByText(/Marc-André|karaoke|Karaoke|designer/)).toBeNull()
    // A room no longer sees your age or city before you show who you are (D-030), so the preview never says it does.
    expect(screen.queryByText(/27|your city|your age|Toronto/)).toBeNull()
  })

  it('Shown: first name, "Shown to you · 27", bio, interests and work', async () => {
    await open()
    await show()
    for (const t of ['Marc-André', 'Shown to you · 27', 'Terrible karaoke singer.', 'Karaoke', 'Product designer']) expect(screen.getByText(t)).toBeTruthy()
    expect(screen.queryByText('Velvet Otter')).toBeNull()
  })

  it('is read-only on both sides: no Wave, Message, or Block / Report', async () => {
    await open()
    expect(screen.queryByLabelText(/Wave|Message|Block or report/)).toBeNull()
    await show()
    expect(screen.queryByLabelText(/Wave|Message|Block or report/)).toBeNull()
  })

  it('has no way to a whole page of yourself (Me is that page), and no actions with something to show', async () => {
    await open()
    await show()
    expect(screen.queryByText(/Full profile|Edit profile/)).toBeNull()
  })

  it('a plain close opens nothing', async () => {
    await open()
    await act(async () => mockDismissed())
    expect(onEdit).not.toHaveBeenCalled()
  })

  it('with only a name, says what would show and offers Edit profile instead', async () => {
    await open(ok(sparse))
    await show()
    expect(screen.getByText('Your photo, bio, interests and work show here once you add them.')).toBeTruthy()
    await act(async () => fireEvent.press(screen.getByText('Edit profile')))
    // Only once the sheet has left.
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onEdit).not.toHaveBeenCalled()
    await act(async () => mockDismissed())
    expect(onEdit).toHaveBeenCalledTimes(1)
  })

  it('before a first room: says so, and invents no name', async () => {
    await open(ok({ ...payload, pseudonym: null, anonymous: { ...payload.anonymous, name: 'Attendee' } }))
    expect(screen.getByText('You get a room name when you check in')).toBeTruthy()
    expect(screen.queryByText(/Attendee|Velvet Otter/)).toBeNull()
  })

  it('a failed read says so, and Try again reads again', async () => {
    await open({ success: false })
    expect(screen.getByText('Your preview didn’t load')).toBeTruthy()
    mockPreview.mockResolvedValue(ok(payload))
    await act(async () => fireEvent.press(screen.getByText('Try again')))
    expect(screen.getByText('Velvet Otter')).toBeTruthy()
  })

  it('reads only when opened, and reads afresh each time (an edit in between shows)', async () => {
    mockPreview.mockResolvedValue(ok(payload))
    const { rerender } = await render(sheet(false))
    await act(async () => {})
    expect(mockPreview).not.toHaveBeenCalled()
    await rerender(sheet(true))
    await act(async () => {})
    await rerender(sheet(false))
    await rerender(sheet(true))
    await act(async () => {})
    expect(mockPreview).toHaveBeenCalledTimes(2)
  })

  it('is a skeleton until it lands', async () => {
    mockPreview.mockReturnValue(new Promise(() => {}))
    await render(sheet())
    expect(screen.getByLabelText('Loading your preview')).toBeTruthy()
  })
})

describe('Me', () => {
  const me = (onPreview = jest.fn()) => <MeIdentity name="Marc-André Lefebvre-Desrosiers" age={27} onEdit={jest.fn()} onPhoto={jest.fn()} onPreview={onPreview} />

  it('has See as others do beside Edit profile', async () => {
    const onPreview = jest.fn()
    await render(me(onPreview))
    await act(async () => fireEvent.press(screen.getByTestId('me-preview')))
    expect(onPreview).toHaveBeenCalledTimes(1)
    expect(screen.getByText('See as others do')).toBeTruthy()
  })

  it('stacks the two at the largest text, each the full width', async () => {
    await atScale(3)
    await render(me())
    expect(screen.getByTestId('me-actions').props.style).toEqual(expect.arrayContaining([expect.objectContaining({ flexDirection: 'column' })]))
  })
})

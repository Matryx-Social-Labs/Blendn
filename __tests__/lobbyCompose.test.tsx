/**
 * C-A, the Lobby's compose sheet (SCRUM-1026): the type segment, its sub-kinds, spots on a ride or spots offer, words inside
 * 280, who you post as, and a photo that is always warned about before it leaves the phone.
 */
import { act, fireEvent, render, screen, within } from '@testing-library/react-native'

jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default)
jest.mock('../lib/apiClient', () => ({ apiClient: {} }))
jest.mock('../lib/photoUtils', () => ({ pickImage: jest.fn(), uploadChatPhoto: jest.fn() }))

import { LobbyCompose } from '../components/board/LobbyCompose'
import { pickImage, uploadChatPhoto } from '../lib/photoUtils'

const pick = pickImage as jest.Mock
const upload = uploadChatPhoto as jest.Mock
const picked = (uri: string) => ({ canceled: false, assets: [{ uri }] })

const draw = async (props: Partial<React.ComponentProps<typeof LobbyCompose>> = {}) => {
  const onPost = jest.fn()
  await render(<LobbyCompose visible posting={false} refusal={null} pseudonym="Quiet Lynx" onPost={onPost} onCancel={jest.fn()} {...props} />)
  return onPost
}
const sheet = () => within(screen.getByTestId('board-composer'))
const type = (label: string) => fireEvent.press(sheet().getByRole('radio', { name: label }))
const write = (text: string) => fireEvent.changeText(screen.getByLabelText('Your post'), text)
const post = () => screen.getByRole('button', { name: 'Post' })

beforeEach(() => jest.clearAllMocks())

describe('the type and its kinds', () => {
  it('opens on Offering, a ride, one spot: the segment is the three types as radios', async () => {
    await draw()
    expect(sheet().getByRole('radio', { name: 'Offering' }).props.accessibilityState).toMatchObject({ checked: true })
    expect(sheet().getByRole('radio', { name: 'Looking for' })).toBeTruthy()
    expect(sheet().getByRole('radio', { name: 'Just saying' })).toBeTruthy()
    expect(screen.getByText('Ride')).toBeTruthy()
    expect(screen.getByText('Spare ticket')).toBeTruthy()
    expect(screen.getByLabelText('How many can join you').props.accessibilityValue).toMatchObject({ now: 1 })
    expect(screen.getByText('How many can join you')).toBeTruthy()
  })

  it('opens on Looking for from that start card, with its own kinds and no spots', async () => {
    await draw({ initialKind: 'seeking' })
    expect(sheet().getByRole('radio', { name: 'Looking for' }).props.accessibilityState).toMatchObject({ checked: true })
    expect(screen.getByText('Someone to go with')).toBeTruthy()
    expect(screen.queryByLabelText('How many can join you')).toBeNull()
  })

  it('never offers a ticket where tickets are hidden', async () => {
    await draw({ ticketsHidden: true })
    expect(screen.queryByText('Spare ticket')).toBeNull()
    await type('Looking for')
    expect(screen.queryByText('A ticket')).toBeNull()
  })

  it('counts no spots on a spare ticket, and has no kinds at all for Just saying', async () => {
    await draw()
    await fireEvent.press(screen.getByText('Spare ticket'))
    expect(screen.queryByLabelText('How many can join you')).toBeNull()
    await type('Just saying')
    expect(screen.queryByText('Ride')).toBeNull()
    expect(screen.queryByLabelText('How many can join you')).toBeNull()
  })
})

describe('Post', () => {
  it('waits for words, and for them to fit in 280', async () => {
    const onPost = await draw()
    expect(post().props.accessibilityState).toMatchObject({ disabled: true })
    await write('x'.repeat(281))
    expect(post().props.accessibilityState).toMatchObject({ disabled: true })
    expect(screen.getByText('281 / 280')).toBeTruthy()
    await write('Two seats from Indiranagar')
    await fireEvent.press(post())
    expect(onPost).toHaveBeenCalledWith({ kind: 'offer', subKind: 'ride', body: 'Two seats from Indiranagar', spacesLeft: 1 })
  })

  it('sends each type as the server takes it', async () => {
    const onPost = await draw()
    await write('Anyone?')
    await fireEvent.press(screen.getByTestId('board-sub-spots'))
    await fireEvent(screen.getByLabelText('How many can join you'), 'accessibilityAction', { nativeEvent: { actionName: 'increment' } })
    await fireEvent.press(post())
    expect(onPost).toHaveBeenLastCalledWith({ kind: 'offer', subKind: 'spots', body: 'Anyone?', spacesLeft: 2 })
    await type('Looking for')
    await fireEvent.press(screen.getByText('Someone to go with'))
    await fireEvent.press(post())
    expect(onPost).toHaveBeenLastCalledWith({ kind: 'seeking', subKind: 'buddy', body: 'Anyone?' })
    await type('Just saying')
    await fireEvent.press(post())
    expect(onPost).toHaveBeenLastCalledWith({ kind: 'chat', body: 'Anyone?' })
  })

  it('says who you post as, and the server’s refusal under the words', async () => {
    await draw({ refusal: 'Mark yourself as going to post here' })
    expect(screen.getByText('Posting as')).toBeTruthy()
    expect(screen.getByText('Quiet Lynx')).toBeTruthy()
    expect(screen.getByText('Anonymous in this event')).toBeTruthy()
    expect(screen.getByText('Mark yourself as going to post here')).toBeTruthy()
  })
})

describe('a photo', () => {
  const start = async () => {
    const onPost = await draw({ initialKind: 'seeking' })
    await write('Sunset from the roof')
    pick.mockResolvedValueOnce(picked('file:///roof.jpg'))
    await fireEvent.press(screen.getByLabelText('Add a photo'))
    return onPost
  }

  it('is always warned about first: nothing uploads until Use it', async () => {
    await start()
    expect(pick).toHaveBeenCalledWith('library')
    expect(screen.getByText('You’re anonymous here')).toBeTruthy()
    expect(upload).not.toHaveBeenCalled()
  })

  it('Choose another picks again, and warns again', async () => {
    await start()
    pick.mockResolvedValueOnce(picked('file:///other.jpg'))
    await fireEvent.press(screen.getByRole('button', { name: 'Choose another' }))
    expect(pick).toHaveBeenCalledTimes(2)
    expect(screen.getByText('You’re anonymous here')).toBeTruthy()
    upload.mockResolvedValueOnce({ ok: true, url: 'https://cdn/x.jpg' })
    await fireEvent.press(screen.getByRole('button', { name: 'Use it' }))
    expect(upload).toHaveBeenCalledWith('file:///other.jpg', expect.any(Function))
  })

  it('uploads on Use it with its ring, holds Post until it lands, then sends it with its alt text', async () => {
    const onPost = await start()
    let land: (v: unknown) => void = () => {}
    upload.mockReturnValueOnce(new Promise((r) => (land = r)))
    await fireEvent.press(screen.getByRole('button', { name: 'Use it' }))
    expect(upload).toHaveBeenCalledWith('file:///roof.jpg', expect.any(Function))
    await act(async () => upload.mock.calls[0][1](0.62))
    expect(screen.getByRole('progressbar').props.accessibilityValue).toMatchObject({ now: 62 })
    expect(post().props.accessibilityState).toMatchObject({ disabled: true })
    await act(async () => land({ ok: true, url: 'https://cdn/roof.jpg' }))
    expect(screen.queryByRole('progressbar')).toBeNull()
    expect(screen.getByText('We remove location data from photos. Others see it once it’s checked.')).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: 'Add alt text' }))
    await fireEvent.changeText(screen.getByLabelText('Alt text'), 'The skyline at dusk')
    await fireEvent.press(post())
    expect(onPost).toHaveBeenCalledWith({ kind: 'seeking', subKind: 'ride', body: 'Sunset from the roof', photo: { url: 'https://cdn/roof.jpg', alt: 'The skyline at dusk' } })
  })

  it('a failed upload says so and leaves the words to post alone', async () => {
    const onPost = await start()
    upload.mockResolvedValueOnce({ ok: false, error: 'The photo didn’t finish. Try again.' })
    await fireEvent.press(screen.getByRole('button', { name: 'Use it' }))
    expect(screen.getByText('The photo didn’t finish. Try again.')).toBeTruthy()
    expect(screen.getByLabelText('Add a photo')).toBeTruthy()
    await fireEvent.press(post())
    expect(onPost).toHaveBeenCalledWith({ kind: 'seeking', subKind: 'ride', body: 'Sunset from the roof' })
  })

  it('removed, even mid-upload, it is not sent', async () => {
    const onPost = await start()
    let land: (v: unknown) => void = () => {}
    upload.mockReturnValueOnce(new Promise((r) => (land = r)))
    await fireEvent.press(screen.getByRole('button', { name: 'Use it' }))
    await fireEvent.press(screen.getByRole('button', { name: 'Remove photo' }))
    await act(async () => land({ ok: true, url: 'https://cdn/roof.jpg' }))
    await fireEvent.press(post())
    expect(onPost).toHaveBeenCalledWith({ kind: 'seeking', subKind: 'ride', body: 'Sunset from the roof' })
  })

  it('Choose another, then nothing chosen: the warning goes and no photo is left half-chosen', async () => {
    await start()
    pick.mockResolvedValueOnce(null)
    await fireEvent.press(screen.getByRole('button', { name: 'Choose another' }))
    expect(screen.queryByText('You’re anonymous here')).toBeNull()
    expect(screen.getByLabelText('Add a photo')).toBeTruthy()
  })

  it('a cancelled pick changes nothing', async () => {
    await draw()
    pick.mockResolvedValueOnce(null)
    await fireEvent.press(screen.getByLabelText('Add a photo'))
    expect(screen.queryByText('You’re anonymous here')).toBeNull()
    expect(screen.getByLabelText('Add a photo')).toBeTruthy()
  })
})

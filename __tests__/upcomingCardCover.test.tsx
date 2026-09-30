import { fireEvent, render, screen } from '@testing-library/react-native'

// The card's old thumb, stubbed so its import chain (apiClient wants an env
// var) needn't load. The fixed card no longer imports it.
jest.mock('../components/OptimizedImage', () => ({ OptimizedImage: () => null }))

import { UpcomingCard } from '../components/pulse/UpcomingCard'

/*
 * SCRUM-480: SCRUM-286 came back. #273 gave the Going card `EventCover`, and the
 * redesigns since moved every Going row (RSVP, Saved, Past) and the Pulse's
 * Upcoming list onto `UpcomingCard`, whose thumb was
 * `imageUrl ? <OptimizedImage/> : null`. Driven on staging: a saved event with
 * no cover drew an empty square with only the heart on it.
 */
const card = (imageUrl: string | null, retry?: number) => (
  <UpcomingCard title="No cover" timeLabel="22:54" imageUrl={imageUrl} retry={retry} onPress={() => {}} />
)

describe('UpcomingCard thumbnail', () => {
  it('draws the brand mark when the event has no picture', async () => {
    await render(card(null))
    expect(screen.getByTestId('event-cover-placeholder')).toBeTruthy()
  })

  it('draws the picture when there is one', async () => {
    await render(card('https://x.test/c.jpg'))
    expect(screen.getByTestId('event-cover-image')).toBeTruthy()
    expect(screen.queryByTestId('event-cover-placeholder')).toBeNull()
  })

  it('swaps to the brand mark when the picture fails to load', async () => {
    await render(card('https://dead.test/c.jpg'))
    fireEvent(screen.getByTestId('event-cover-image'), 'error', { nativeEvent: { error: '401' } })
    expect(await screen.findByTestId('event-cover-placeholder')).toBeTruthy()
  })

  it('tries the same picture again after a pull-to-refresh', async () => {
    const { rerender } = await render(card('https://dead.test/c.jpg', 0))
    fireEvent(screen.getByTestId('event-cover-image'), 'error', { nativeEvent: { error: '401' } })
    expect(await screen.findByTestId('event-cover-placeholder')).toBeTruthy()
    await rerender(card('https://dead.test/c.jpg', 1))
    expect(await screen.findByTestId('event-cover-image')).toBeTruthy()
  })
})

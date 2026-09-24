import { fireEvent, render, screen } from '@testing-library/react-native'
import { Text } from 'react-native'

import { EventCover } from '../components/EventCover'

/*
 * SCRUM-286. The Going card's image was `source={{ uri: cover || '' }}` with no
 * onError: a missing cover and a cover that failed to load (every seeded one on
 * staging on 2026-09-24, SCRUM-285) both drew an empty dark block. Either way
 * the card now shows the brand mark behind its text.
 */
describe('EventCover', () => {
  it('draws the photograph when there is one', async () => {
    await render(<EventCover uri="https://x.test/c.jpg" height={180}><Text>Title</Text></EventCover>)
    expect(screen.getByTestId('event-cover-image')).toBeTruthy()
    expect(screen.queryByTestId('event-cover-placeholder')).toBeNull()
    expect(screen.getByText('Title')).toBeTruthy()
  })

  it('draws the placeholder when there is no photograph', async () => {
    await render(<EventCover uri={null} height={180}><Text>Title</Text></EventCover>)
    expect(screen.getByTestId('event-cover-placeholder')).toBeTruthy()
    expect(screen.getByText('Title')).toBeTruthy()
  })

  it('swaps to the placeholder when the photograph fails to load', async () => {
    await render(<EventCover uri="https://dead.test/c.jpg" height={180}><Text>Title</Text></EventCover>)
    fireEvent(screen.getByTestId('event-cover-image'), 'error', { nativeEvent: { error: '401' } })
    expect(await screen.findByTestId('event-cover-placeholder')).toBeTruthy()
    expect(screen.getByText('Title')).toBeTruthy()
  })

  it('tries again when the same card is handed a new photograph', async () => {
    // A recycled list row, or a refetch that fixed the URL: the failure
    // belonged to the old URI and must not pin the card to the placeholder.
    const card = (uri: string) => <EventCover uri={uri} height={180}><Text>Title</Text></EventCover>
    const { rerender } = await render(card('https://dead.test/c.jpg'))
    fireEvent(screen.getByTestId('event-cover-image'), 'error', { nativeEvent: { error: '401' } })
    expect(await screen.findByTestId('event-cover-placeholder')).toBeTruthy()
    await rerender(card('https://alive.test/c.jpg'))
    expect(await screen.findByTestId('event-cover-image')).toBeTruthy()
  })

  it('tries the same photograph again after a pull-to-refresh', async () => {
    // The host that failed may be back; the URL string has not changed.
    const card = (retry: number) => (
      <EventCover uri="https://flaky.test/c.jpg" height={180} retry={retry}><Text>Title</Text></EventCover>
    )
    const { rerender } = await render(card(0))
    fireEvent(screen.getByTestId('event-cover-image'), 'error', { nativeEvent: { error: '401' } })
    expect(await screen.findByTestId('event-cover-placeholder')).toBeTruthy()
    await rerender(card(1))
    expect(await screen.findByTestId('event-cover-image')).toBeTruthy()
  })
})

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
})

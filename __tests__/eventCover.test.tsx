import { fireEvent, render, screen } from '@testing-library/react-native'

import { StyleSheet } from 'react-native'

import { EventCover } from '../components/EventCover'
import { COLOR } from '../lib/design/tokens'

jest.mock('../components/ui/Icon', () => {
  const { View } = jest.requireActual('react-native')
  return { Icon: ({ name, size, color }: { name: string; size: number; color: string }) => <View testID={`icon-${name}`} size={size} color={color} /> }
})

/*
 * SCRUM-286. The Going card's image was `source={{ uri: cover || '' }}` with no
 * onError: a missing cover and a cover that failed to load (every seeded one on
 * staging on 2026-09-24, SCRUM-285) both drew an empty dark block. Either way
 * the card now shows the brand mark.
 */
describe('EventCover', () => {
  it('draws the photograph when there is one', async () => {
    await render(<EventCover uri="https://x.test/c.jpg" height={180} />)
    expect(screen.getByTestId('event-cover-image')).toBeTruthy()
    expect(screen.queryByTestId('event-cover-placeholder')).toBeNull()
  })

  it('draws the placeholder when there is no photograph', async () => {
    await render(<EventCover uri={null} height={180} />)
    expect(screen.getByTestId('event-cover-placeholder')).toBeTruthy()
  })

  it('swaps to the placeholder when the photograph fails to load', async () => {
    await render(<EventCover uri="https://dead.test/c.jpg" height={180} />)
    fireEvent(screen.getByTestId('event-cover-image'), 'error', { nativeEvent: { error: '401' } })
    expect(await screen.findByTestId('event-cover-placeholder')).toBeTruthy()
  })

  it('tries again when the same card is handed a new photograph', async () => {
    // A recycled list row, or a refetch that fixed the URL: the failure
    // belonged to the old URI and must not pin the card to the placeholder.
    const card = (uri: string) => <EventCover uri={uri} height={180} />
    const { rerender } = await render(card('https://dead.test/c.jpg'))
    fireEvent(screen.getByTestId('event-cover-image'), 'error', { nativeEvent: { error: '401' } })
    expect(await screen.findByTestId('event-cover-placeholder')).toBeTruthy()
    await rerender(card('https://alive.test/c.jpg'))
    expect(await screen.findByTestId('event-cover-image')).toBeTruthy()
  })

  it('tries the same photograph again after a pull-to-refresh', async () => {
    // The host that failed may be back; the URL string has not changed.
    const card = (retry: number) => (
      <EventCover uri="https://flaky.test/c.jpg" height={180} retry={retry} />
    )
    const { rerender } = await render(card(0))
    fireEvent(screen.getByTestId('event-cover-image'), 'error', { nativeEvent: { error: '401' } })
    expect(await screen.findByTestId('event-cover-placeholder')).toBeTruthy()
    await rerender(card(1))
    expect(await screen.findByTestId('event-cover-image')).toBeTruthy()
  })

  it('keeps the mark to the same share of a small box, a list row thumb (SCRUM-480)', async () => {
    const markWidth = () =>
      StyleSheet.flatten(screen.getByTestId('event-cover-mark').props.style).width
    const { rerender } = await render(<EventCover uri={null} height={180} />)
    expect(markWidth()).toBe(72)
    await rerender(<EventCover uri={null} height={96} />)
    expect(markWidth()).toBe(38)
    // And never larger than it is on the card.
    await rerender(<EventCover uri={null} height={240} />)
    expect(markWidth()).toBe(72)
  })
})

describe('EventCover with a category (D8)', () => {
  const hidden = { includeHiddenElements: true }

  it('with no photograph draws the category plate, not the faint logo', async () => {
    await render(<EventCover uri={null} height={180} category="music" />)
    expect(StyleSheet.flatten(screen.getByTestId('event-cover-plate', hidden).props.style).backgroundColor).toBe(COLOR.selectionEmberFill)
    expect(screen.getByTestId('icon-music-2', hidden)).toBeTruthy()
    expect(screen.queryByTestId('event-cover-mark', hidden)).toBeNull()
    expect(StyleSheet.flatten(screen.getByTestId('event-cover-placeholder', hidden).props.style).height).toBe(180)
  })

  it('a photograph that fails falls back to the plate', async () => {
    await render(<EventCover uri="https://dead.test/c.jpg" height={180} category="sports" />)
    fireEvent(screen.getByTestId('event-cover-image'), 'error', { nativeEvent: { error: '401' } })
    expect(await screen.findByTestId('icon-trophy', hidden)).toBeTruthy()
  })
})

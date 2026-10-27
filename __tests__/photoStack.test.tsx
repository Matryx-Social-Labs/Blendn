/** YOU-08: the Me photo stack is a flickable SwipeDeck (a pan past the threshold sends the top card to the back); one photo cannot be flicked. */
import { render, screen } from '@testing-library/react-native'

import { PhotoStack } from '../components/profile/PhotoStack'

jest.mock('../components/OptimizedImage', () => ({ OptimizedImage: () => null }))

it('offers the next-photo action and the swipe hint with several photos', async () => {
  await render(<PhotoStack photos={['a', 'b', 'c']} onPress={jest.fn()} />)
  const deck = screen.getByLabelText('Your photos')
  expect(deck.props.accessibilityActions).toEqual([{ name: 'activate' }, { name: 'increment', label: 'Next photo' }])
  expect(deck.props.accessibilityHint).toMatch(/Swipe the photos sideways/)
})

it('with one photo there is nothing to flick: it only opens', async () => {
  await render(<PhotoStack photos={['a']} onPress={jest.fn()} />)
  expect(screen.getByLabelText('Your photos').props.accessibilityActions).toEqual([{ name: 'activate' }])
})

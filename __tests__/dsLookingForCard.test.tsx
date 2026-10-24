/**
 * DS-21 (A35): the Looking-for tile's word sits on an ink scrim. It was a CSS `experimental_backgroundImage`, which the
 * audit did not see on the device; it is now the DS `PhotoScrim` (a LinearGradient, as EventCard's), clear over the top
 * 30% and 78% ink at the foot, drawn on every architecture.
 */
import { render, screen } from '@testing-library/react-native'
import React from 'react'
import { StyleSheet } from 'react-native'

import { LookingForCard } from '../components/ds/LookingForCard'
import { COLOR } from '../lib/design/tokens'
import { tint } from '../lib/theme'

jest.mock('expo-linear-gradient', () => {
  const { View } = jest.requireActual('react-native')
  return { LinearGradient: (props: object) => <View {...props} /> }
})

it('draws the scrim as a gradient node under the word: clear over the top 30%, 78% ink at the foot', async () => {
  await render(<LookingForCard label="Friendship" image={{ uri: 'https://example.com/f.jpg' }} testID="lf" />)
  const scrim = screen.getByTestId('lf-scrim', { includeHiddenElements: true })
  expect(scrim.props.colors).toEqual([tint(COLOR.ink, 0), tint(COLOR.ink, 0.78)])
  const style = StyleSheet.flatten(scrim.props.style)
  expect(style).toMatchObject({ position: 'absolute', top: '30%', bottom: 0, left: 0, right: 0 })
  expect(style.experimental_backgroundImage).toBeUndefined()
})

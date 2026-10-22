/*
 * Banter's live room card with no cover is the brand orbs on ink, held still in a list, as the Scene and Room info draw a
 * room with nothing to show (r7 M6): never a flat grey card. With a cover, the photograph.
 */
import { render, screen } from '@testing-library/react-native'
import React from 'react'

import { LiveHero } from '../components/banter/BanterParts'

jest.mock('expo-linear-gradient', () => {
  const { View } = jest.requireActual('react-native')
  return { LinearGradient: (props: object) => <View {...props} /> }
})
jest.mock('../lib/apiClient', () => ({ apiClient: {} }))

const card = (coverUrl: string | null) => (
  <LiveHero title="Vinyl Night" coverUrl={coverUrl} count={12} line={null} unread={0} muted={false} onPress={() => {}} testID="h" />
)

it('no cover: the brand orbs', async () => {
  await render(card(null))
  expect(screen.getByTestId('h-orbs', { includeHiddenElements: true })).toBeTruthy()
})

it('a cover: the photograph, no orbs', async () => {
  await render(card('https://x/y.jpg'))
  expect(screen.queryByTestId('h-orbs', { includeHiddenElements: true })).toBeNull()
})

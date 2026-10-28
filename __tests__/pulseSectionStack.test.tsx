/**
 * Nearby's location card (FIX-ROUND-FINAL GO-08, audit A24): it asks in place of Nearby in a feed that has something on.
 * With nothing loaded (a failed load, an empty city) the page's own state is the answer, and "Turn on location" under
 * "Couldn't load events" offered the wrong way back from being offline.
 */
import { render, screen } from '@testing-library/react-native'
import React from 'react'

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'))
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 47, bottom: 34, left: 0, right: 0 }) }))
jest.mock('expo-linear-gradient', () => {
  const { View } = jest.requireActual('react-native')
  return { LinearGradient: (props: object) => <View {...props} /> }
})
jest.mock('../lib/apiClient', () => ({ apiClient: {} }))
jest.mock('../components/pulse/FeedMedia', () => ({ FeedMedia: () => null }))

/* eslint-disable import/first */
import { SectionStack } from '../components/pulse/PulseSections'
/* eslint-enable import/first */

const event = { id: 'e1', title: 'Vinyl Night', venue_name: 'Toit', start_time: new Date(Date.now() + 3_600_000).toISOString(), end_time: new Date(Date.now() + 7_200_000).toISOString(), cover_image_url: null } as never
const stack = (sections: React.ComponentProps<typeof SectionStack>['sections']) => (
  <SectionStack
    sections={sections}
    now={Date.now()}
    withDistance={false}
    visible
    handlers={{ onPress: jest.fn(), onPressIn: jest.fn(), onLongPress: jest.fn() }}
    coachRef={React.createRef()}
    pending={{ current: false }}
    featuredLayout={() => ({ width: 300, inset: 24 })}
    askForLocation={{ denied: false, onAsk: jest.fn() }}
  />
)

it('asks in place of Nearby in a feed that has something on', async () => {
  await render(stack([{ key: 'tonight', events: [event], count: 1 }]))
  expect(screen.getByTestId('pulse-nearby-ask')).toBeTruthy()
})

it('with nothing loaded it is not drawn: location is not the way back from offline', async () => {
  await render(stack([]))
  expect(screen.queryByTestId('pulse-nearby-ask')).toBeNull()
})

it('a section counted from a full page prints its count as a floor (BAR-10)', async () => {
  await render(stack([{ key: 'tonight', events: [event], count: 50, more: true }]))
  expect(screen.getByTestId('pulse-tonight-header')).toBeTruthy()
  expect(screen.getByText('50+')).toBeTruthy()
})

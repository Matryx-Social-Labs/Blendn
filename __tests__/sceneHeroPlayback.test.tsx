/**
 * Audit H2 (a11y-motion 2026-10-24): the event hero's clip autoplayed and looped under Reduce Motion with no way to stop
 * it (WCAG 2.2.2). Under Reduce Motion the hero is the poster, nothing plays; in every mode a clip in view has a
 * Pause/Play `IconButton` (media tier) that says what it will do.
 */
import { fireEvent, render, screen } from '@testing-library/react-native'
import React from 'react'
import { View } from 'react-native'

import { SceneHero } from '../components/scene/SceneHero'

const mockPlayer = { play: jest.fn(), pause: jest.fn(), addListener: () => ({ remove: () => {} }), loop: false, muted: false }
jest.mock('expo-video', () => ({
  useVideoPlayer: () => mockPlayer,
  VideoView: (props: object) => {
    const { View: V } = jest.requireActual('react-native')
    return <V {...props} testID="hero-clip" />
  },
}))
jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default)
let mockReduce = false
jest.mock('../lib/motion', () => ({ ...jest.requireActual('../lib/motion'), useReducedMotion: () => mockReduce }))

const CLIP = { kind: 'video' as const, url: 'https://x.test/a.mp4', posterUrl: 'https://x.test/a.jpg' }
const STILL = { kind: 'image' as const, url: 'https://x.test/b.jpg' }
const hero = (playlist = [CLIP]) => (
  <View>
    <SceneHero source={undefined} playlist={playlist} title="Vinyl night" when="9 PM" place="at Toit" />
  </View>
)
const control = () => screen.getByTestId('scene-hero-playback')

beforeEach(() => {
  jest.clearAllMocks()
  mockReduce = false
})

it('plays, and Pause holds the frame; Play carries on', async () => {
  await render(hero())
  expect(screen.getByTestId('hero-clip')).toBeTruthy()
  expect(mockPlayer.play).toHaveBeenCalledTimes(1)
  expect(screen.getByRole('button', { name: 'Pause video' })).toBeTruthy()
  await fireEvent.press(control())
  expect(mockPlayer.pause).toHaveBeenCalledTimes(1)
  expect(screen.getByTestId('hero-clip')).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Play video' })).toBeTruthy()
  await fireEvent.press(control())
  expect(mockPlayer.play).toHaveBeenCalledTimes(2)
})

it('under Reduce Motion: the poster, nothing plays, until Play is pressed', async () => {
  mockReduce = true
  await render(hero())
  expect(screen.queryByTestId('hero-clip')).toBeNull()
  expect(mockPlayer.play).not.toHaveBeenCalled()
  expect(screen.getByRole('button', { name: 'Play video' })).toBeTruthy()
  await fireEvent.press(control())
  expect(screen.getByTestId('hero-clip')).toBeTruthy()
  expect(mockPlayer.play).toHaveBeenCalledTimes(1)
  expect(screen.getByRole('button', { name: 'Pause video' })).toBeTruthy()
})

it('no control over stills: nothing there plays', async () => {
  await render(hero([STILL]))
  expect(screen.queryByTestId('scene-hero-playback')).toBeNull()
})

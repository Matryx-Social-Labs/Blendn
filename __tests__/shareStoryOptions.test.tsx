/*
 * The Story options sheet (guidelines/flow-16 `storyOptions`, Flow 16 · 16.3): the card, one toggle that starts off, the
 * Link-sticker note, Share to Instagram and Not now. The picture that goes out is a second copy of the card drawn off
 * screen at exactly 1080 device pixels, and it follows the toggle.
 */
const mockShareStory = jest.fn()
const mockCaptureStory = jest.fn()
const mockCoverReady = jest.fn()
jest.mock('../lib/storyShare', () => ({
  ...jest.requireActual('../lib/storyShare'),
  shareStory: (...a: unknown[]) => mockShareStory(...a),
  captureStory: (...a: unknown[]) => mockCaptureStory(...a),
  coverReady: (...a: unknown[]) => mockCoverReady(...a),
  storyCaptureWidth: () => 360,
}))
jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default)
jest.mock('expo-glass-effect', () => {
  const { View } = jest.requireActual('react-native')
  return { GlassView: (props: object) => <View {...props} />, isGlassEffectAPIAvailable: jest.fn(() => true), isLiquidGlassAvailable: jest.fn(() => true) }
})
jest.mock('expo-linear-gradient', () => {
  const { View } = jest.requireActual('react-native')
  return { LinearGradient: (props: object) => <View {...props} /> }
})

import { act, fireEvent, render, screen } from '@testing-library/react-native'
import React from 'react'
import { StyleSheet } from 'react-native'

import { StoryOptionsSheet, type StoryVariant } from '../components/share/StoryOptionsSheet'

const EVENT: Extract<StoryVariant, { kind: 'story' }> = {
  kind: 'story',
  event: {
    title: 'Neon Nights',
    date: { day: 'SAT', num: '04', month: 'OCT', time: '9:00 PM' },
    venue: 'Toit',
    area: 'Indiranagar',
    cover: 'https://img/c.jpg',
    url: 'https://www.blendn.app/e/e1',
  },
}
const RECAP: StoryVariant = { kind: 'recap', month: 'September', stats: [{ value: '14', label: 'nights out' }, { value: '9', label: 'venues' }, { value: '4', label: 'neighbourhoods' }], topVenue: 'Toit' }

const sheet = (props: Partial<React.ComponentProps<typeof StoryOptionsSheet>> = {}) => (
  <StoryOptionsSheet visible onClose={jest.fn()} onDone={jest.fn()} variant={EVENT} url="https://www.blendn.app/e/e1" testID="s" {...props} />
)

beforeEach(() => {
  mockShareStory.mockReset().mockResolvedValue('image')
  mockCaptureStory.mockReset().mockResolvedValue('file:///story.png')
  mockCoverReady.mockReset().mockResolvedValue(undefined)
})

describe('the sheet', () => {
  it('says what it is, with the toggle off and the note under it', async () => {
    await render(sheet())
    expect(screen.getByText('Share to your Story')).toBeTruthy()
    const toggle = screen.getByRole('switch', { name: /Say I’m going/ })
    expect(toggle.props.accessibilityState.checked).toBe(false)
    expect(screen.getByText('Adds “I’m going” to the card. Off unless you turn it on.')).toBeTruthy()
    expect(screen.getByText(/The link is copied first — add it with the Link sticker/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Share to Instagram' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Not now' })).toBeTruthy()
  })

  it('draws the card twice: a 150-wide preview, and the export copy exactly the capture width, off screen', async () => {
    await render(sheet())
    const card = (id: string) => StyleSheet.flatten(screen.getByTestId(id, { includeHiddenElements: true }).props.style)
    expect(card('s-card').width).toBe(150)
    expect(card('s-card').height).toBeCloseTo(266.67, 1)
    expect(card('s-photo-card')).toMatchObject({ width: 360, height: 640 })
    const photo = StyleSheet.flatten(screen.getByTestId('s-photo', { includeHiddenElements: true }).props.style)
    expect(photo.left).toBeLessThan(-1000)
    expect(screen.getByTestId('s-photo', { includeHiddenElements: true }).props.collapsable).toBe(false)
  })

  it('“I’m going” is on the card only when the toggle is on, in the preview and in the export copy alike', async () => {
    await render(sheet())
    expect(screen.queryAllByText('I’m going', { includeHiddenElements: true })).toHaveLength(0)
    await fireEvent.press(screen.getByRole('switch', { name: /Say I’m going/ }))
    expect(screen.getAllByText('I’m going', { includeHiddenElements: true })).toHaveLength(2)
    expect(screen.getByRole('switch', { name: /Say I’m going/ }).props.accessibilityState.checked).toBe(true)
  })

  it('starts off again for a new sheet', async () => {
    const { rerender } = await render(sheet())
    await fireEvent.press(screen.getByRole('switch', { name: /Say I’m going/ }))
    await rerender(sheet({ visible: false }))
    await rerender(sheet({ visible: true }))
    expect(screen.getByRole('switch', { name: /Say I’m going/ }).props.accessibilityState.checked).toBe(false)
  })

  it('Share to Instagram copies the link and photographs the card once the cover has painted, then reports the outcome', async () => {
    const onDone = jest.fn()
    await render(sheet({ onDone }))
    await fireEvent.press(screen.getByRole('button', { name: 'Share to Instagram' }))
    const { url, capture } = mockShareStory.mock.calls[0][0]
    expect(url).toBe('https://www.blendn.app/e/e1')
    await capture()
    expect(mockCoverReady).toHaveBeenCalledWith('https://img/c.jpg')
    expect(mockCaptureStory).toHaveBeenCalledTimes(1)
    await act(async () => {})
    expect(onDone).toHaveBeenCalledWith('image')
  })

  it('Not now just closes', async () => {
    const onClose = jest.fn()
    await render(sheet({ onClose }))
    await fireEvent.press(screen.getByRole('button', { name: 'Not now' }))
    expect(onClose).toHaveBeenCalled()
    expect(mockShareStory).not.toHaveBeenCalled()
  })

  it('draws nothing off screen while it is closed', async () => {
    await render(sheet({ visible: false }))
    expect(screen.queryByTestId('s-photo', { includeHiddenElements: true })).toBeNull()
  })
})

describe('the recap', () => {
  it('is “Share your September” with the top venue off, and no link to copy', async () => {
    await render(sheet({ variant: RECAP, url: undefined }))
    expect(screen.getByText('Share your September')).toBeTruthy()
    expect(screen.getByRole('switch', { name: /Show top venue/ }).props.accessibilityState.checked).toBe(false)
    expect(screen.queryAllByText('Toit', { includeHiddenElements: true })).toHaveLength(0)
    await fireEvent.press(screen.getByRole('switch', { name: /Show top venue/ }))
    expect(screen.getAllByText('Toit', { includeHiddenElements: true }).length).toBeGreaterThan(0)
  })

  it('waits for no cover', async () => {
    await render(sheet({ variant: RECAP, url: undefined }))
    await fireEvent.press(screen.getByRole('button', { name: 'Share to Instagram' }))
    await mockShareStory.mock.calls[0][0].capture()
    expect(mockCoverReady).toHaveBeenCalledWith(null)
  })
})

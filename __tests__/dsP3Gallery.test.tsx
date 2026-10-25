/*
 * The P3 gallery (app/preview/ds-p3): every component's cells render, and the
 * live room wires the gestures end to end: a swipe puts the reply in the
 * composer, a hold opens the menu, a reaction lands and closes it, Send adds
 * the message.
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native'
import React from 'react'
import { State } from 'react-native-gesture-handler'
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils'

import DsP3Preview from '../app/preview/ds-p3'
import { H } from '../lib/haptics'

jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default)
jest.mock('expo-video', () => {
  const { View } = jest.requireActual('react-native')
  return {
    useVideoPlayer: () => ({ addListener: () => ({ remove: () => {} }), play: () => {} }),
    VideoView: (props: object) => <View {...props} />,
  }
})

beforeEach(() => {
  for (const k of Object.keys(H)) jest.spyOn(H, k as keyof typeof H).mockImplementation(() => {})
})

describe('the gallery, app/preview/ds-p3', () => {
  it('draws a cell for every component', async () => {
    await render(<DsP3Preview />)
    for (const id of [
      'ds-demo-feed',
      'ds-demo-composer',
      'ds-demo-swiperow',
      'ds-chatbubble-0',
      'ds-receiptmark-states',
      'ds-reactionbar-default',
      'ds-reactionpill-states',
      'ds-contextmenu-0',
      'ds-composer-empty',
      'ds-composer-muted',
      'ds-composer-notcheckedin',
      'ds-systemline',
      'ds-systemnotice-info',
      'ds-broadcast-sponsored-video',
      'ds-poll-voted',
      'ds-typing-many',
      'ds-unread-count',
      'ds-daypill',
      'ds-reply-composer',
      'ds-swiperow-open',
      'ds-coach-top',
    ])
      expect(screen.getByTestId(id, { includeHiddenElements: true })).toBeTruthy()
  })

  it('the live room: swipe to reply, hold for the menu, a reaction lands, Send adds it', async () => {
    await render(<DsP3Preview />)
    await act(async () =>
      fireGestureHandler(getByGestureTestId('ds-demo-bubble-b-swipe'), [
        { state: State.BEGAN, translationX: 0 },
        { state: State.ACTIVE, translationX: 0 },
        { state: State.ACTIVE, translationX: 80 },
        { state: State.END, translationX: 80 },
      ])
    )
    expect(screen.getAllByText('Replying to Cosmic Panda').length).toBeGreaterThan(0)

    await act(async () =>
      fireGestureHandler(getByGestureTestId('ds-demo-bubble-b-hold'), [{ state: State.BEGAN }, { state: State.ACTIVE }, { state: State.END }])
    )
    expect(screen.getByTestId('ds-demo-menu-menu')).toBeTruthy()
    await fireEvent.press(screen.getAllByRole('button', { name: 'React, heart' })[0])
    // The menu leaves over `quick` and the Modal goes after it.
    await waitFor(() => expect(screen.queryByTestId('ds-demo-menu-menu')).toBeNull())
    expect(within(screen.getByTestId('ds-demo-feed')).getByRole('button', { name: 'heart, 1, including you' })).toBeTruthy()

    const field = screen.getAllByLabelText('Message')[0]
    await fireEvent.changeText(field, 'Side one, obviously.')
    await fireEvent.press(screen.getAllByRole('button', { name: 'Send' })[0])
    expect(within(screen.getByTestId('ds-demo-feed')).getByText('Side one, obviously.')).toBeTruthy()
  })
})

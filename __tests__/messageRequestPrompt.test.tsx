/*
 * The message request on a profile (Flow 6 R4.1 6.2 · 03): Accept plays H.primary on press-in as every Accept does, since a lit
 * button is silent unless its caller names one; Decline plays nothing.
 */
import { fireEvent, render, screen } from '@testing-library/react-native'
import React from 'react'

import { MessageRequestPrompt } from '../components/profile/MessageRequestPrompt'
import { H } from '../lib/haptics'

jest.mock('react-native-reanimated', () => ({ ...jest.requireActual('react-native-reanimated'), __esModule: true, useReducedMotion: jest.fn(() => false) }))

it('Accept plays H.primary on press-in, and Decline nothing', async () => {
  const primary = jest.spyOn(H, 'primary').mockImplementation(() => {})
  await render(<MessageRequestPrompt name="Priya" answering={null} onAccept={jest.fn()} onDecline={jest.fn()} />)
  await fireEvent(screen.getByTestId('request-decline'), 'pressIn')
  expect(primary).not.toHaveBeenCalled()
  await fireEvent(screen.getByTestId('request-accept'), 'pressIn')
  expect(primary).toHaveBeenCalledTimes(1)
})

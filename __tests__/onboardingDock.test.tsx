/*
 * The docked primary registers its height for the Android snackbar, less the inset the toast adds itself: at rest the dock
 * holds the home-indicator inset, over the keyboard it holds none.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import React from 'react'
import { Text } from 'react-native'

import { Dock } from '../components/onboarding/Dock'
import { ToastDockContext } from '../components/toastDock'

jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 34, left: 0, right: 0 }) }))

const HEIGHT = 200
const draw = async (keyboardUp: boolean) => {
  const register = jest.fn(() => () => {})
  await render(
    <ToastDockContext.Provider value={register}>
      <Dock keyboardUp={keyboardUp} testID="dock">
        <Text>Continue</Text>
      </Dock>
    </ToastDockContext.Provider>
  )
  await act(async () => {
    fireEvent(screen.getByTestId('dock'), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 390, height: HEIGHT } } })
  })
  return register
}

it('at rest the snackbar stands above the dock less the inset the toast adds', async () => {
  const register = await draw(false)
  expect(register).toHaveBeenLastCalledWith(expect.any(String), HEIGHT - 34)
})

it('with the keyboard up the dock holds no inset, so the whole height is registered', async () => {
  const register = await draw(true)
  expect(register).toHaveBeenLastCalledWith(expect.any(String), HEIGHT)
})

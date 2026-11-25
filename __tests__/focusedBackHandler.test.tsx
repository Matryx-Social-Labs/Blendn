/**
 * The Room is an overlay under the root stack, so a chat or a DM pushed from it sits ABOVE a still-mounted Room. Its
 * Android back handler used to stay registered there (and ahead of the root's): the first back closed the Room under the
 * chat — nothing visible — and the second popped the chat onto the Pulse (SCRUM-952). A handler may only answer while
 * its screen is the focused one.
 */
import { render } from '@testing-library/react-native'
import { BackHandler } from 'react-native'

let mockFocused = true
jest.mock('expo-router', () => ({
  useFocusEffect: (effect: () => void | (() => void)) => {
    const React = require('react')
    React.useEffect(() => (mockFocused ? effect() : undefined), [effect])
  },
}))

import { useFocusedBackHandler } from '../lib/useFocusedBackHandler'

function Probe({ onBack }: { onBack: () => boolean }) {
  useFocusedBackHandler(onBack)
  return null
}

const remove = jest.fn()
beforeEach(() => {
  remove.mockReset()
  jest.spyOn(BackHandler, 'addEventListener').mockReturnValue({ remove })
})
afterEach(() => jest.restoreAllMocks())

it('answers back while its screen is focused', async () => {
  mockFocused = true
  await render(<Probe onBack={() => true} />)
  expect(BackHandler.addEventListener).toHaveBeenCalledWith('hardwareBackPress', expect.any(Function))
})

it('answers nothing while another screen is on top of it', async () => {
  mockFocused = false
  await render(<Probe onBack={() => true} />)
  expect(BackHandler.addEventListener).not.toHaveBeenCalled()
})

it('lets go of back when the screen unmounts', async () => {
  mockFocused = true
  const view = await render(<Probe onBack={() => true} />)
  await view.unmount()
  expect(remove).toHaveBeenCalledTimes(1)
})

it('the Room registers through it, not with a bare effect', () => {
  const src: string = require('fs').readFileSync(require('path').join(__dirname, '../components/blendn/BlendnScreen.tsx'), 'utf8')
  expect(src).toContain('useFocusedBackHandler(')
  expect(src).not.toContain("BackHandler.addEventListener('hardwareBackPress'")
})

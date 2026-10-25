/**
 * The chat's dock rides the keyboard through react-native-keyboard-controller's
 * avoiding view (it follows an interactive dismiss frame by frame), with the
 * app-wide behaviour, and the root is wrapped in its provider.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { Text } from 'react-native'
import { render, screen } from '@testing-library/react-native'

// A marked stand-in for the library's avoiding view, to see what the frame hands it.
jest.mock('react-native-keyboard-controller', () => {
  const { View } = require('react-native')
  return { KeyboardAvoidingView: (props: object) => <View testID="library-avoider" {...props} /> }
})

import { KeyboardFrame } from '../components/chat/KeyboardFrame'
import { KEYBOARD_BEHAVIOR } from '../lib/keyboard'

it('draws its children inside the library avoiding view, padding as everywhere else', async () => {
  await render(
    <KeyboardFrame>
      <Text>composer</Text>
    </KeyboardFrame>
  )
  expect(screen.getByText('composer')).toBeTruthy()
  const avoiding = screen.getByTestId('library-avoider')
  expect(avoiding.props.behavior).toBe(KEYBOARD_BEHAVIOR)
  expect(screen.getByTestId('chat-keyboard-dock-frame').parent).toBe(avoiding)
})

it('uses the library avoiding view, not React Native’s', () => {
  const src = readFileSync(join(__dirname, '..', 'components/chat/KeyboardFrame.tsx'), 'utf8')
  expect(src).toMatch(/KeyboardAvoidingView \} from 'react-native-keyboard-controller'/)
  expect(src).not.toMatch(/KeyboardAvoidingView[^']*from 'react-native'/)
})

it('the root layout wraps the app in the keyboard provider', () => {
  const src = readFileSync(join(__dirname, '..', 'app/_layout.tsx'), 'utf8')
  expect(src).toMatch(/<KeyboardProvider>[\s\S]*<ToastProvider>[\s\S]*<\/ToastProvider>[\s\S]*<\/KeyboardProvider>/)
})

it('both chat lists keep the interactive dismiss on iOS', () => {
  for (const file of ['app/chat/[id].tsx', 'app/private-chat/[conversationId].tsx']) {
    expect(readFileSync(join(__dirname, '..', file), 'utf8')).toMatch(/KEYBOARD_DISMISS = Platform\.OS === 'ios' \? 'interactive' : 'on-drag'/)
  }
})

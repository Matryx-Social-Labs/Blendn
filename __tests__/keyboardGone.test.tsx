/**
 * RC drive 2 D-4: on sign-up, iOS's Strong Password sheet (the password field's input view) arrives as a keyboard and,
 * closed, moves off screen without the `keyboardWillHide` react-native-keyboard-controller listens for. The library kept
 * its height: the dock stayed lifted mid-screen over dead space, the scroll padded. React Native's own observer hears the
 * frame land off screen; the page rests on that until the next keyboardWillShow.
 */
import { act, render, screen } from '@testing-library/react-native'
import { Dimensions, Keyboard, Text, type KeyboardEvent } from 'react-native'
import { KeyboardEvents } from 'react-native-keyboard-controller'

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 34, left: 0, right: 0 }),
}))

/* eslint-disable import/first */
import { KeyboardPage } from '../components/onboarding/KeyboardPage'
import { frameIsOffScreen } from '../lib/keyboard'
/* eslint-enable import/first */

const SCREEN = Dimensions.get('screen').height
const frame = (screenY: number, height: number) => ({ endCoordinates: { screenX: 0, screenY, width: 390, height } }) as KeyboardEvent

function listen() {
  const lib: Record<string, (() => void)[]> = {}
  const core: Record<string, ((e: KeyboardEvent) => void)[]> = {}
  ;(KeyboardEvents.addListener as jest.Mock).mockImplementation(((event: string, cb: () => void) => {
    ;(lib[event] ??= []).push(cb)
    return { remove: jest.fn() }
  }) as never)
  jest.spyOn(Keyboard, 'addListener').mockImplementation(((event: string, cb: (e: KeyboardEvent) => void) => {
    ;(core[event] ??= []).push(cb)
    return { remove: jest.fn() }
  }) as never)
  return {
    willShow: () => act(async () => lib.keyboardWillShow?.forEach((cb) => cb())),
    core: (event: string, e: KeyboardEvent) => act(async () => core[event]?.forEach((cb) => cb(e))),
  }
}

const page = () =>
  render(
    <KeyboardPage dock={<Text>Create account</Text>} scrollProps={{}}>
      <Text>form</Text>
    </KeyboardPage>,
  )
const docked = () => screen.getByTestId('keyboard-page-dock-frame').props.enabled

afterEach(() => jest.restoreAllMocks())

it('reads a frame as off screen when it has no height or starts at the screen’s foot', () => {
  expect(frameIsOffScreen(frame(SCREEN, 336))).toBe(true)
  expect(frameIsOffScreen(frame(SCREEN - 336, 0))).toBe(true)
  expect(frameIsOffScreen(frame(SCREEN - 336, 336))).toBe(false)
})

it('the Strong Password sheet closing with no hide: the dock rests, and the next keyboard lifts it again', async () => {
  const k = listen()
  await page()
  // The sheet arrives as a keyboard.
  await k.willShow()
  await k.core('keyboardDidChangeFrame', frame(SCREEN - 420, 420))
  expect(docked()).toBe(true)
  // Closed: the frame lands off screen, and the library hears nothing.
  await k.core('keyboardDidChangeFrame', frame(SCREEN, 420))
  expect(docked()).toBe(false)
  // Age is tapped: a real keyboard.
  await k.willShow()
  expect(docked()).toBe(true)
})

it('a keyboard that changes size on screen (another field, the sheet over it) keeps the dock on it', async () => {
  const k = listen()
  await page()
  await k.willShow()
  await k.core('keyboardDidChangeFrame', frame(SCREEN - 291, 291))
  await k.core('keyboardDidChangeFrame', frame(SCREEN - 336, 336))
  expect(docked()).toBe(true)
})

/**
 * Onboarding with the keyboard up (motion #34): the page follows the keyboard on react-native-keyboard-controller, as the
 * chat and the sheets do. The scroll clears the focused field of the keyboard and the dock, the dock rides the keyboard's
 * top edge, and the footer shrinks to the button so the page has room.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import { readFileSync } from 'fs'
import { join } from 'path'
import { Keyboard, StyleSheet } from 'react-native'

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 34, left: 0, right: 0 }),
}))

/* eslint-disable import/first */
import { TextField } from '../components/ds/TextField'
import { OnboardingScreen } from '../components/onboarding/OnboardingScreen'
import { HINT_ROOM } from '../components/onboarding/KeyboardPage'
/* eslint-enable import/first */

/** Every Keyboard listener, by event: more than one hook listens for the same one. */
function keyboardListeners() {
  const byEvent: Record<string, (() => void)[]> = {}
  jest.spyOn(Keyboard, 'addListener').mockImplementation(((event: string, cb: () => void) => {
    ;(byEvent[event] ??= []).push(cb)
    return { remove: jest.fn() }
  }) as never)
  return new Proxy({} as Record<string, () => void>, {
    get: (_t, event: string) => () => byEvent[event]?.forEach((cb) => cb()),
  })
}

describe('the footer with the keyboard up', () => {
  function page() {
    return render(
      <OnboardingScreen
        step="basics"
        title="The basics"
        ctaLabel="Continue"
        onContinue={jest.fn()}
        secondaryLabel="Not you? Sign out"
        onSecondary={jest.fn()}
        footerNote="Never shared"
      >
        <TextField label="Your name" hint="In event rooms you go by a made-up name." value="" onChangeText={() => {}} />
      </OnboardingScreen>
    )
  }

  it('shows the button and the small print at rest', async () => {
    await page()
    expect(screen.getByRole('button', { name: 'Continue' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Not you? Sign out' })).toBeTruthy()
  })

  it('keeps the button and the way out while the keyboard is up; only the footnote waits', async () => {
    const listeners = keyboardListeners()
        await page()
    await act(async () => listeners.keyboardWillShow())
    expect(screen.getByRole('button', { name: 'Continue' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Not you? Sign out' })).toBeTruthy()
    expect(screen.queryByText('NEVER SHARED')).toBeNull()
    await act(async () => listeners.keyboardWillHide())
    expect(screen.getByText('NEVER SHARED')).toBeTruthy()
  })
})

describe('the page while the keyboard is up', () => {
  it('drops the dock to the keyboard (no home-indicator room)', async () => {
    const listeners = keyboardListeners()
        await render(
      <OnboardingScreen step="basics" title="The basics" ctaLabel="Continue" onContinue={jest.fn()}>
        <TextField label="Name" value="" onChangeText={() => {}} />
      </OnboardingScreen>
    )
    const rest = StyleSheet.flatten(screen.getByTestId('onboarding-dock').props.style)
    await act(async () => listeners.keyboardWillShow())
    const up = StyleSheet.flatten(screen.getByTestId('onboarding-dock').props.style)
    expect(up.paddingBottom).toBeLessThan(rest.paddingBottom as number)
  })
})

describe('the page follows the keyboard through react-native-keyboard-controller', () => {
  const read = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8')

  it('the scroll clears the focused field of the dock and the hint under it: bottomOffset is the dock’s height plus the hint’s room', async () => {
    await render(
      <OnboardingScreen step="basics" title="The basics" ctaLabel="Continue" onContinue={jest.fn()}>
        <TextField label="Name" value="" onChangeText={() => {}} />
      </OnboardingScreen>
    )
    expect(screen.getByTestId('onboarding-scroll').props.bottomOffset).toBe(HINT_ROOM)
    await act(async () => {
      fireEvent(screen.getByTestId('onboarding-dock'), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 140 } } })
    })
    expect(screen.getByTestId('onboarding-scroll').props.bottomOffset).toBe(140 + HINT_ROOM)
  })

  it('the dock sits in the keyboard-sticky view, so it rides the keyboard frame by frame, interactive dismiss included', async () => {
    await render(
      <OnboardingScreen step="basics" title="The basics" ctaLabel="Continue" onContinue={jest.fn()}>
        <TextField label="Name" value="" onChangeText={() => {}} />
      </OnboardingScreen>
    )
    expect(screen.getByTestId('keyboard-page-dock-frame')).toContainElement(screen.getByTestId('onboarding-dock'))
  })

  it('no screen of the entry flow keeps the hand-written reveal or React Native’s avoiding view', () => {
    for (const rel of ['components/onboarding/OnboardingScreen.tsx', 'app/sign-in.tsx']) {
      const src = read(rel)
      expect(src).not.toMatch(/revealFocused|useRevealFocused/)
      expect(src).not.toMatch(/KeyboardAvoidingView/)
      expect(src).toContain('KeyboardPage')
    }
    expect(read('components/onboarding/KeyboardPage.tsx')).toMatch(/KeyboardAwareScrollView, KeyboardStickyView \} from 'react-native-keyboard-controller'/)
  })
})

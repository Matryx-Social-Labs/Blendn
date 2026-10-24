/**
 * Onboarding with the keyboard up (motion #34): the page follows the keyboard on react-native-keyboard-controller, as the
 * chat and the sheets do. The scroll clears the focused field of the keyboard and the dock, the dock rides the keyboard's
 * top edge, and the footer shrinks to the button so the page has room.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import { readFileSync } from 'fs'
import { join } from 'path'
import { ScrollView, StyleSheet } from 'react-native'
import { KeyboardEvents } from 'react-native-keyboard-controller'

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 34, left: 0, right: 0 }),
}))

/* eslint-disable import/first */
import { TextField } from '../components/ds/TextField'
import { OnboardingScreen } from '../components/onboarding/OnboardingScreen'
import { bottomOffsetFor, EXTRA_SCROLL_ROOM, HINT_ROOM, hintRoomFor, MIN_FIELD } from '../components/onboarding/KeyboardPage'
import { atScale, AX_XXXL, resetScale } from './helpers/ax'
/* eslint-enable import/first */

/** Every keyboard-controller listener, by event: more than one hook listens for the same one. */
function keyboardListeners() {
  const byEvent: Record<string, (() => void)[]> = {}
  ;(KeyboardEvents.addListener as jest.Mock).mockImplementation(((event: string, cb: () => void) => {
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
    expect(screen.queryByText('Never shared')).toBeNull()
    await act(async () => listeners.keyboardWillHide())
    expect(screen.getByText('Never shared')).toBeTruthy()
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
    // At the default text size (jest's window says 2): the room grows with the type (rc7 D9, below).
    await atScale(1)
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

  it('the last field can rise clear of the dock and its hint’s room: the scroll has room under it beyond the keyboard (RC drive D4)', async () => {
    // At the default text size (jest's window says 2): the room grows with the type (rc7 D9, below).
    await atScale(1)
    await render(
      <OnboardingScreen step="basics" title="The basics" ctaLabel="Continue" onContinue={jest.fn()}>
        <TextField label="Name" value="" onChangeText={() => {}} />
      </OnboardingScreen>
    )
    expect(screen.getByTestId('onboarding-scroll').props.extraKeyboardSpace).toBe(EXTRA_SCROLL_ROOM)
    /*
     * The geometry, over the keyboard's top edge. The scroll ends at the dock's top at rest; padded by the keyboard and
     * EXTRA_SCROLL_ROOM, the content's end (the last field, then the page's bottom padding) rises at most to
     * dockRest + contentPadding + EXTRA_SCROLL_ROOM. bottomOffset wants the field at dockUp + HINT_ROOM.
     * Sign-up on an iPhone 17 (dock 121 at rest, 83 over the keyboard), on an SE / Android (no home-indicator room: 4 pt
     * between them), and at AX sizes (a taller dock), with sign-in's bottom padding (SPACE.xl).
     */
    const contentPadding = 24
    for (const [dockRest, dockUp] of [[121, 83], [92, 88], [180, 142]]) {
      const reachable = dockRest + contentPadding + EXTRA_SCROLL_ROOM
      expect(reachable).toBeGreaterThanOrEqual(dockUp + HINT_ROOM)
      // Without the extra room the SE fell 44 pt short: the field’s error sat under the dock.
      if (dockRest - dockUp < HINT_ROOM - contentPadding) expect(dockRest + contentPadding).toBeLessThan(dockUp + HINT_ROOM)
    }
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
    expect(read('components/onboarding/KeyboardPage.tsx')).toMatch(/KeyboardAwareScrollView, KeyboardEvents, KeyboardStickyView.* \} from 'react-native-keyboard-controller'/)
  })
})

describe('the keyboard events the page listens to', () => {
  it('the dock reads the keyboard from keyboard-controller on both platforms, so Android does not snap at the end', () => {
    const src = readFileSync(join(__dirname, '..', 'lib/keyboard.ts'), 'utf8')
    expect(src).toMatch(/KeyboardEvents\.addListener\('keyboardWillShow'/)
    expect(src).toMatch(/KeyboardEvents\.addListener\('keyboardWillHide'/)
    // The code, not the comment that says why: no per-platform event name in an addListener.
    expect(src).not.toMatch(/addListener\([^)]*(keyboardDidShow|keyboardDidHide)/)
    expect(src).not.toMatch(/addListener\([^)]*Platform\.OS/)
  })

  it('Strong Password belt and braces: once the keyboard has landed the scroll is asked to look for the focused input again', async () => {
    const listeners = keyboardListeners()
    const assure = jest.fn()
    // The test double is a plain ScrollView: give it the method the library's ref carries.
    ;(ScrollView.prototype as unknown as { assureFocusedInputVisible: () => void }).assureFocusedInputVisible = assure
    await render(
      <OnboardingScreen step="basics" title="The basics" ctaLabel="Continue" onContinue={jest.fn()}>
        <TextField label="Name" value="" onChangeText={() => {}} />
      </OnboardingScreen>
    )
    expect(assure).not.toHaveBeenCalled()
    await act(async () => listeners.keyboardDidShow())
    expect(assure).toHaveBeenCalledTimes(1)
    delete (ScrollView.prototype as unknown as { assureFocusedInputVisible?: unknown }).assureFocusedInputVisible
  })
})

describe('bottomOffset at large type', () => {
  it('is the dock and the hint’s room while the field still has room', () => {
    expect(bottomOffsetFor(120, 700)).toBe(120 + HINT_ROOM)
  })
  it('is held back so a field of MIN_FIELD is left when the dock and the hint would outgrow the page', () => {
    // 200% type: a 520 dock on a 640 page.
    expect(bottomOffsetFor(520, 640)).toBe(640 - MIN_FIELD)
    expect(bottomOffsetFor(900, 640)).toBe(640 - MIN_FIELD)
  })
  it('never goes below zero, and does not clamp what is not measured yet', () => {
    expect(bottomOffsetFor(50, 20)).toBe(0)
    expect(bottomOffsetFor(120, 0)).toBe(120 + HINT_ROOM)
  })
  it('the page applies it from the scroll’s and the dock’s own layout', async () => {
    await render(
      <OnboardingScreen step="basics" title="The basics" ctaLabel="Continue" onContinue={jest.fn()}>
        <TextField label="Name" value="" onChangeText={() => {}} />
      </OnboardingScreen>
    )
    await act(async () => {
      fireEvent(screen.getByTestId('onboarding-dock'), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 520 } } })
      fireEvent(screen.getByTestId('onboarding-scroll'), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 640 } } })
    })
    expect(screen.getByTestId('onboarding-scroll').props.bottomOffset).toBe(640 - MIN_FIELD)
  })
})

describe('the hint’s room grows with the text (rc7 D9: the age hint under the dock at AX)', () => {
  it('is 72 at the default size, scales with the font, and stops at meta’s cap', () => {
    expect(hintRoomFor(1)).toBe(HINT_ROOM)
    expect(hintRoomFor(0.85)).toBe(HINT_ROOM)
    expect(hintRoomFor(1.5)).toBe(108)
    expect(hintRoomFor(3.1)).toBe(HINT_ROOM * 2)
  })

  it('the page keeps the dock plus the scaled room under the focused field, with the scroll room to reach it', async () => {
    await atScale(AX_XXXL)
    await render(
      <OnboardingScreen step="basics" title="The basics" ctaLabel="Continue" onContinue={jest.fn()}>
        <TextField label="Name" value="" onChangeText={() => {}} />
      </OnboardingScreen>
    )
    expect(screen.getByTestId('onboarding-scroll').props.bottomOffset).toBe(HINT_ROOM * 2)
    expect(screen.getByTestId('onboarding-scroll').props.extraKeyboardSpace).toBe(EXTRA_SCROLL_ROOM + HINT_ROOM)
  })
})

afterEach(() => resetScale())

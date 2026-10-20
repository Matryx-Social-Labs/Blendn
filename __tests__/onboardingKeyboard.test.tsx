/**
 * Onboarding with the keyboard up: the page keeps what it needs reachable.
 * The focused field scrolls into the shorter viewport (with its label and its
 * hint), and the footer shrinks to the button so the page has room.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import { Keyboard, StyleSheet } from 'react-native'

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 34, left: 0, right: 0 }),
}))

/* eslint-disable import/first */
import { TextField } from '../components/ds/TextField'
import { OnboardingScreen } from '../components/onboarding/OnboardingScreen'
import { REVEAL_ABOVE, REVEAL_BELOW, RevealOnFocus, revealOffset, useRevealProps } from '../components/onboarding/revealFocused'
/* eslint-enable import/first */

describe('revealOffset', () => {
  const viewport = 300
  it('a field already inside the viewport (with its label and hint) does not move the page', () => {
    expect(revealOffset({ top: 100, bottom: 156 }, 0, viewport)).toBeNull()
  })

  it('a field below the viewport scrolls up until its hint is in view', () => {
    expect(revealOffset({ top: 500, bottom: 556 }, 0, viewport)).toBe(556 + REVEAL_BELOW - viewport)
  })

  it('a field above the top scrolls back down to its label', () => {
    expect(revealOffset({ top: 100, bottom: 156 }, 400, viewport)).toBe(100 - REVEAL_ABOVE)
  })

  it('never scrolls above the start', () => {
    expect(revealOffset({ top: 10, bottom: 66 }, 40, viewport)).toBe(0)
  })
})

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
    const listeners: Record<string, () => void> = {}
    jest.spyOn(Keyboard, 'addListener').mockImplementation(((event: string, cb: () => void) => {
      listeners[event] = cb
      return { remove: jest.fn() }
    }) as never)
    await page()
    await act(async () => listeners.keyboardWillShow())
    expect(screen.getByRole('button', { name: 'Continue' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Not you? Sign out' })).toBeTruthy()
    expect(screen.queryByText('NEVER SHARED')).toBeNull()
    await act(async () => listeners.keyboardWillHide())
    expect(screen.getByText('NEVER SHARED')).toBeTruthy()
  })
})

/** A design-system field on an onboarding page: it spreads what the page hands it, as the steps do. */
function PageField({ label, onFocus }: { label: string; onFocus?: () => void }) {
  const reveal = useRevealProps()
  return <TextField label={label} value="" onChangeText={() => {}} onFocus={onFocus} {...reveal} />
}

describe('a field takes the page with it', () => {
  it('asks the page to reveal it when it takes focus', async () => {
    const reveal = jest.fn()
    await render(
      <RevealOnFocus.Provider value={reveal}>
        <PageField label="City" />
      </RevealOnFocus.Provider>
    )
    fireEvent(screen.getByLabelText('City'), 'focus')
    expect(reveal).toHaveBeenCalledTimes(1)
  })

  it('works outside an onboarding page too (no page to ask)', async () => {
    await render(<PageField label="Alone" />)
    fireEvent(screen.getByLabelText('Alone'), 'focus')
  })
})

describe('the page while the keyboard is up', () => {
  it('drops the dock to the keyboard (no home-indicator room)', async () => {
    const listeners: Record<string, () => void> = {}
    jest.spyOn(Keyboard, 'addListener').mockImplementation(((event: string, cb: () => void) => {
      listeners[event] = cb
      return { remove: jest.fn() }
    }) as never)
    await render(
      <OnboardingScreen step="basics" title="The basics" ctaLabel="Continue" onContinue={jest.fn()}>
        <PageField label="Name" />
      </OnboardingScreen>
    )
    const rest = StyleSheet.flatten(screen.getByTestId('onboarding-dock').props.style)
    await act(async () => listeners.keyboardWillShow())
    const up = StyleSheet.flatten(screen.getByTestId('onboarding-dock').props.style)
    expect(up.paddingBottom).toBeLessThan(rest.paddingBottom as number)
  })
})

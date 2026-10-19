/**
 * Onboarding with the keyboard up: the page keeps what it needs reachable.
 * The focused field scrolls into the shorter viewport (with its label and its
 * hint), and the footer shrinks to the button so the page has room.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import { Keyboard } from 'react-native'

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }))
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 34, left: 0, right: 0 }),
}))

/* eslint-disable import/first */
import { EmberField } from '../components/onboarding/EmberControls'
import { OnboardingScreen } from '../components/onboarding/OnboardingScreen'
import { REVEAL_ABOVE, REVEAL_BELOW, RevealOnFocus, revealOffset } from '../components/onboarding/revealFocused'
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
        <EmberField label="Your name" helper="In event rooms you go by a made-up name." value="" onChangeText={() => {}} />
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

describe('a field takes the page with it', () => {
  it('asks the page to reveal it when it takes focus, and still runs its own onFocus', async () => {
    const reveal = jest.fn()
    const own = jest.fn()
    await render(
      <RevealOnFocus.Provider value={reveal}>
        <EmberField label="Day of birth" value="" onChangeText={() => {}} onFocus={own} />
      </RevealOnFocus.Provider>
    )
    fireEvent(screen.getByLabelText('Day of birth'), 'focus')
    expect(reveal).toHaveBeenCalledTimes(1)
    expect(own).toHaveBeenCalledTimes(1)
  })

  it('works outside an onboarding page too (no page to ask)', async () => {
    await render(<EmberField label="Alone" value="" onChangeText={() => {}} />)
    fireEvent(screen.getByLabelText('Alone'), 'focus')
  })
})

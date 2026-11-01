/*
 * Onboarding, direction A (owner's pick, 2026-11-01; SCRUM-1002 PR 2): one question per screen with its key words in the
 * brand gradient, the landing's two lights behind every step drifting towards violet, five segments in place of
 * "Step n of 5", the landing's white primary, and no creature glyph anywhere in the flow.
 */
import { act, render, screen } from '@testing-library/react-native'
import React from 'react'
import { StyleSheet, View } from 'react-native'
import * as Reanimated from 'react-native-reanimated'

import { COLOR, GRADIENT } from '../lib/design/tokens'

jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() }, useFocusEffect: jest.fn() }))
jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default)
jest.mock('react-native-reanimated', () => ({ ...jest.requireActual('react-native-reanimated'), __esModule: true, useReducedMotion: jest.fn(() => false) }))
jest.mock('expo-linear-gradient', () => ({ LinearGradient: jest.requireActual('react-native').View }))
jest.mock('../lib/perf', () => ({ ScreenProfiler: ({ children }: { children: React.ReactNode }) => children }))
// Every creature in the app is drawn by this one component: a marker in its place makes "no creature on onboarding" checkable.
jest.mock('../components/ds/Creature', () => {
  const { View: MockView } = jest.requireActual('react-native')
  return { ...jest.requireActual('../components/ds/Creature'), Creature: () => <MockView testID="creature-glyph" /> }
})

import { OnboardingScreen } from '../components/onboarding/OnboardingScreen'
import { glyphColours } from '../components/onboarding/GradientWords'
import { lightColour, StepLights, titleBandAlpha, SMALLEST_HEIGHT } from '../components/onboarding/StepLights'

const rm = Reanimated.useReducedMotion as jest.Mock
beforeEach(() => {
  rm.mockReturnValue(false)
})

const frame = async (step: Parameters<typeof OnboardingScreen>[0]['step'], extra: Partial<Parameters<typeof OnboardingScreen>[0]> = {}) =>
  await render(<OnboardingScreen step={step} title="What brings " titleAccent="you out?" ctaLabel="Continue" onContinue={jest.fn()} {...extra} />)

describe('segmented progress', () => {
  it('draws five segments with the steps so far lit, and says "Step 2 of 5" to a screen reader without printing it', async () => {
    await frame('preferences')
    const bar = screen.getByRole('progressbar')
    expect(bar.props.accessibilityLabel).toBe('Step 2 of 5')
    expect(bar.props.accessibilityValue).toEqual({ min: 1, max: 5, now: 2 })
    const lit = [0, 1, 2, 3, 4].map((i) => StyleSheet.flatten(screen.getByTestId(`onboarding-progress-segment-${i}`).props.style).backgroundColor)
    expect(lit).toEqual([COLOR.textPrimary, COLOR.textPrimary, COLOR.hairlineStrong, COLOR.hairlineStrong, COLOR.hairlineStrong])
    expect(screen.queryByText('Step 2 of 5')).toBeNull()
  })

  it('the payoff draws no segments: it answers nothing (control: the last question draws all five)', async () => {
    await frame('ready')
    expect(screen.queryByRole('progressbar')).toBeNull()
    await frame('location')
    expect(screen.getByRole('progressbar').props.accessibilityLabel).toBe('Step 5 of 5')
  })
})

describe('the question', () => {
  it('is one header that reads as the whole sentence, the key words lit glyph by glyph from the first stop to the last', async () => {
    await frame('preferences')
    expect(screen.getByRole('header', { name: 'What brings you out?' })).toBeTruthy()
    const colours = glyphColours('you out?')
    expect(colours).toHaveLength('you out?'.length)
    expect(colours[0]).toBe(GRADIENT.text.colors[0])
    expect(colours[colours.length - 1]).toBe(GRADIENT.text.colors[GRADIENT.text.colors.length - 1])
  })

  it('a key word of one glyph takes the first stop rather than dividing by zero', async () => {
    expect(glyphColours('?')).toEqual([GRADIENT.text.colors[0]])
  })
})

/* WCAG 2.x relative luminance and contrast, for the measurement below. */
const channel = (v: number) => {
  const c = v / 255
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}
const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
const luminance = (hex: string) => {
  const [r, g, b] = rgb(hex).map(channel)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}
const over = (base: string, light: string, alpha: number) =>
  `#${rgb(base)
    .map((c, i) => Math.round(c * (1 - alpha) + rgb(light)[i] * alpha).toString(16).padStart(2, '0'))
    .join('')}`

describe('gradient text stays AA against its backdrop (measured)', () => {
  // The question is display (34 pt bold): large text, so AA is 3:1. Against bare ink every stop also clears 4.5:1.
  it.each(GRADIENT.text.colors.map((c) => [c]))('%s is at least 4.5:1 on ink', (stop) => {
    expect(contrast(stop, COLOR.ink)).toBeGreaterThanOrEqual(4.5)
  })

  it('the lights reach the question at most faintly on the smallest phone, and every stop clears 3:1 over either light there', async () => {
    const alpha = titleBandAlpha(SMALLEST_HEIGHT)
    expect(alpha).toBeLessThanOrEqual(0.3)
    for (const stop of GRADIENT.text.colors) {
      for (const light of [COLOR.brandOrange, COLOR.brandViolet]) {
        expect(contrast(stop, over(COLOR.ink, light, alpha))).toBeGreaterThanOrEqual(3)
      }
    }
  })

  it('control: the same stops over a light at full strength would fail, so the measurement can fail', async () => {
    expect(contrast(GRADIENT.text.colors[1], over(COLOR.ink, COLOR.brandOrange, 0.63))).toBeLessThan(3)
  })
})

describe('the two lights', () => {
  it('start at ember on the first step and drift towards violet with every step after it', async () => {
    expect(lightColour(0)).toBe(COLOR.brandOrange)
    const towardViolet = [0, 1, 2, 3, 4, 5].map((i) => contrast(lightColour(i), COLOR.brandViolet))
    towardViolet.slice(1).forEach((c, i) => expect(c).toBeLessThan(towardViolet[i]))
  })

  it('drift from the last step’s place to this one, once, with no loop', async () => {
    const timing = jest.spyOn(Reanimated, 'withTiming')
    const repeat = jest.spyOn(Reanimated, 'withRepeat')
    await render(<StepLights index={2} />)
    expect(timing).toHaveBeenCalledTimes(1)
    expect(repeat).not.toHaveBeenCalled()
    timing.mockRestore()
    repeat.mockRestore()
  })

  it('Reduce Motion: placed at the step, nothing animates', async () => {
    rm.mockReturnValue(true)
    const timing = jest.spyOn(Reanimated, 'withTiming')
    await render(<StepLights index={2} />)
    expect(timing).not.toHaveBeenCalled()
    timing.mockRestore()
  })

  it('stand in for the orbs behind every step', async () => {
    await frame('details')
    expect(screen.getByTestId('onboarding-lights', { includeHiddenElements: true })).toBeTruthy()
    expect(screen.queryByTestId('onboarding-backdrop', { includeHiddenElements: true })).toBeNull()
  })
})

it('the primary is the landing’s white button (ink on white), not the gradient', async () => {
  await frame('basics')
  expect(StyleSheet.flatten(screen.getByTestId('onboarding-primary').props.style).backgroundColor).toBe(COLOR.textPrimary)
})

it('the hero sits above the question, and the dock caption above the primary', async () => {
  await frame('details', { hero: <View testID="hero" />, dockCaption: '3 picked' })
  expect(screen.getByTestId('hero')).toBeTruthy()
  expect(screen.getByText('3 picked')).toBeTruthy()
})

it('the frame itself draws no creature on any step', async () => {
  for (const step of ['basics', 'preferences', 'details', 'media', 'location', 'ready'] as const) {
    await frame(step)
    await act(async () => {})
    expect(screen.queryByTestId('creature-glyph', { includeHiddenElements: true })).toBeNull()
  }
})

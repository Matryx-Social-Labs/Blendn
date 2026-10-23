/**
 * RC drive 5's long-content defects (iOS AX XXXL, Android 360 dp at 1.3): headlines that broke inside a word, rows whose
 * text was squeezed to a sliver by a piece beside it, and names cut to three letters.
 */
import { act, render, screen } from '@testing-library/react-native'
import { readdirSync, readFileSync, statSync } from 'fs'
import { join, relative } from 'path'
import React from 'react'
import { Dimensions, StyleSheet } from 'react-native'

jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default)
jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() } }))

/* eslint-disable import/first */
import { OnboardingScreen } from '../components/onboarding/OnboardingScreen'
import { CONTROL_FONT_CAP } from '../components/ds/shared'
import { MAX_FONT_SCALE, SPACE, TYPE } from '../lib/design/tokens'
/* eslint-enable import/first */

const window = Dimensions.get('window')
const at = (width: number, fontScale: number) => act(async () => Dimensions.set({ window: { ...window, width, fontScale }, screen: { ...window, width, fontScale } }))
afterEach(() => Dimensions.set({ window, screen: window }))
const hidden = { includeHiddenElements: true }

/**
 * The widest single word a display headline carries, in ems of Satoshi Black (Bold Text's weight for display): "notifications"
 * 5.67, "preferences" 5.53 (measured from assets/fonts/satoshi with opentype.js, tracking included). A word wider than its
 * line is broken inside it: "journe / y", "prefer / ences" at AX XXXL, where display was uncapped (RC drive 5).
 */
const WIDEST_HEADLINE_WORD_EM = 5.67
/** The narrowest line a page headline gets: a 360 dp phone less the page gutters. */
const NARROWEST_HEADLINE_LINE = 360 - 2 * SPACE.gutter

describe('display headlines never break inside a word', () => {
  it('the display cap keeps the widest headline word on one line of the narrowest page', () => {
    expect(WIDEST_HEADLINE_WORD_EM * TYPE.display.fontSize * MAX_FONT_SCALE.display).toBeLessThanOrEqual(NARROWEST_HEADLINE_LINE)
  })

  it('the onboarding frame: the headline stops at the display cap, the bar’s "Step n of 8" at a control’s, the subtitle at body’s', async () => {
    await at(402, 3.1)
    await render(<OnboardingScreen step="preferences" title="Your " titleAccent="preferences" subtitle="Who you’d like to meet." ctaLabel="Continue" onContinue={jest.fn()} />)
    expect(screen.getByTestId('onboarding-title', hidden).props.maxFontSizeMultiplier).toBe(MAX_FONT_SCALE.display)
    expect(screen.getByTestId('onboarding-step', hidden).props.maxFontSizeMultiplier).toBe(CONTROL_FONT_CAP)
    expect(screen.getByText('Who you’d like to meet.', hidden).props.maxFontSizeMultiplier).toBe(MAX_FONT_SCALE.body)
  })

  it('every Text drawn in the display role says how far it may grow', () => {
    const root = join(__dirname, '..')
    const files: string[] = []
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name)
        if (statSync(path).isDirectory()) walk(path)
        else if (path.endsWith('.tsx')) files.push(path)
      }
    }
    walk(join(root, 'app'))
    walk(join(root, 'components'))
    const uncapped = files.flatMap((path) => {
      const src = readFileSync(path, 'utf8')
      // Each opening <Text ...> tag (to its first unnested ">"), one that sets the display role inline.
      return [...src.matchAll(/<(?:RN)?Text\b((?:[^>{]|\{(?:[^{}]|\{[^{}]*\})*\})*)>/g)]
        .filter((m) => m[1].includes("font('display'") && !m[1].includes('maxFontSizeMultiplier'))
        .map((m) => `${relative(root, path)}: ${m[1].trim().slice(0, 60)}`)
    })
    expect(uncapped).toEqual([])
  })
})

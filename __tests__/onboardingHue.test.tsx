/*
 * Onboarding is you (foundations, Batch 6): the violet world, set once at the stack's layout. Everything in it that used to be
 * white (the main photo's ring, the "you" marker, the avatar ring on the last step) or ember by default (the progress, the
 * choice cards, the chips) lights in the hue. The primary button stays the accent: it is the screen's one primary.
 */
import { render, screen } from '@testing-library/react-native'
import fs from 'fs'
import path from 'path'
import React from 'react'
import { StyleSheet } from 'react-native'

import { LookingForCard } from '../components/ds/LookingForCard'
import { ProgressBar } from '../components/ds/ProgressBar'
import { HueProvider, type Hue } from '../components/ds/shared'
import { PhotoTile } from '../components/onboarding/PhotoTile'
import { COLOR } from '../lib/design/tokens'

jest.mock('react-native-reanimated', () => ({ ...jest.requireActual('react-native-reanimated'), __esModule: true, useReducedMotion: jest.fn(() => false) }))
jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default)
jest.mock('../components/OptimizedImage', () => ({ OptimizedImage: () => null }))
jest.mock('expo-linear-gradient', () => ({ LinearGradient: jest.requireActual('react-native').View }))

const flat = (id: string) => StyleSheet.flatten(screen.getByTestId(id, { includeHiddenElements: true }).props.style)
const inHue = (hue: Hue, ui: React.ReactElement) => render(<HueProvider value={hue}>{ui}</HueProvider>)
const read = (file: string) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8')

describe('the stack', () => {
  it('sets the violet hue once, at the layout, and no step sets one of its own', () => {
    expect(read('app/onboarding/_layout.tsx')).toContain('<HueProvider value="violet">')
    for (const step of fs.readdirSync(path.join(__dirname, '../app/onboarding')).filter((f) => f !== '_layout.tsx')) {
      expect(read(`app/onboarding/${step}`)).not.toContain('HueProvider')
    }
  })

  it('draws nothing in white selection: no onboarding file uses selectionFill', () => {
    const files = [
      ...fs.readdirSync(path.join(__dirname, '../app/onboarding')).map((f) => `app/onboarding/${f}`),
      ...fs.readdirSync(path.join(__dirname, '../components/onboarding')).map((f) => `components/onboarding/${f}`),
    ]
    for (const file of files) expect(read(file)).not.toContain('selectionFill')
  })
})

describe('in the violet world', () => {
  const tile = { key: 'k', state: 'ready', url: 'u' } as const
  const photo = (index: number) => (
    <PhotoTile tile={tile} index={index} slot={160} onMakeMain={jest.fn()} onRemove={jest.fn()} onRetry={jest.fn()} />
  )

  it('the main photo’s ring is violet, not white', async () => {
    await inHue('violet', photo(0))
    expect(flat('photo-tile-0')).toMatchObject({ borderWidth: 2, borderColor: COLOR.brandViolet })
  })

  it('only the main photo carries it', async () => {
    await inHue('violet', photo(1))
    expect(flat('photo-tile-1').borderColor).toBeUndefined()
  })

  it('the progress fill and a picked looking-for card follow the hue', async () => {
    await inHue(
      'violet',
      <>
        <ProgressBar progress={0.5} testID="p" />
        <LookingForCard label="Friendship" image={{ uri: 'x' }} selected testID="l" />
      </>
    )
    expect(flat('p-fill').backgroundColor).toBe(COLOR.brandViolet)
    expect(flat('l-ring').borderColor).toBe(COLOR.brandViolet)
    expect(flat('l-check').backgroundColor).toBe(COLOR.selectionVioletGlyph)
  })
})


/**
 * Motion audit M16 + M27 (2026-11-01): parts that come and go with an answer — the sign-out under an under-age date, the
 * Plus dock's line and button, the sets that open when dating or a work field is ticked, the venue dock's modes — were
 * swapped in one frame. Now they cross on `Swap`: a fade in over `base` once the screen is drawn (never on its first
 * paint, so a list does not fade every card in), and out over `quick` where nothing sits below to move into its place.
 */
import { render, screen } from '@testing-library/react-native'
import { readFileSync } from 'fs'
import { join } from 'path'
import React from 'react'
import { Text } from 'react-native'

/* eslint-disable import/first */
import { Swap } from '../components/motion/Swap'
import { swapIn, swapOut } from '../components/motion/presence'
/* eslint-enable import/first */

const enteringOf = (testID: string) => screen.getByTestId(testID).parent?.props.entering ?? screen.getByTestId(testID).props.entering

describe('Swap', () => {
  it('draws nothing while there is nothing to show', async () => {
    await render(<Swap>{null}</Swap>)
    expect(screen.toJSON()).toBeNull()
  })

  it('a part that arrives fades in on swapIn, and leaves on swapOut only when asked to', async () => {
    const { rerender } = await render(<Swap testID="part">{null}</Swap>)
    await rerender(<Swap testID="part"><Text>Sign out</Text></Swap>)
    const part = screen.getByTestId('part')
    expect(part.props.entering).toBe(swapIn)
    expect(part.props.exiting).toBeUndefined()

    await rerender(<Swap testID="part" exits><Text>Sign out</Text></Swap>)
    expect(screen.getByTestId('part').props.exiting).toBe(swapOut)
  })

  it('a new id is a new part, so the swap plays between two answers too', async () => {
    const { rerender } = await render(<Swap id="a" testID="part"><Text>Restoring…</Text></Swap>)
    const first = screen.getByTestId('part')
    await rerender(<Swap id="b" testID="part"><Text>You’re in.</Text></Swap>)
    expect(screen.getByTestId('part')).not.toBe(first)
    expect(enteringOf('part')).toBe(swapIn)
  })
})

const ROOT = join(__dirname, '..')
const code = (path: string) =>
  readFileSync(join(ROOT, path), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

describe('the presets are fades on the tokens, kept under Reduce Motion', () => {
  it('in over base on the gentle curve, out over quick on the exit curve', () => {
    const presence = code('components/motion/presence.ts')
    expect(presence).toContain('export const swapIn = FadeIn.duration(DURATION.base).easing(GENTLE).reduceMotion(ReduceMotion.Never)')
    expect(presence).toContain('export const swapOut = FadeOut.duration(DURATION.quick).easing(Easing.bezier(...EASING.exit)).reduceMotion(ReduceMotion.Never)')
  })
})

// Each audited site, and how many swaps it bridges.
const SITES: [string, number][] = [
  ['app/onboarding/basics.tsx', 1], // the under-age sign-out
  ['app/offer/[id].tsx', 1], // the regular ask, on and off
  ['app/plus-manage.tsx', 1], // the grant line
  ['components/plus/PlusSections.tsx', 2], // the dock's line, the dock's button
  ['components/profile/MatchingFields.tsx', 3], // dating, interested in, what kind
  ['components/profile/MeBadges.tsx', 1], // shows up
  ['components/board/BoardSections.tsx', 2], // the footer's answer, the refusal
  ['components/venue/VenueDock.tsx', 1], // the dock's modes
  ['components/venue/VenueRegulars.tsx', 1], // offer, on, done
  ['components/places/PlacesHeader.tsx', 1], // the applied chips
]

describe('every audited swap crosses (M16, M27)', () => {
  it.each(SITES)('%s bridges %i swap(s) with Swap', (path, count) => {
    expect(code(path).match(/<Swap\b/g)?.length ?? 0).toBeGreaterThanOrEqual(count)
  })

  it('the invite’s buttons arrive with the stage they belong to, not at rest under it', () => {
    expect(code('app/f/[token].tsx')).toMatch(/<FadeInUp style=\{styles\.footer\}/)
  })

  it('the nights cross from their skeleton (DS #17)', () => {
    expect(code('components/profile/NightsOut.tsx')).toContain('useSkeletonCrossfade(')
  })

  it('the Blend room’s first-open card fades back in after typing, not only out', () => {
    expect(code('components/crews/BlendRoom.tsx')).toMatch(/testID="blend-first-open"[^>]*entering=/)
  })
})

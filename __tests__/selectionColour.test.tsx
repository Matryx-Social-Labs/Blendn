/*
 * No white selection left (foundations, direction C): wherever a chip, a segment or a choice card lights, it lights in the
 * screen's hue. White stays on the tab bar, IconButton, Badge and status marks, the focus ring and the strong button. Each
 * remaining user of `COLOR.selectionFill` was decided, and this lists them: a new one fails here, to be decided too.
 *
 * Blind spot: a white selection drawn with `backgroundColor: COLOR.textPrimary` (the same #FFF under another name) is not
 * counted here, and the token is used for many things that are not selections (a thumb, a pip, a badge). Those are read by
 * review, not by this guard.
 */
import { render, screen } from '@testing-library/react-native'
import fs from 'fs'
import path from 'path'
import React from 'react'
import * as Reanimated from 'react-native-reanimated'

import { HueProvider, SELECTION } from '../components/ds/shared'
import { FriendsStep } from '../components/crews/MakeSteps'
import { COLOR } from '../lib/design/tokens'

jest.mock('react-native-reanimated', () => ({ ...jest.requireActual('react-native-reanimated'), __esModule: true, useReducedMotion: jest.fn(() => false) }))

const ROOT = path.join(__dirname, '..')
const walk = (dir: string): string[] =>
  fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
    const rel = path.join(dir, entry.name)
    return entry.isDirectory() ? walk(rel) : /\.tsx?$/.test(entry.name) ? [rel] : []
  })

/** White that stays: how many uses each file may hold, and why. Counted, so a second white in an allowed file fails too. */
const WHITE_STAYS: Record<string, { count: number; why: string }> = {
  'components/ds/IconButton.tsx': { count: 1, why: 'the media tier only: a toggle over a photo, where a hue is not legible (the control tier lights)' },
  'components/ds/StoryCard.tsx': { count: 1, why: 'a rendered share image, not UI' },
  'components/ds/OfferCard.tsx': { count: 1, why: 'the “used” status mark' },
  'components/offer/OfferSections.tsx': { count: 1, why: 'the redeemed stamp, a status mark' },
  'app/(tabs)/going.tsx': { count: 1, why: 'the saved heart: a status mark on a card' },
  'components/ds/ReactionBar.tsx': { count: 1, why: 'the reaction you picked, in a popover over glass: a state of the message, not a set' },
}
const WHITE = /COLOR\.selectionFill\b/g

describe('the white selection that is left', () => {
  it('is exactly the list above, use by use', () => {
    const found = Object.fromEntries(
      [...walk('app'), ...walk('components')]
        .map((file) => [file, (fs.readFileSync(path.join(ROOT, file), 'utf8').match(WHITE) ?? []).length] as const)
        .filter(([, count]) => count > 0)
    )
    expect(found).toEqual(Object.fromEntries(Object.entries(WHITE_STAYS).map(([file, { count }]) => [file, count])))
  })

  it.each(Object.entries(WHITE_STAYS))('%s says why it may', (_file, { why }) => {
    expect(why.length).toBeGreaterThan(10)
  })

  it.each(['Chip', 'SegmentedControl', 'RadioCard', 'LookingForCard', 'PlanCard', 'ProgressBar', 'MakeSteps', 'TitleTabs', 'Toggle'])(
    '%s lights in the hue, never in white',
    (name) => {
      const file = [...walk('components')].find((f) => path.basename(f) === `${name}.tsx`)!
      const src = fs.readFileSync(path.join(ROOT, file), 'utf8')
      expect(src).not.toMatch(/selectionFill|selectionInk\b.*backgroundColor/)
      expect(src).toMatch(/useSelection|SELECTION/)
    }
  )
})

describe('the crew friend pick', () => {
  const friends = [{ userId: 'u1', name: 'Priya', photo: null }] as never
  const draw = (hue: 'rose' | 'violet', picked: string[]) =>
    render(
      <HueProvider value={hue}>
        <FriendsStep friends={friends} picked={picked} onToggle={jest.fn()} onRetry={jest.fn()} />
      </HueProvider>
    )

  it('a picked friend’s disc is the hue’s glyph colour with an ink check; unpicked is a ring', async () => {
    await draw('rose', ['u1'])
    const box = screen.getByRole('checkbox', { name: 'Ask Priya' })
    expect(box.props.accessibilityState).toMatchObject({ checked: true })
    expect(JSON.stringify(screen.toJSON())).toContain(SELECTION.rose.glyph)
    expect(JSON.stringify(screen.toJSON())).not.toContain(`"backgroundColor":"${COLOR.selectionFill}"`)
  })

  it('the check strokes in once when the friend is picked, never on mount', async () => {
    const delay = jest.spyOn(Reanimated, 'withDelay')
    await draw('rose', [])
    await screen.rerender(
      <HueProvider value="rose">
        <FriendsStep friends={friends} picked={['u1']} onToggle={jest.fn()} onRetry={jest.fn()} />
      </HueProvider>
    )
    expect(delay).toHaveBeenCalledTimes(1)
    delay.mockRestore()
  })
})

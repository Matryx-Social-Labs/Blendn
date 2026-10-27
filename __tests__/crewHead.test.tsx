/*
 * A crew's head at AX XXXL (YOU-06 hand-off, D-L15, drive 7): the name stops at the title cap, the bio and the intent
 * at the meta cap, so the members under it stay reachable. Negative control: with the caps removed, `uncapped` lists
 * the name, the bio and the intent.
 */
import { render, screen } from '@testing-library/react-native'
import React from 'react'

import { CrewHead } from '../components/crews/CrewHead'
import { MAX_FONT_SCALE } from '../lib/design/tokens'
import { AX_XXXL, atScale, resetScale, uncapped } from './helpers/ax'

afterEach(resetScale)

it('caps the name at title and the bio and intent at meta, so nothing in the head is uncapped', async () => {
  await atScale(AX_XXXL)
  const crew = { name: 'The Very Long Crew Name Of 32 Ch', bio: 'Sunday football, then dosa.', tags: [], intent: ['friends'], emblemSeed: 's' } as never
  await render(<CrewHead crew={crew} />)
  expect(screen.getByRole('header').props.maxFontSizeMultiplier).toBe(MAX_FONT_SCALE.title)
  expect(screen.getByText('Sunday football, then dosa.').props.maxFontSizeMultiplier).toBe(MAX_FONT_SCALE.meta)
  expect(uncapped(screen.toJSON())).toEqual([])
})

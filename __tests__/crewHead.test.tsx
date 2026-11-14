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

it('draws every tag as a hashtag chip that wraps, an old slug with its spaces closed up (board crews/tags/01 · Crew page)', async () => {
  const tags = [
    { slug: 'sundayrunclub', label: 'sundayrunclub' },
    { slug: 'averyveryverylongtag24ch', label: 'averyveryverylongtag24ch' },
    { slug: 'कैफ़ेहॉपिंग', label: 'कैफ़ेहॉपिंग' },
    { slug: 'chai🍵', label: 'chai🍵' },
    { slug: 'quiz-team', label: 'Quiz team' },
  ]
  await render(<CrewHead crew={{ name: 'Nebula', bio: null, tags, intent: [], emblemSeed: 's' } as never} />)
  for (const t of ['#sundayrunclub', '#averyveryverylongtag24ch', '#कैफ़ेहॉपिंग', '#chai🍵', '#Quizteam']) {
    expect(screen.getByLabelText(t)).toBeTruthy()
  }
  // Read-only: nothing to tap on a crew's page.
  expect(screen.queryAllByRole('button')).toHaveLength(0)
})

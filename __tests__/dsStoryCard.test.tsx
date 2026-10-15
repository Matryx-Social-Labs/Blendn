/*
 * <StoryCard> (guidelines/components/StoryCard.html, Flow 16 · 16.3): the
 * images for Instagram. Square 1080; Story 1080 × 1920 with the top 250 and
 * bottom 340 kept clear; the recap. "I'm going" and the top venue only behind
 * their default-off toggles; no URL on the recap, no people, no dates.
 */
import { render, screen } from '@testing-library/react-native'
import React from 'react'
import { StyleSheet } from 'react-native'

import type { ShareEvent } from '../components/ds/LinkPreviewCard'
import { STORY, StoryCard } from '../components/ds/StoryCard'

const flat = (id: string) => StyleSheet.flatten(screen.getByTestId(id, { includeHiddenElements: true }).props.style)
const text = (t: string | RegExp) => screen.getByText(t, { includeHiddenElements: true })

const NEON: ShareEvent = {
  title: 'Neon Nights',
  date: { day: 'SAT', num: '04', month: 'OCT', time: '9:00 PM' },
  venue: 'Toit',
  area: 'Indiranagar',
  cover: 'https://example.com/cover.jpg',
  url: 'blendn.app/e/7f3a2c',
}

describe('<StoryCard>', () => {
  it('a story is 1080 × 1920 at any width', async () => {
    await render(<StoryCard kind="story" event={NEON} width={270} testID="s" />)
    expect(flat('s')).toMatchObject({ width: 270, height: 480 })
  })

  it('its words are fixed to its grid whatever the text size', async () => {
    await render(<StoryCard kind="story" event={NEON} going width={270} />)
    for (const w of ['SAT 04 OCT · 9:00 PM', 'Neon Nights', 'Toit · Indiranagar', 'I’m going', 'blendn.app/e/7f3a2c']) expect(text(w).props.allowFontScaling).toBe(false)
  })

  it('a square is square', async () => {
    await render(<StoryCard kind="square" event={NEON} width={300} testID="s" />)
    expect(flat('s')).toMatchObject({ width: 300, height: 300 })
  })

  it('the story keeps Instagram’s top 250 and bottom 340 clear', async () => {
    await render(<StoryCard kind="story" event={NEON} width={1080} testID="s" />)
    expect(flat('s-safe')).toMatchObject({ top: STORY.clearTop, bottom: STORY.clearBottom })
  })

  it('date, title, venue and the link line; “I’m going” only when asked', async () => {
    await render(<StoryCard kind="story" event={NEON} width={270} testID="s" />)
    for (const t of ['SAT 04 OCT · 9:00 PM', 'Neon Nights', 'Toit · Indiranagar', 'blendn.app/e/7f3a2c']) expect(text(t)).toBeTruthy()
    expect(screen.queryByText('I’m going', { includeHiddenElements: true })).toBeNull()
    await render(<StoryCard kind="story" event={NEON} going width={270} />)
    expect(text('I’m going')).toBeTruthy()
  })

  it('the recap: the month and the tiles; the top venue only when asked', async () => {
    const stats = [
      { value: '14', label: 'nights out' },
      { value: '9', label: 'venues' },
      { value: '4', label: 'neighbourhoods' },
    ]
    await render(<StoryCard kind="recap" month="September" stats={stats} width={270} />)
    expect(text('Your September')).toBeTruthy()
    expect(text('nights out')).toBeTruthy()
    expect(screen.queryByText('top venue', { includeHiddenElements: true })).toBeNull()
    await render(<StoryCard kind="recap" month="September" stats={stats} topVenue="Toit" width={270} />)
    expect(text('top venue')).toBeTruthy()
  })
})

/*
 * <LinkPreviewCard> (guidelines/components/LinkPreviewCard.html, Flow 16 ·
 * 16.2): the 1200 × 630 card, drawn at any width. E1 an event with a cover
 * (the date stack, the cover contained on a blurred copy, the mark, "18+");
 * E2 without one; V1 a venue; F1 an invite with no inviter; A1 the app.
 * Never counts, live data or the sharer.
 */
import { render, screen } from '@testing-library/react-native'
import React from 'react'
import { StyleSheet } from 'react-native'

import { LinkPreviewCard, OG, type ShareEvent } from '../components/ds/LinkPreviewCard'
import { COLOR } from '../lib/design/tokens'

const flat = (id: string) => StyleSheet.flatten(screen.getByTestId(id, { includeHiddenElements: true }).props.style)
const text = (t: string | RegExp) => screen.getByText(t, { includeHiddenElements: true })

const NEON: ShareEvent = {
  title: 'Neon Nights',
  date: { day: 'SAT', num: '04', month: 'OCT', time: '9:00 PM' },
  venue: 'Toit',
  area: 'Indiranagar',
  cover: 'https://example.com/cover.jpg',
}

describe('<LinkPreviewCard>', () => {
  it('keeps 1200 × 630 at any width', async () => {
    await render(<LinkPreviewCard preview={{ template: 'event', event: NEON }} width={354} testID="c" />)
    expect(flat('c')).toMatchObject({ width: 354, height: (354 * OG.height) / OG.width, backgroundColor: COLOR.ink })
  })

  it('is an image: decorative for a screen reader, its words fixed to its grid whatever the text size', async () => {
    await render(<LinkPreviewCard preview={{ template: 'event', event: { ...NEON, cover: null } }} width={354} testID="c" />)
    expect(screen.getByTestId('c', { includeHiddenElements: true }).props.accessibilityElementsHidden).toBe(true)
    for (const w of ['SAT 04 OCT · 9:00 PM', 'Neon Nights', 'Toit · Indiranagar', '18+']) expect(text(w).props.allowFontScaling).toBe(false)
  })

  it('E1, with a cover: the date stack, the contained cover on its blurred copy, 18+', async () => {
    await render(<LinkPreviewCard preview={{ template: 'event', event: NEON }} width={354} testID="c" />)
    for (const t of ['SAT', '04', 'OCT', '9:00 PM', '18+']) expect(text(t)).toBeTruthy()
    expect(screen.getByTestId('c-cover-blur', { includeHiddenElements: true }).props.blurRadius).toBeGreaterThan(0)
    expect(screen.getByTestId('c-cover', { includeHiddenElements: true }).props.contentFit).toBe('contain')
    // The title lives in og:title, not on a covered card.
    expect(screen.queryByText('Neon Nights', { includeHiddenElements: true })).toBeNull()
  })

  it('18+ is an orange chip with dark type', async () => {
    await render(<LinkPreviewCard preview={{ template: 'event', event: NEON }} width={354} testID="c" />)
    expect(flat('c-18').backgroundColor).toBe(COLOR.brandOrange)
    expect(StyleSheet.flatten(text('18+').props.style).color).toBe(COLOR.textOnOrangeFlat)
  })

  it('cancelled: the date struck through and the band', async () => {
    await render(<LinkPreviewCard preview={{ template: 'event', event: { ...NEON, cancelled: true } }} width={354} testID="c" />)
    expect(StyleSheet.flatten(text('04').props.style).textDecorationLine).toBe('line-through')
    expect(text('CANCELLED')).toBeTruthy()
  })

  it('E2, no cover: the date line, the title and venue · area in type', async () => {
    await render(<LinkPreviewCard preview={{ template: 'event', event: { ...NEON, cover: null } }} width={354} testID="c" />)
    expect(text('SAT 04 OCT · 9:00 PM')).toBeTruthy()
    expect(text('Neon Nights').props.numberOfLines).toBe(3)
    expect(text('Toit · Indiranagar')).toBeTruthy()
  })

  it('an unlisted event shows its area only', async () => {
    await render(<LinkPreviewCard preview={{ template: 'event', event: { ...NEON, cover: null, unlisted: true } }} width={354} />)
    expect(text('Indiranagar')).toBeTruthy()
    expect(screen.queryByText(/Toit/, { includeHiddenElements: true })).toBeNull()
  })

  it('V1: a venue, no live data', async () => {
    await render(<LinkPreviewCard preview={{ template: 'venue', name: 'Toit', typeLabel: 'Brewery', area: 'Indiranagar' }} width={354} />)
    expect(text('VENUE')).toBeTruthy()
    expect(text('Toit')).toBeTruthy()
    expect(text('Brewery · Indiranagar')).toBeTruthy()
  })

  it('F1 names no inviter; A1 is the app', async () => {
    await render(<LinkPreviewCard preview={{ template: 'invite' }} width={354} />)
    expect(text('You’re invited to Blend’n')).toBeTruthy()
    expect(text('A friend wants to add you.')).toBeTruthy()
    await render(<LinkPreviewCard preview={{ template: 'app' }} width={354} />)
    expect(text('Meet who’s there on the night.')).toBeTruthy()
  })
})

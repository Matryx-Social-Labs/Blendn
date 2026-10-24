/*
 * The Geist Mono family (guidelines/components/MonoFamily.html): Badge,
 * PresenceDot, LivePill, TimeBadge and Price. Small marks on the 12 pt floor
 * that report and never act: none is tappable, none plays a haptic, and the
 * first three are read with the element they decorate.
 */
import { act, render, screen } from '@testing-library/react-native'
import React from 'react'
import { AccessibilityInfo, StyleSheet, Text } from 'react-native'

import { badgeFadeIn, badgeIn } from '../components/motion/presence'
import { Badge, LivePill, MonoRun, PresenceDot, Price, TimeBadge } from '../components/ds/MonoFamily'
import { COLOR, FONT_FAMILY, MATERIAL, TYPE } from '../lib/design/tokens'

const flat = (id: string) => StyleSheet.flatten(screen.getByTestId(id, { includeHiddenElements: true }).props.style)
const text = (t: string) => screen.getByText(t, { includeHiddenElements: true })

describe('<Badge> motion (DS #28, #26)', () => {
  it('a count is a RollingNumber in the badge role: Geist Mono 700 at 12/16, ink', async () => {
    await render(<Badge text={14} testID="b" />)
    expect(screen.getByTestId('b-count', { includeHiddenElements: true })).toBeTruthy()
    const digit = StyleSheet.flatten(screen.getByTestId('b-count-0-in', { includeHiddenElements: true }).props.style)
    expect(digit).toMatchObject({ color: COLOR.ink, fontFamily: FONT_FAMILY.mono[700], fontSize: TYPE.caption.fontSize, lineHeight: TYPE.caption.lineHeight })
  })

  it('“9+”, “99+” and “3 new” never roll: they are plain text', async () => {
    for (const label of ['9+', '99+', '3 new']) {
      await render(<Badge text={label} testID="w" />)
      expect(screen.queryByTestId('w-count', { includeHiddenElements: true })).toBeNull()
      expect(text(label)).toBeTruthy()
    }
  })

  /** The badge's own root layer, as it reaches the host. */
  const root = () => (screen.toJSON() as { props: { entering?: unknown; exiting?: unknown } }).props

  it('a badge in a row has no entering or exiting animation: scrolling and first paint never pop', async () => {
    await render(<Badge text={3} testID="b" />)
    expect(root().entering).toBeUndefined()
    expect(root().exiting).toBeUndefined()
  })

  it('with `arrive` (the bell, a filter count, a dock’s “n new”) it arrives and leaves', async () => {
    await render(<Badge text={3} arrive testID="b" />)
    expect(root().entering).toBe(badgeIn)
    expect(root().exiting).toBeDefined()
  })

  it('it arrives from 0.8 and fades in over quick; Reduce Motion is the fade alone', () => {
    const entering = badgeIn()
    expect(entering.initialValues).toEqual({ opacity: 0, transform: [{ scale: 0.8 }] })
    expect(badgeFadeIn).toBeDefined()
  })
})

describe('<Badge>', () => {
  it('is an 18 pt white pill with ink digits in Geist Mono 700, capped at 1.3×', async () => {
    await render(<Badge text={3} testID="b" />)
    expect(flat('b')).toMatchObject({ minHeight: 18, minWidth: 18, backgroundColor: COLOR.textPrimary })
    const digits = text('3')
    expect(StyleSheet.flatten(digits.props.style)).toMatchObject({ color: COLOR.ink, fontFamily: FONT_FAMILY.mono[700] })
    expect(digits.props.maxFontSizeMultiplier).toBe(1.3)
  })

  it('is a 22 pt pill as a label (“3 new”)', async () => {
    await render(<Badge text="3 new" size={22} testID="b" />)
    expect(flat('b')).toMatchObject({ minHeight: 22, minWidth: 22 })
  })

  it('cuts out of what it sits on with a 2 pt ring in the ground colour', async () => {
    await render(<Badge text={2} ring={COLOR.ink} testID="b" />)
    expect(flat('b-ring')).toMatchObject({ padding: 2, backgroundColor: COLOR.ink })
  })

  it('is folded into its parent for a screen reader', async () => {
    await render(<Badge text={3} testID="b" />)
    expect(screen.queryByText('3')).toBeNull()
  })
})

describe('<PresenceDot>', () => {
  it('unread is a 10 pt white dot; live is the 8 pt live green; both are hidden', async () => {
    await render(<PresenceDot testID="d" />)
    expect(flat('d')).toMatchObject({ width: 10, height: 10, backgroundColor: COLOR.textPrimary })
    await render(<PresenceDot kind="live" testID="d" />)
    expect(flat('d')).toMatchObject({ width: 8, height: 8, backgroundColor: COLOR.live })
    expect(screen.getByTestId('d', { includeHiddenElements: true }).props.accessibilityElementsHidden).toBe(true)
  })

  it('takes a colour for the unread dot (a world’s light glyph tone), and the live dot ignores it', async () => {
    await render(<PresenceDot color={COLOR.selectionRoseGlyph} size={8} testID="d" />)
    expect(flat('d')).toMatchObject({ width: 8, backgroundColor: COLOR.selectionRoseGlyph })
    await render(<PresenceDot kind="live" color={COLOR.selectionRoseGlyph} testID="d" />)
    expect(flat('d').backgroundColor).toBe(COLOR.live)
  })

  it('takes a size and a ring on a face', async () => {
    await render(<PresenceDot kind="live" size={12} ring={COLOR.ink} testID="d" />)
    expect(flat('d')).toMatchObject({ width: 12, borderColor: COLOR.ink })
  })
})

describe('<LivePill> and <TimeBadge>', () => {
  it('LivePill is the scrim pill with the live dot and the bucket word, read verbatim', async () => {
    await render(<LivePill text="5–9 live" testID="p" />)
    expect(flat('p')).toMatchObject({ height: 28, backgroundColor: MATERIAL.scrimPill, borderColor: COLOR.hairlineStrong })
    expect(screen.getByTestId('p-dot', { includeHiddenElements: true })).toBeTruthy()
    expect(screen.getByText('5–9 live')).toBeTruthy()
  })

  it('TimeBadge: “Live” takes the dot; a time is Geist Mono tabular', async () => {
    await render(<TimeBadge when="Live" testID="t" />)
    expect(screen.getByTestId('t-dot', { includeHiddenElements: true })).toBeTruthy()
    await render(<TimeBadge when="10:30 PM" testID="t" />)
    expect(screen.queryByTestId('t-dot', { includeHiddenElements: true })).toBeNull()
    expect(StyleSheet.flatten(text('10:30 PM').props.style)).toMatchObject({
      fontFamily: FONT_FAMILY.mono[500],
      fontVariant: ['tabular-nums'],
    })
  })

  it('Increase Contrast: the pill’s hairline goes to 1 pt at 50%', async () => {
    jest.spyOn(AccessibilityInfo, 'isDarkerSystemColorsEnabled').mockResolvedValue(true)
    await render(<LivePill text="20+ live" testID="p" />)
    await act(async () => {})
    expect(flat('p')).toMatchObject({ borderWidth: 1, borderColor: MATERIAL.hairlineIncreaseContrast })
  })
})

describe('<Price>', () => {
  it('Geist Mono 700, tabular, the ₹ in the string; the unit in Satoshi, textSecondary', async () => {
    await render(<Price amount="₹199" per="/ month" size="md" />)
    expect(StyleSheet.flatten(text('₹199').props.style)).toMatchObject({
      fontFamily: FONT_FAMILY.mono[700],
      fontVariant: ['tabular-nums'],
      fontSize: TYPE.heading.fontSize,
    })
    expect(StyleSheet.flatten(text('/ month').props.style)).toMatchObject({
      fontFamily: FONT_FAMILY.brand[400],
      color: COLOR.textSecondary,
    })
  })

  it('reads as words: “199 rupees a month”', async () => {
    await render(<Price amount="₹199" per="/ month" testID="p" />)
    expect(screen.getByLabelText('199 rupees a month')).toBeTruthy()
    await render(<Price amount="Free" testID="p" />)
    expect(screen.getByLabelText('Free')).toBeTruthy()
  })

  it('scales freely: no cap', async () => {
    await render(<Price amount="₹49" per="tonight" size="lg" />)
    expect(text('₹49').props.maxFontSizeMultiplier).toBeUndefined()
  })
})

describe('a mono run divided by middots', () => {
  it('sets the middot and its spaces in the brand face, the day and the clock in mono', async () => {
    await render(
      <Text testID="run" style={{ fontFamily: FONT_FAMILY.mono[500] }}>
        <MonoRun text="Sun · 3:30 PM" />
      </Text>,
    )
    const run = screen.getByTestId('run')
    const divider = run.children.find((c) => typeof c !== 'string' && c.props.children === ' · ') as unknown as { props: { style: { fontFamily: string } } }
    expect(StyleSheet.flatten(divider.props.style).fontFamily).toBe(FONT_FAMILY.brand[500])
    expect(screen.getByText('Sun · 3:30 PM')).toBeTruthy()
    await render(<TimeBadge when="Live" testID="tb" />)
    expect(screen.getByText('Live')).toBeTruthy()
  })

  it('sets every plain space in the brand face too, so "1:12 PM" and "Oct 2026" do not read double-spaced (C16, C17, D-L1)', async () => {
    const spacesIn = (text: string) =>
      screen
        .getByText(text)
        .children.filter((c) => typeof c !== 'string' && c.props.children === ' ')
        .map((c) => StyleSheet.flatten((c as unknown as { props: { style: object } }).props.style).fontFamily)
    await render(
      <Text style={{ fontFamily: FONT_FAMILY.mono[500] }}>
        <MonoRun text="1:12 PM" />
      </Text>,
    )
    expect(spacesIn('1:12 PM')).toEqual([FONT_FAMILY.brand[500]])
    await render(
      <Text style={{ fontFamily: FONT_FAMILY.mono[500] }}>
        <MonoRun text="Sat 24 Oct · 9 PM" />
      </Text>,
    )
    expect(spacesIn('Sat 24 Oct · 9 PM')).toEqual([FONT_FAMILY.brand[500], FONT_FAMILY.brand[500], FONT_FAMILY.brand[500]])
    // The digits and words stay in the mono run: only separators are pulled out.
    expect(screen.getByText('Sat 24 Oct · 9 PM').children.filter((c) => typeof c === 'string')).toEqual(['Sat', '24', 'Oct', '9', 'PM'])
  })
})

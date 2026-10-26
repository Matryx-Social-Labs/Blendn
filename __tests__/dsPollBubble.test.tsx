/*
 * <PollBubble> (guidelines/components/PollBubble.html, ROUND3 C8): rings
 * before you vote; your pick outlined with 6% bars and Geist Mono counts
 * after; "Fewer than 5" never a zero; "Results appear when the poll closes";
 * closed rows no longer press; a vote can change while it is open; H.select
 * on a vote or a change, never on a re-tap.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import React from 'react'
import { AccessibilityInfo, Dimensions, StyleSheet } from 'react-native'

import { PollBubble, type PollOption } from '../components/ds/PollBubble'
import { CONTROL_FONT_CAP, HueProvider } from '../components/ds/shared'
import { COLOR, FONT_FAMILY, MATERIAL, MAX_FONT_SCALE } from '../lib/design/tokens'
import { H } from '../lib/haptics'
import { AX_XXXL, uncapped } from './helpers/ax'

const Q = 'Encore: one more or call it?'
const counted: PollOption[] = [
  { label: 'One more', votes: 7 },
  { label: 'Call it', votes: 3 },
]
const options = () => screen.getAllByRole('radio')

let select: jest.SpyInstance
beforeEach(() => {
  select = jest.spyOn(H, 'select').mockImplementation(() => {})
})

describe('<PollBubble>', () => {
  it('open: rings, no counts; a tap votes with H.select', async () => {
    const onVote = jest.fn()
    await render(<PollBubble question={Q} options={counted} onVote={onVote} />)
    expect(screen.getByText('Tap to vote · you can change it until it closes')).toBeTruthy()
    expect(screen.queryByText('7')).toBeNull()
    expect(options().map((o) => o.props.accessibilityState)).toEqual([
      expect.objectContaining({ checked: false }),
      expect.objectContaining({ checked: false }),
    ])
    await fireEvent.press(options()[1])
    expect(onVote).toHaveBeenCalledWith(1)
    expect(select).toHaveBeenCalledTimes(1)
  })

  it('voted: your pick checked, counts in Geist Mono, the total; a change plays H.select, a re-tap nothing', async () => {
    const onVote = jest.fn()
    await render(<PollBubble question={Q} options={counted} picked={0} onVote={onVote} testID="p" />)
    expect(options()[0].props.accessibilityState).toMatchObject({ checked: true })
    expect(options()[0].props.accessibilityLabel).toBe('One more, 7 votes')
    expect(StyleSheet.flatten(screen.getByText('7').props.style).fontFamily).toBe(FONT_FAMILY.mono[500])
    expect(screen.getByText('10 votes')).toBeTruthy()
    expect(StyleSheet.flatten(screen.getByTestId('p-bar-0').props.style).width).toBe('70%')
    await fireEvent.press(options()[0])
    expect(onVote).not.toHaveBeenCalled()
    expect(select).not.toHaveBeenCalled()
    await fireEvent.press(options()[1])
    expect(onVote).toHaveBeenCalledWith(1)
    expect(select).toHaveBeenCalledTimes(1)
  })

  it('withheld: “Fewer than 5”, never a zero, and no bars', async () => {
    await render(
      <PollBubble question={Q} options={[{ label: 'One more', votes: null }, { label: 'Call it', votes: null }]} picked={0} testID="p" />
    )
    expect(screen.getAllByText('Fewer than 5')).toHaveLength(2)
    expect(screen.getByText('Counts show once 5 or more people vote')).toBeTruthy()
    expect(screen.queryByTestId('p-bar-0')).toBeNull()
    expect(options()[0].props.accessibilityLabel).toBe('One more, fewer than 5 votes')
  })

  it('hidden: the server’s line, no counts', async () => {
    await render(<PollBubble question={Q} options={[{ label: 'One more' }, { label: 'Call it' }]} picked={1} />)
    expect(screen.getByText('Results appear when the poll closes')).toBeTruthy()
    expect(screen.queryByText('Fewer than 5')).toBeNull()
  })

  it('closed: marked closed, the total, and rows that no longer press', async () => {
    const onVote = jest.fn()
    await render(<PollBubble question={Q} options={counted} picked={0} closed onVote={onVote} />)
    expect(screen.getByText('Closed · 10 votes')).toBeTruthy()
    expect(options()[1].props.accessibilityState).toMatchObject({ disabled: true })
    await fireEvent.press(options()[1])
    expect(onVote).not.toHaveBeenCalled()
  })

  it('closed with counts withheld: “Closed”, never “0 votes”; a mix draws no bars', async () => {
    await render(<PollBubble question={Q} options={[{ label: 'One more', votes: null }, { label: 'Call it', votes: null }]} closed testID="p" />)
    expect(screen.getByText('Closed', { exact: true })).toBeTruthy()
    expect(screen.queryByText(/0 votes/)).toBeNull()
    await screen.rerender(<PollBubble question={Q} options={[{ label: 'One more', votes: 7 }, { label: 'Call it', votes: null }]} picked={0} testID="p" />)
    expect(screen.queryByTestId('p-bar-0')).toBeNull()
  })

  it('reads as one poll: who it is from, then the question', async () => {
    await render(<PollBubble question={Q} options={counted} />)
    expect(screen.getByLabelText(`Poll from the organizer: ${Q}`)).toBeTruthy()
  })

  it('Increase Contrast: the hairline on the bubble', async () => {
    jest.spyOn(AccessibilityInfo, 'isDarkerSystemColorsEnabled').mockResolvedValue(true)
    await render(<PollBubble question={Q} options={counted} testID="p" />)
    await act(async () => {})
    expect(StyleSheet.flatten(screen.getByTestId('p').props.style).borderColor).toBe(MATERIAL.hairlineIncreaseContrast)
  })
})

describe('the pick in the screen’s hue, and the type at its caps (B-R5, B-R6)', () => {
  it('your pick is lit as a chip is, in the hue: the rim and the fill, never a white rim', async () => {
    await render(
      <HueProvider value="rose">
        <PollBubble question={Q} options={counted} picked={0} testID="p" />
      </HueProvider>
    )
    const picked = StyleSheet.flatten(options()[0].props.style)
    expect(picked.borderColor).toBe(COLOR.brandRose)
    expect(picked.backgroundColor).toBe(COLOR.selectionRoseFill)
    expect(picked.borderColor).not.toBe(COLOR.textPrimary)
    const other = StyleSheet.flatten(options()[1].props.style)
    expect(other.backgroundColor).toBe(COLOR.surface)
  })

  it('at AX XXXL the options stop at the control cap, the question and the foot at their roles’ caps', async () => {
    const window = Dimensions.get('window')
    try {
      await act(async () => Dimensions.set({ window: { ...window, fontScale: AX_XXXL }, screen: { ...window, fontScale: AX_XXXL } }))
      await render(<PollBubble question={Q} options={counted} picked={0} closed testID="p" />)
      expect(screen.getByText('One more').props.maxFontSizeMultiplier).toBe(CONTROL_FONT_CAP)
      expect(screen.getByText(Q).props.maxFontSizeMultiplier).toBe(MAX_FONT_SCALE.bodyStrong)
      expect(uncapped(screen.toJSON())).toEqual([])
    } finally {
      Dimensions.set({ window, screen: window })
    }
  })
})

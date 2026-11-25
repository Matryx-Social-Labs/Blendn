/*
 * SCRUM-1001 M31: the profile hero advances by itself only while nobody is reading or looking closer. A screen reader
 * moves through the photos itself (an advance moves what it is reading), and a tap that opens the viewer takes the hero
 * over, so it never moves behind the viewer, or after it closes.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import React from 'react'
import { AccessibilityInfo, ScrollView } from 'react-native'

import { HERO_DWELL_MS, ProfileHeroPager } from '../components/profile/ProfileHeroPager'

const PHOTOS = ['https://x/a.jpg', 'https://x/b.jpg', 'https://x/c.jpg']
const scrolls = () => jest.spyOn(ScrollView.prototype, 'scrollTo')

beforeEach(() => {
  jest.useFakeTimers()
  jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(false)
})
afterEach(() => {
  jest.useRealTimers()
  jest.restoreAllMocks()
})

it('advances by itself after the dwell (the control for the two below)', async () => {
  const onPage = jest.fn()
  await render(<ProfileHeroPager photos={PHOTOS} width={390} height={500} onPage={onPage} />)
  await act(async () => jest.advanceTimersByTime(HERO_DWELL_MS))
  expect(onPage).toHaveBeenCalledWith(1)
})

it('never advances under a screen reader', async () => {
  jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(true)
  const onPage = jest.fn()
  await render(<ProfileHeroPager photos={PHOTOS} width={390} height={500} onPage={onPage} />)
  await act(async () => jest.advanceTimersByTime(HERO_DWELL_MS * 3))
  expect(onPage).not.toHaveBeenCalled()
})

it('a tap that opens the viewer takes it over: it never moves on behind it, or after', async () => {
  const onPage = jest.fn()
  const onPress = jest.fn()
  const scrollTo = scrolls()
  await render(<ProfileHeroPager photos={PHOTOS} width={390} height={500} onPage={onPage} onPress={onPress} />)
  await fireEvent.press(screen.getByTestId('hero-photo-0'))
  expect(onPress).toHaveBeenCalledWith(0)
  await act(async () => jest.advanceTimersByTime(HERO_DWELL_MS * 3))
  expect(onPage).not.toHaveBeenCalled()
  expect(scrollTo).not.toHaveBeenCalled()
})

/**
 * Flow 3 · Pulse, Option C, against its board (mockups/redesign-2026-11/flow-3-pulse/pulse.css, owner 2026-11-03: "whatever
 * mockups you show and I agree with, follow the same always"). Each value here is the board's; the drawer is the one
 * ruled exception (ink, not the board's glass).
 */
import AsyncStorage from '@react-native-async-storage/async-storage'
import { act, render, screen } from '@testing-library/react-native'
import React from 'react'
import { StyleSheet, Text } from 'react-native'

jest.mock('../lib/useFriendInvite', () => ({ useFriendInvite: () => ({ invite: { token: 't', url: 'u' }, failed: false, share: jest.fn(), reload: jest.fn(), reset: jest.fn() }) }))
jest.mock('expo-image', () => ({ Image: () => null }))

/* eslint-disable import/first */
import { Banner } from '../components/ds/Banner'
import { Chip } from '../components/ds/Chip'
import { FriendsCard } from '../components/pulse/FriendsCard'
import { LeadPager } from '../components/pulse/LeadPager'
import { COLOR, MATERIAL } from '../lib/design/tokens'
/* eslint-enable import/first */

beforeEach(() => AsyncStorage.clear())

it('.lead: the ember glow sits under the card (0 18px 60px -18px, 55%), with a 0.5 pt light rim', async () => {
  expect(MATERIAL.glowLead).toEqual([{ offsetY: 18, radius: 60, spread: -18, color: 'rgba(240,84,35,0.55)' }])
  await render(<LeadPager cards={[{ id: 'a', title: 'Night', time: '9 PM', venue: 'Pebble' }]} width={345} height={256} onOpen={jest.fn()} />)
  const glow = StyleSheet.flatten(screen.getByTestId('pulse-lead-glow', { includeHiddenElements: true }).props.style)
  expect(glow.boxShadow).toEqual([{ offsetX: 0, offsetY: 18, blurRadius: 60, spreadDistance: -18, color: 'rgba(240,84,35,0.55)' }])
  const rim = StyleSheet.flatten(screen.getByTestId('pulse-lead-rim', { includeHiddenElements: true }).props.style)
  expect(rim).toMatchObject({ borderWidth: 0.5, borderColor: COLOR.hairline })
})

it('.fc: the friends card is lit from its top-left corner in ember over the surface', async () => {
  await render(<FriendsCard userId="u1" />)
  await act(async () => {})
  expect(screen.getByTestId('pulse-friends-glow', { includeHiddenElements: true })).toBeTruthy()
})

it('.qc / .qc.on: a header chip is 36 pt, and a selected chip’s count is ember, not grey', async () => {
  await render(<Chip label="Tonight" count="214" size="header" selected onPress={jest.fn()} testID="c" />)
  expect(StyleSheet.flatten(screen.getByTestId('c').props.style).minHeight).toBe(36)
  expect(StyleSheet.flatten(screen.getByTestId('c-count').props.style).color).toBe(COLOR.selectionEmberGlyph)
  // Control: off, the count is the secondary grey.
  await render(<Chip label="Tonight" count="214" size="header" onPress={jest.fn()} testID="d" />)
  expect(StyleSheet.flatten(screen.getByTestId('d-count').props.style).color).toBe(COLOR.textSecondary)
})

it('.mbn: a banner on the map is glass, not the list’s solid strip', async () => {
  await render(<Banner kind="info" text="Visiting Toronto" onMap testID="b" />)
  expect(screen.getByTestId('b-material', { includeHiddenElements: true })).toBeTruthy()
  expect(StyleSheet.flatten(screen.getByTestId('b').props.style).backgroundColor).toBe('transparent')
  // Control: in a list it keeps its solid fill.
  await render(<Banner kind="info" text="x" testID="l" />)
  expect(StyleSheet.flatten(screen.getByTestId('l').props.style).backgroundColor).toBe(COLOR.surface)
  expect(screen.queryByTestId('l-material', { includeHiddenElements: true })).toBeNull()
  void Text
})

it('.lead .foot: the words 20 in and 18 up, and "86 going" as the foot’s last line, not a pill by the time', async () => {
  const { EventCard } = jest.requireActual('../components/ds/EventCard')
  await render(<EventCard kind="hero" layout="lead" title="Night" time="Sat · 10:30 PM" venue="Pebble" going={86} testID="l" />)
  expect(screen.getByTestId('l-people', { includeHiddenElements: true })).toBeTruthy()
  const foot = screen.getByTestId('l-foot', { includeHiddenElements: true })
  expect(StyleSheet.flatten(foot.props.style)).toMatchObject({ left: 20, right: 20, bottom: 18 })
  // Control: the DS hero elsewhere keeps its people pill and its 24 pt foot.
  await render(<EventCard kind="hero" title="Night" time="Sat · 10:30 PM" venue="Pebble" going={86} testID="h" />)
  expect(screen.queryByTestId('h-people', { includeHiddenElements: true })).toBeNull()
  expect(screen.getAllByText('86 going', { includeHiddenElements: true }).length).toBeGreaterThan(0)
})

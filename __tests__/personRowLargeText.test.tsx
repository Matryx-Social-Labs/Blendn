/**
 * DS-05: person rows at large text (D-M5, D-LM10, P4, P5, C26, C27, D-LM2). The fc5eb48 pattern (Banter's request card):
 * the name grows to its role's cap and takes two lines at the accessibility sizes; the line under it grows to the meta cap
 * and takes four; the row's height is a minimum. Never a name held to one line at the control cap over a meta that grows.
 */
import { act, render, screen } from '@testing-library/react-native'
import React from 'react'
import { Dimensions, StyleSheet, Text } from 'react-native'

jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default)
jest.mock('../lib/apiClient', () => ({ apiClient: {} }))

/* eslint-disable import/first */
import { IncomingRequestRow, REQUEST_LINE } from '../components/friends/IncomingRequestRow'
import { InviteLinkCard } from '../components/friends/InviteLinkCard'
import { PersonRow, PERSON_ROW_HEIGHT, usePersonRowsFixed } from '../components/friends/PersonRow'
import { RevealBar } from '../components/ds/RevealBar'
import { CONTROL_FONT_CAP } from '../components/ds/shared'
import { FONT_FAMILY, MAX_FONT_SCALE } from '../lib/design/tokens'
import { AX_XXXL, clipped, uncapped } from './helpers/ax'
/* eslint-enable import/first */

const window = Dimensions.get('window')
const at = (width: number, fontScale: number) => act(async () => Dimensions.set({ window: { ...window, width, fontScale }, screen: { ...window, width, fontScale } }))
afterEach(() => Dimensions.set({ window, screen: window }))
const hidden = { includeHiddenElements: true }
const person = { userId: 'u1', name: 'Aarav Venkataraman Sharma', photo: null }

describe('PersonRow', () => {
  it('at AX XXXL: the name at its role’s cap in two lines, the line under it at the meta cap in four, and the row a minimum', async () => {
    await at(402, AX_XXXL)
    await render(<PersonRow person={person} detail="Friends since " detailMono="Oct 2026" />)
    const name = screen.getByTestId('person-name', hidden)
    expect(name.props).toMatchObject({ maxFontSizeMultiplier: MAX_FONT_SCALE.bodyStrong, numberOfLines: 2 })
    const line = screen.getByTestId('person-detail', hidden)
    expect(line.props).toMatchObject({ maxFontSizeMultiplier: MAX_FONT_SCALE.meta, numberOfLines: 4 })
    expect(uncapped(screen.toJSON())).toEqual([])
    expect(clipped(screen.toJSON())).toEqual([])
    const row = StyleSheet.flatten(screen.getByTestId('person-row', hidden).props.style)
    expect(row.minHeight).toBe(PERSON_ROW_HEIGHT)
    expect(row.height).toBeUndefined()
  })

  it('at 360 dp and 1.3 the line under the name may take two lines rather than truncate (P5)', async () => {
    await at(360, 1.3)
    await render(<PersonRow person={person} detail="Blocked " detailMono="12 Sep" detailTail=" · Harassment and repeated messages" />)
    expect(screen.getByTestId('person-detail', hidden).props.numberOfLines).toBe(2)
    expect(screen.getByTestId('person-name', hidden).props.numberOfLines).toBe(1)
  })

  it('a list may window the rows at PERSON_ROW_HEIGHT only at the default text size: past it a row can grow', async () => {
    const Probe = () => <Text testID="fixed">{String(usePersonRowsFixed())}</Text>
    await at(402, 1)
    await render(<Probe />)
    expect(screen.getByTestId('fixed').props.children).toBe('true')
    await at(402, 1.1)
    await render(<Probe />)
    expect(screen.getByTestId('fixed').props.children).toBe('false')
  })
})

describe('IncomingRequestRow (D-M5, D-LM2)', () => {
  const request = { id: 'r1', person, createdAt: new Date(Date.now() - 3 * 3600_000).toISOString() }

  it('at AX XXXL the name is not held to one line at the control cap while the line under it grows', async () => {
    await at(402, AX_XXXL)
    await render(<IncomingRequestRow request={request} busy={false} onRespond={jest.fn()} />)
    expect(screen.getByText(person.name).props).toMatchObject({ maxFontSizeMultiplier: MAX_FONT_SCALE.bodyStrong, numberOfLines: 2 })
    expect(screen.getByText(REQUEST_LINE).props).toMatchObject({ maxFontSizeMultiplier: MAX_FONT_SCALE.meta, numberOfLines: 4 })
    expect(uncapped(screen.toJSON())).toEqual([])
  })

  it('shows how long ago they asked, as a tag in Geist Mono at the control cap ("3h")', async () => {
    await at(402, 1)
    await render(<IncomingRequestRow request={request} busy={false} onRespond={jest.fn()} />)
    const time = screen.getByTestId('request-age', hidden)
    expect(time.props.children).toBe('3h')
    expect(time.props.maxFontSizeMultiplier).toBe(CONTROL_FONT_CAP)
    expect(StyleSheet.flatten(time.props.style).fontFamily).toBe(FONT_FAMILY.mono[500])
    expect(screen.getByText(person.name).props.numberOfLines).toBe(1)
  })

  it('a day-word age ("Yesterday") is set in the sans, not mono', async () => {
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    yesterday.setHours(12)
    await render(<IncomingRequestRow request={{ ...request, createdAt: yesterday.toISOString() }} busy={false} onRespond={jest.fn()} />)
    const time = screen.getByTestId('request-age', hidden)
    expect(time.props.children).toBe('Yesterday')
    expect(StyleSheet.flatten(time.props.style).fontFamily).not.toBe(FONT_FAMILY.mono[500])
  })
})

describe('InviteLinkCard (D-LM10)', () => {
  it('at AX XXXL every line is capped: your name in two lines at the heading cap, "on Blend’n" at the meta cap', async () => {
    await at(402, AX_XXXL)
    await render(<InviteLinkCard url="https://blendn.app/f/abc123def456" shared name="Aarav Venkataraman Sharma" />)
    expect(screen.getByText('Aarav Venkataraman Sharma').props).toMatchObject({ maxFontSizeMultiplier: MAX_FONT_SCALE.heading, numberOfLines: 2 })
    expect(screen.getByText('on Blend’n').props.maxFontSizeMultiplier).toBe(MAX_FONT_SCALE.meta)
    expect(uncapped(screen.toJSON())).toEqual([])
    await render(<InviteLinkCard failed name="A" />)
    expect(uncapped(screen.toJSON())).toEqual([])
    await render(<InviteLinkCard name="A" />)
    expect(uncapped(screen.toJSON())).toEqual([])
  })
})

describe('RevealBar (C26, C27)', () => {
  const face = { kind: 'creature', pseudonym: 'Tumbling Moose' } as never
  const bar = () => render(<RevealBar state="none" you={{ name: 'Aarav Venkataraman', face }} them={{ name: 'Tumbling Moose of the North', face }} />)

  it('at 360 dp and 1.3 each name may take two lines, and "You" stacks over yours', async () => {
    await at(360, 1.3)
    await bar()
    for (const name of ['Aarav Venkataraman', 'Tumbling Moose of the North']) expect(screen.getByText(name, hidden).props.numberOfLines).toBe(2)
    expect(screen.getByText('You', hidden).props.numberOfLines).toBe(1)
    expect(screen.queryByText('You · Aarav Venkataraman', hidden)).toBeNull()
  })

  it('on a roomy phone at the default size it reads as before: "You · name" on one run', async () => {
    await at(402, 1)
    await bar()
    expect(screen.getByText('You · Aarav Venkataraman', hidden).props.numberOfLines).toBe(2)
  })
})

describe('PersonRow’s mono date (DS-09, D-L1: "Friends since Oct  2026")', () => {
  it('sets the space inside "Oct 2026" in the brand face; the month and year stay mono', async () => {
    await at(402, 1)
    await render(<PersonRow person={person} detail="Friends since " detailMono="Oct 2026" />)
    const mono = screen.getByText('Oct 2026', hidden)
    expect(StyleSheet.flatten(mono.props.style).fontFamily).toBe(FONT_FAMILY.mono[500])
    const space = mono.children.find((c) => typeof c !== 'string' && c.props.children === ' ') as unknown as { props: { style: { fontFamily?: string } } }
    expect(StyleSheet.flatten(space.props.style).fontFamily).toBe(FONT_FAMILY.brand[500])
  })
})

describe('the invite link’s short form (DS-16, A9: the raw URL broke mid-token over two lines)', () => {
  it('shows the host and the token’s last six on one line, the middle ellipsized; a screen reader hears the whole link', async () => {
    await at(402, 1)
    await render(<InviteLinkCard url="https://www.blendn.app/f/abcdefghijklmnopqrstuv" />)
    const url = screen.getByTestId('invite-link-url', hidden)
    expect(url.props.children).toBe('blendn.app/…qrstuv')
    expect(url.props).toMatchObject({ numberOfLines: 1, ellipsizeMode: 'middle' })
    expect(url.props.accessibilityLabel).toBe('Your link, www.blendn.app/f/abcdefghijklmnopqrstuv')
  })

  it('a link that is not the expected shape is shown whole, still one line', async () => {
    await render(<InviteLinkCard url="https://example.com/x" />)
    expect(screen.getByTestId('invite-link-url', hidden).props.children).toBe('example.com/x')
  })
})

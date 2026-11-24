/**
 * DS-05: person rows at large text (D-M5, D-LM10, P4, P5, C26, C27, D-LM2). The fc5eb48 pattern (Banter's request card):
 * the name grows to its role's cap and takes two lines at the accessibility sizes; the line under it grows to the meta cap
 * and takes four; the row's height is a minimum. Never a name held to one line at the control cap over a meta that grows.
 */
import { act, render, screen, within } from '@testing-library/react-native'
import React from 'react'
import { Dimensions, StyleSheet, Text } from 'react-native'

jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default)
jest.mock('../lib/apiClient', () => ({ apiClient: {} }))

/* eslint-disable import/first */
import { IncomingRequestRow } from '../components/friends/IncomingRequestRow'
import { InviteLinkCard } from '../components/friends/InviteLinkCard'
import { PersonRow, PERSON_ROW_HEIGHT, usePersonRowsFixed } from '../components/friends/PersonRow'
import { ROW_ACTION_HEIGHT } from '../components/ds/Button'
import { IconButton } from '../components/ds/IconButton'
import { RevealBar } from '../components/ds/RevealBar'
import { AX_FONT_SCALE, CONTROL_FONT_CAP } from '../components/ds/shared'
import { FONT_FAMILY, MAX_FONT_SCALE, SIZE } from '../lib/design/tokens'
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

  /*
   * Owner pick a, 2026-11-20 (backend round 1, Blocked at AX): beside its action the text column was a third of the row, so
   * "Thiruvananthapuram" broke mid-word and names wrapped a word a line. From the AX sizes (`useLargeText`, AX_FONT_SCALE) the
   * action goes under the text, at the text's leading edge, and the text takes the row; below them it stays beside the text.
   * Negative controls (2026-11-20): the action always beside the text (the old row) fails the three AX cases only; the action
   * always under it fails the three below-AX cases only.
   */
  const unblock = <Text testID="trail">Unblock</Text>
  const blocked = (
    <PersonRow person={{ userId: 'u2', name: 'Marc-André Lefebvre-Desrosiers', photo: null }} named={false} detail="Blocked " detailMono="20 Nov" detailTail=" · Thiruvananthapuram Tech Week" trailing={unblock} />
  )
  const underText = () => within(screen.getByTestId('person-text', hidden)).queryByTestId('trail', hidden)

  it.each([AX_FONT_SCALE, 2, AX_XXXL])('at %s the action goes under the text, at its leading edge, and the text takes the row', async (scale) => {
    await at(402, scale)
    await render(blocked)
    expect(underText()).not.toBeNull()
    expect(screen.getAllByTestId('trail', hidden)).toHaveLength(1)
    const under = StyleSheet.flatten(screen.getByTestId('person-trailing', hidden).props.style)
    expect(under.alignSelf).toBe('flex-start')
    // A small button's slop to the larger target (Android's 48) stays inside the row, not over the next row's name.
    const slop = (Math.max(SIZE.targetIos, SIZE.targetAndroid) - ROW_ACTION_HEIGHT) / 2
    expect(under.marginVertical).toBeGreaterThanOrEqual(slop)
    expect(clipped(screen.toJSON())).toEqual([])
  })

  it.each([1, 1.3, AX_FONT_SCALE - 0.01])('at %s the action stays beside the text, centred on the row', async (scale) => {
    await at(402, scale)
    await render(blocked)
    expect(underText()).toBeNull()
    expect(screen.getAllByTestId('trail', hidden)).toHaveLength(1)
    expect(StyleSheet.flatten(screen.getByTestId('person-trailing', hidden).props.style).alignSelf).toBe('center')
  })

  /*
   * Friends list at AX (decided per advisor, 2026-11-20, option A): a lone icon-only action (an IconButton with no label,
   * the friends list's Message disc) stacked under "Friends since …" read detached from its row. At every size it stays at
   * the trailing edge, centred on the row as the avatar is; only labelled actions stack. Negative controls (2026-11-20):
   * stacking every action (#595's row) fails the first; keeping every action beside the text fails the second.
   */
  const message = <IconButton size="sm" icon="message-circle" accessibilityLabel="Message Marc-André" onPress={jest.fn()} testID="trail" />
  const friend = (trailing: React.ReactNode) => (
    <PersonRow person={{ userId: 'u3', name: 'Marc-André Lefebvre-Desrosiers', photo: null }} detail="Friends since " detailMono="Nov 2026" trailing={trailing} />
  )

  it.each([AX_FONT_SCALE, AX_XXXL])('at %s an icon-only action stays beside the text, centred on the row', async (scale) => {
    await at(402, scale)
    await render(friend(message))
    expect(underText()).toBeNull()
    expect(StyleSheet.flatten(screen.getByTestId('person-trailing', hidden).props.style).alignSelf).toBe('center')
    expect(clipped(screen.toJSON())).toEqual([])
  })

  it('at AX an IconButton with a label is a labelled action, so it goes under the text', async () => {
    await at(402, AX_XXXL)
    await render(friend(<IconButton size="sm" icon="message-circle" label="Message" accessibilityLabel="Message Marc-André" onPress={jest.fn()} testID="trail" />))
    expect(underText()).not.toBeNull()
  })

  it('a row with no action draws no action slot at any size', async () => {
    await at(402, AX_XXXL)
    await render(<PersonRow person={person} detail="Friends since " detailMono="Oct 2026" />)
    expect(screen.queryByTestId('person-trailing', hidden)).toBeNull()
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

  it('at AX XXXL the name and the line under it each take two lines at their caps, and the answers go under them', async () => {
    await at(402, AX_XXXL)
    await render(<IncomingRequestRow request={{ ...request, via: 'link' }} busy={false} onRespond={jest.fn()} />)
    expect(screen.getByText(person.name).props).toMatchObject({ maxFontSizeMultiplier: MAX_FONT_SCALE.bodyStrong, numberOfLines: 2 })
    expect(screen.getByTestId('request-line').props).toMatchObject({ maxFontSizeMultiplier: MAX_FONT_SCALE.meta, numberOfLines: 2 })
    expect(uncapped(screen.toJSON())).toEqual([])
  })

  /*
   * Flow 7 4-A: the source only when the server says it (`via`, admin #998). Requests from before it read `null`, and the old
   * line ("Opened your link") was wrong for every request from a match. Negative control: the old constant line fails the first.
   */
  it('says no source when the server sends none: the line is the age alone', async () => {
    await at(402, 1)
    await render(<IncomingRequestRow request={request} busy={false} onRespond={jest.fn()} />)
    expect(screen.queryByText(/From your link|From a match|Opened your link/)).toBeNull()
    expect(screen.getByTestId('request-line')).toHaveTextContent(/^\S+$/)
  })

  it('says no source for a request older than the source (`via: null`) or a source this build does not know', async () => {
    await at(402, 1)
    // Admin #998: `null` = asked before the source was recorded. Never a guess.
    await render(<IncomingRequestRow request={{ ...request, via: null }} busy={false} onRespond={jest.fn()} />)
    expect(screen.getByTestId('request-line')).toHaveTextContent(/^\S+$/)
    await render(<IncomingRequestRow request={{ ...request, via: 'qr' as unknown as 'link' }} busy={false} onRespond={jest.fn()} />)
    expect(screen.getByTestId('request-line')).toHaveTextContent(/^\S+$/)
  })

  it('says From your link or From a match when the server does, before the age', async () => {
    await at(402, 1)
    await render(<IncomingRequestRow request={{ ...request, via: 'match' }} busy={false} onRespond={jest.fn()} />)
    expect(screen.getByTestId('request-line')).toHaveTextContent(/^From a match · \S+$/)
    await render(<IncomingRequestRow request={{ ...request, via: 'link' }} busy={false} onRespond={jest.fn()} />)
    expect(screen.getByTestId('request-line')).toHaveTextContent(/^From your link · \S+$/)
  })

  it('is a 68 pt row with Not now and Accept named for the person', async () => {
    await at(402, 1)
    await render(<IncomingRequestRow request={request} busy={false} onRespond={jest.fn()} />)
    expect(StyleSheet.flatten(screen.getByTestId('request-row').props.style).minHeight).toBe(68)
    expect(screen.getByLabelText(`Not now, ${person.name}`)).toBeTruthy()
    expect(screen.getByLabelText(`Accept ${person.name}`)).toBeTruthy()
  })

  it('shows how long ago they asked, in Geist Mono ("3h")', async () => {
    // Midday, so three hours ago is still today: run between 00:00 and 03:00 it read "Yesterday".
    const noon = new Date()
    noon.setHours(12, 0, 0, 0)
    jest.useFakeTimers({ now: noon, advanceTimers: true })
    try {
      await at(402, 1)
      const createdAt = new Date(noon.getTime() - 3 * 3600_000).toISOString()
      await render(<IncomingRequestRow request={{ ...request, createdAt }} busy={false} onRespond={jest.fn()} />)
      const time = screen.getByTestId('request-age', hidden)
      expect(time.props.children).toBe('3h')
      expect(StyleSheet.flatten(time.props.style).fontFamily).toBe(FONT_FAMILY.mono[500])
      expect(screen.getByText(person.name).props.numberOfLines).toBe(1)
    } finally {
      jest.useRealTimers()
    }
  })

  it('a day-word age ("Yesterday") is set in the sans, not mono', async () => {
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    yesterday.setHours(12)
    await render(<IncomingRequestRow request={{ ...request, createdAt: yesterday.toISOString() }} busy={false} onRespond={jest.fn()} />)
    const time = screen.getByTestId('request-age', hidden)
    expect(time.props.children).toBe('Yesterday')
    expect(StyleSheet.flatten(time.props.style)?.fontFamily).not.toBe(FONT_FAMILY.mono[500])
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

/*
 * SCRUM-1088: on Android a friend request's face was blank until its photo arrived, because PersonAvatar drew the photo as a
 * bare OptimizedImage (nothing under it, and nothing at all until its URL effect ran). Every friend-surface photo now goes
 * through the DS Avatar, which draws the person's initial under the photo while it loads.
 * Negative control (2026-11-21): the old OptimizedImage branch fails both cases (no person-photo-initial-disc, no letter).
 */
describe('a friend-surface photo loads over the person’s initial (SCRUM-1088)', () => {
  const withPhoto = { userId: 'u2', name: 'Meera Nair', photo: 'https://t3.storage.dev/p/meera.jpg' }

  it('a request row draws Meera’s initial under her photo from the first frame', async () => {
    await at(402, 1)
    await render(<IncomingRequestRow request={{ id: 'r2', person: withPhoto, createdAt: new Date().toISOString(), via: 'link' as const }} busy={false} onRespond={jest.fn()} />)
    expect(screen.getByTestId('person-photo-initial-disc', hidden)).toBeTruthy()
    expect(screen.getByText('M', hidden)).toBeTruthy()
    expect(screen.getByTestId('person-photo-photo', hidden).props.source).toEqual([{ uri: withPhoto.photo }])
  })

  it('a friends-list row does the same', async () => {
    await at(402, 1)
    await render(<PersonRow person={withPhoto} detail="Friends since " detailMono="Oct 2026" />)
    expect(screen.getByTestId('person-photo-initial-disc', hidden)).toBeTruthy()
    expect(screen.getByText('M', hidden)).toBeTruthy()
  })
})

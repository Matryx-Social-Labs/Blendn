/**
 * RC drive D2: the accessibility text sizes (AX XXXL, fontScale 3.571: React Native's own multiplier) on the screens the drive caught, and a live change of
 * the text size.
 *
 * The rule (`AX_FONT_SCALE`, components/ds/shared.ts): reading text grows to its cap and wraps; nothing that grows sits in a
 * box of fixed height; controls and tab labels stop at CONTROL_FONT_CAP.
 */
import { act, fireEvent, render, screen, within } from '@testing-library/react-native'
import { readFileSync, readdirSync, existsSync } from 'fs'
import { join } from 'path'
import React, { useEffect } from 'react'
import { AccessibilityInfo, Dimensions, Platform, StyleSheet, Text, View } from 'react-native'
import { getByGestureTestId } from 'react-native-gesture-handler/jest-utils'

jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default)
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }))
jest.mock('react-native-maps', () => ({ __esModule: true, default: () => null, Marker: () => null }))
jest.mock('expo-glass-effect', () => {
  const { View: V } = jest.requireActual('react-native')
  return { GlassView: (props: object) => <V {...props} />, isGlassEffectAPIAvailable: jest.fn(() => true), isLiquidGlassAvailable: jest.fn(() => true) }
})
jest.mock('expo-blur', () => {
  const { View: V } = jest.requireActual('react-native')
  return { BlurView: (props: object) => <V {...props} /> }
})
jest.mock('expo-linear-gradient', () => {
  const { View: V } = jest.requireActual('react-native')
  return { LinearGradient: (props: object) => <V {...props} /> }
})

/* eslint-disable import/first */
import { AmenityGrid } from '../components/ds/AmenityTile'
import { SectionHeader } from '../components/ds/SectionHeader'
import { AX_FONT_SCALE, CONTROL_FONT_CAP } from '../components/ds/shared'
import { TabBar } from '../components/ds/TabBar'
import { BanterRow } from '../components/banter/BanterParts'
import { SceneCTA, sceneCtaLabel } from '../components/scene/SceneSections'
import { NAVIGATOR_ROUTES, TextSizeBoundary } from '../components/TextSizeBoundary'
import { MAX_FONT_SCALE, SPACE } from '../lib/design/tokens'
import { ChatHeader } from '../components/chat/ChatHeader'
import { MatchOpenerCard, NudgeLine, RevealLine, SayHi } from '../components/chat/DmParts'
import { RevealBar } from '../components/ds/RevealBar'
import { TextArea, TextField } from '../components/ds/TextField'
import { Composer } from '../components/ds/Composer'
import { SettingsGroup, SettingsRow } from '../components/ds/SettingsRow'
import { LegalLine } from '../components/LegalLine'
import { KeyboardPage } from '../components/onboarding/KeyboardPage'
import { Sheet } from '../components/ds/Sheet'
import { VisibilityBanner } from '../components/ds/Banner'
import { MakeCrewRow } from '../components/friends/MakeCrewRow'
import { AX_XXXL, clipped, oneLiners, uncapped } from './helpers/ax'
/* eslint-enable import/first */

const window = Dimensions.get('window')
const atScale = (fontScale: number) => act(async () => Dimensions.set({ window: { ...window, fontScale }, screen: { ...window, fontScale } }))
afterEach(() => Dimensions.set({ window: { ...window, fontScale: 2 }, screen: { ...window, fontScale: 2 } }))

describe('at AX XXXL (fontScale 3.571)', () => {
  beforeEach(() => atScale(AX_XXXL))

  it('is past AX_FONT_SCALE, and the jest scale is what the components read', () => {
    expect(AX_XXXL).toBeGreaterThan(AX_FONT_SCALE)
    expect(Dimensions.get('window').fontScale).toBe(AX_XXXL)
  })

  it('is React Native’s own multiplier for AX XXXL, read from its source (3.571, not body’s 53/17 = 3.1)', () => {
    const mm = readFileSync(require.resolve('react-native/React/CoreModules/RCTAccessibilityManager.mm'), 'utf8')
    const native = mm.match(/UIContentSizeCategoryAccessibilityExtraExtraExtraLarge\s*:\s*@([\d.]+)/)
    expect(Number(native?.[1])).toBe(AX_XXXL)
  })

  it('Make a crew (drive 5 D-3): a field label and its counter stack, so "0/14" is never clipped; the step-2 note is capped', async () => {
    await render(<TextArea label="A line about the crew" value="" onChangeText={() => {}} limit={140} testID="bio" />)
    const label = screen.getByText('A line about the crew')
    const row = StyleSheet.flatten(screen.getByTestId('bio-label-row').props.style)
    expect(row.flexDirection).not.toBe('row')
    // The label keeps the start, as every other field's does; only the counter goes to the end (rc7 D6).
    expect(row.alignItems).toBeUndefined()
    const counter = screen.getByTestId('bio-label-row').children[1] as unknown as { props: { style: object } }
    expect(StyleSheet.flatten(counter.props.style)).toMatchObject({ alignSelf: 'flex-end' })
    expect(StyleSheet.flatten(label.props.style).flexShrink).toBe(1)
    await screen.unmount()
    const { FriendsStep } = require('../components/crews/MakeSteps')
    await render(<FriendsStep friends={[]} picked={[]} onToggle={() => {}} onRetry={() => {}} />)
    expect(screen.getByTestId('make-friends-note').props.maxFontSizeMultiplier).toBe(MAX_FONT_SCALE.meta)
  })

  it('a section heading (Me: "Finish your profile") wraps in full at its cap, never "Finish your pro…"', async () => {
    await render(<SectionHeader title="Finish your profile" testID="h" />)
    const title = screen.getByText('Finish your profile')
    expect(title.props.numberOfLines).toBeUndefined()
    expect(title.props.maxFontSizeMultiplier).toBe(MAX_FONT_SCALE.heading)
    expect(clipped(screen.toJSON())).toEqual([])
  })

  it('a Banter row (Past rooms) takes two lines for its title and its line, at the reading cap, and grows', async () => {
    await render(
      <BanterRow
        face={{ kind: 'room', cover: null } as never}
        title="Bengaluru Design Festival 2026"
        line={{ kind: 'text', text: 'Crashing the after party at the bandstand' } as never}
        time="Sat"
        unread={false}
        testID="row"
      />
    )
    const title = screen.getByText('Bengaluru Design Festival 2026')
    const line = screen.getByText('Crashing the after party at the bandstand')
    expect(title.props.numberOfLines).toBe(2)
    expect(line.props.numberOfLines).toBe(2)
    // The title never reads smaller than the line under it.
    expect(title.props.maxFontSizeMultiplier).toBeGreaterThanOrEqual(line.props.maxFontSizeMultiplier)
    expect(clipped(screen.toJSON())).toEqual([])
    expect(StyleSheet.flatten(screen.getByTestId('row').props.style).height).toBeUndefined()
  })

  it('the Scene’s fact tiles go 1-up and wrap their value; no text in a fixed box', async () => {
    await render(<AmenityGrid tiles={[{ label: 'WHERE', value: 'Bangalore Palace Grounds, Gate 4' }, { label: 'PRICE', value: 'Free' }]} testID="g" />)
    expect(screen.getByText('Bangalore Palace Grounds, Gate 4').props.numberOfLines).toBe(3)
    expect(StyleSheet.flatten(screen.getByTestId('g-0').props.style).flexBasis).toBe('100%')
    expect(clipped(screen.toJSON())).toEqual([])
    expect(oneLiners(screen.toJSON())).toEqual([])
  })

  it('the Scene’s Go button: its label stops at the control cap (the pill is summed into SCENE_CTA_HEIGHT, a constant)', async () => {
    await render(<SceneCTA state="rsvp" onPress={jest.fn()} />)
    expect(screen.getByText(sceneCtaLabel('rsvp')).props.maxFontSizeMultiplier).toBe(CONTROL_FONT_CAP)
    expect(clipped(screen.toJSON())).toEqual([])
  })

  it('the tab bar: labels at the control cap, and the large content viewer on every tab', async () => {
    await render(<TabBar selected="me" onSelect={jest.fn()} disc={{ target: { state: 'idle', eventId: null, badge: 0 }, onPress: jest.fn() }} testID="tabs" />)
    for (const tab of screen.getAllByRole('tab')) {
      expect(tab.props.accessibilityShowsLargeContentViewer).toBe(true)
      expect(tab.props.accessibilityLargeContentTitle).toBe(tab.props.accessibilityLabel)
    }
    expect(screen.getByText('Going').props.maxFontSizeMultiplier).toBe(CONTROL_FONT_CAP)
    expect(clipped(screen.toJSON())).toEqual([])
  })

  it('the DM (RC drive 2 D-3): the header’s reveal line stops at the control cap in its fixed capsule; the opener, Say hi and the nudge wrap at their caps', async () => {
    const face = { kind: 'creature', pseudonym: 'Tumbling Moose' } as never
    await render(
      <View>
        <ChatHeader
          title="Tumbling Moose"
          leading={<View />}
          subtitle={<RevealLine seen={false} text="You’re both anonymous here" />}
          onBack={jest.fn()}
          onMore={jest.fn()}
          moreLabel="More"
        />
        <MatchOpenerCard you={face} them={face} title="You both said yes." body="Say something about the night." />
        <SayHi line="Say hi to Tumbling Moose." onPress={jest.fn()} />
        <NudgeLine text="Tumbling Moose asked to know who you are" />
      </View>
    )
    expect(screen.getByText('You’re both anonymous here').props.maxFontSizeMultiplier).toBe(CONTROL_FONT_CAP)
    expect(screen.getByText('You both said yes.').props.maxFontSizeMultiplier).toBe(MAX_FONT_SCALE.heading)
    expect(screen.getByText('Say hi to Tumbling Moose.').props.numberOfLines).toBeUndefined()
    expect(clipped(screen.toJSON())).toEqual([])
    expect(uncapped(screen.toJSON())).toEqual([])
  })

  it('the DM’s reveal bar and a form field’s name stop at their caps (D-3, D-8: EMAIL drew at 3.571x over a 1.3x input; now its label cap)', async () => {
    await render(
      <View>
        <RevealBar you={{ name: 'Asha', face: { kind: 'creature', pseudonym: 'Tumbling Moose' } as never }} them={{ name: 'Tumbling Moose', face: { kind: 'creature', pseudonym: 'Tumbling Moose' } as never }} state="youOnly" />
        <TextField label="EMAIL" value="" onChangeText={jest.fn()} />
      </View>
    )
    expect(screen.getByText('EMAIL').props.maxFontSizeMultiplier).toBe(MAX_FONT_SCALE.label)
    expect(uncapped(screen.toJSON())).toEqual([])
  })

  it('every composer’s typed text stops at its cap (RC drive 3 D-B: "draft for eli only" drew at 53 pt): the chat bar at the control cap, the Board’s post at the body cap', async () => {
    // The DM, the room and a crew or Blend room are one Composer; the Board writes in a TextArea.
    await render(
      <View>
        <Composer value={'x'.repeat(950)} onChangeText={jest.fn()} onSend={jest.fn()} testID="c" />
        <Composer value="" onChangeText={jest.fn()} onSend={jest.fn()} state="ratelimited" countdown="0:12" />
        <Composer value="" onChangeText={jest.fn()} onSend={jest.fn()} state="failed" onRetry={jest.fn()} />
        <TextArea label="Your post" value="Driving over at 8" onChangeText={jest.fn()} limit={500} />
      </View>
    )
    for (const field of screen.getAllByLabelText('Message')) expect(field.props.maxFontSizeMultiplier).toBe(CONTROL_FONT_CAP)
    expect(screen.getByLabelText('Your post').props.maxFontSizeMultiplier).toBe(MAX_FONT_SCALE.body)
    expect(screen.getByText('50 left').props.maxFontSizeMultiplier).toBe(MAX_FONT_SCALE.caption)
    expect(uncapped(screen.toJSON())).toEqual([])
  })

  it('the sign-up dock: the Terms line stops at the caption cap (D-C: five lines of 36 pt, most of the screen)', async () => {
    await render(<LegalLine lead="By creating an account you" />)
    expect(screen.getByText(/By creating an account you/).props.maxFontSizeMultiplier).toBe(MAX_FONT_SCALE.caption)
    expect(uncapped(screen.toJSON())).toEqual([])
  })

  it('a form page at rest: the dock is in the flow under the scroll, so the scroll’s bottom inset is the dock’s whole height and the last field scrolls clear of it (D-C)', async () => {
    await render(
      <KeyboardPage dock={<LegalLine lead="By creating an account you" />} dockProps={{ glass: false, keyboardUp: false, testID: 'dock' }} scrollProps={{ testID: 'scroll' }}>
        <TextField label="AGE" value="" onChangeText={jest.fn()} />
      </KeyboardPage>
    )
    const scroll = screen.getByTestId('scroll')
    const frame = screen.getByTestId('keyboard-page-dock-frame')
    // One column, the scroll then the dock: the scroll's frame ends where the dock begins.
    const column = frame.parent as NonNullable<typeof frame.parent>
    expect(column).toContainElement(scroll)
    expect(column.children[column.children.length - 1]).toBe(frame)
    expect(StyleSheet.flatten(column.props.style).flexDirection ?? 'column').toBe('column')
    for (const box of [frame, screen.getByTestId('dock')]) expect(StyleSheet.flatten(box.props.style)?.position).not.toBe('absolute')
    expect(StyleSheet.flatten(scroll.props.style).flex).toBe(1)
  })

  it('a Settings switch row stacks: the text at the card’s width, the switch under it; the title and hint at their caps (D-D)', async () => {
    const hint = 'On: friends at the same event see you under Friends here, with your name and photo, and can message you.'
    await render(
      <SettingsGroup title="PRIVACY" testID="g">
        <SettingsRow icon="users" title="Friends can see I’m here" hint={hint} trail="switch" value={false} onValueChange={jest.fn()} busy testID="row" />
        <SettingsRow icon="users" title="Show me online" trail="switch" value onValueChange={jest.fn()} testID="row2" />
      </SettingsGroup>
    )
    const row = StyleSheet.flatten(screen.getByTestId('row').props.style)
    expect(row.flexDirection).toBe('column')
    expect(StyleSheet.flatten(screen.getByTestId('row-text').props.style)).toMatchObject({ alignSelf: 'stretch' })
    expect(StyleSheet.flatten(screen.getByTestId('row-text').props.style).flex).toBeUndefined()
    // The spinner stays beside the switch, in one trail under the text.
    const hidden = { includeHiddenElements: true }
    expect(screen.getByTestId('row-trail', hidden)).toContainElement(screen.getByTestId('row-spinner', hidden))
    expect(screen.getByTestId('row-trail', hidden)).toContainElement(screen.getByTestId('row-toggle', hidden))
    expect(screen.getByText('Friends can see I’m here').props.maxFontSizeMultiplier).toBe(MAX_FONT_SCALE.bodyStrong)
    expect(screen.getByText(hint).props.maxFontSizeMultiplier).toBe(MAX_FONT_SCALE.meta)
    // The hairline starts at the stacked text's edge, not past a glyph that is now above it.
    expect(StyleSheet.flatten(screen.getByTestId('g-hairline', hidden).props.style).marginLeft).toBe(SPACE.lg)
    expect(uncapped(screen.toJSON())).toEqual([])
  })

  it('a confirm Sheet keeps its actions on screen (RC drive 3 D-E: "Sign out?" pushed Cancel and Sign out off it): the title, body and content scroll as one, the actions are pinned under the scroll, and the title and body stop at their caps', async () => {
    const title = 'Sign out of Blendn on this phone and every other one?'
    const body = 'You’ll need to sign in again to see your events, friends and messages. Drafts on this phone are kept until you sign in again.'
    const hidden = { includeHiddenElements: true }
    await render(
      <Sheet
        visible
        onClose={jest.fn()}
        icon="log-out"
        title={title}
        body={body}
        actions={[
          { label: 'Cancel', kind: 'tertiary', onPress: jest.fn() },
          { label: 'Sign out', kind: 'destructive', onPress: jest.fn() },
        ]}
        testID="s"
      >
        <Text>Your crews stay yours.</Text>
      </Sheet>
    )
    const scroll = screen.getByTestId('s-content', hidden)
    expect(scroll.type).toBe('RCTScrollView')
    // The header is inside the scroll, with the content.
    for (const text of [title, body, 'Your crews stay yours.']) expect(within(scroll).getByText(text, hidden)).toBeTruthy()
    // Both actions are rendered, outside the scroll, after it: the scroll shrinks under the cap, they never do.
    for (const label of ['Cancel', 'Sign out']) {
      expect(screen.getByText(label, hidden)).toBeTruthy()
      expect(within(scroll).queryByText(label, hidden)).toBeNull()
    }
    expect(StyleSheet.flatten(scroll.props.style)).toMatchObject({ flexShrink: 1 })
    expect(screen.getByText(title, hidden).props.maxFontSizeMultiplier).toBe(MAX_FONT_SCALE.title)
    expect(screen.getByText(body, hidden).props.maxFontSizeMultiplier).toBe(MAX_FONT_SCALE.body)
    // Taller than the cap: it scrolls; the grip still drags (dsSheet pins the header's pull from the top).
    await act(async () => fireEvent(scroll, 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 393, height: 500 } } }))
    await act(async () => fireEvent(scroll, 'contentSizeChange', 393, 1400))
    expect(screen.getByTestId('s-content', hidden).props.scrollEnabled).toBe(true)
    expect(getByGestureTestId('s-drag').config.enabled).toBe(true)
  })

  it('a Sheet that fits does not scroll, so dragging its header still moves the sheet', async () => {
    await render(<Sheet visible onClose={jest.fn()} title="Sign out?" actions={[{ label: 'Sign out', onPress: jest.fn() }]} testID="s" />)
    const scroll = screen.getByTestId('s-content', { includeHiddenElements: true })
    await act(async () => fireEvent(scroll, 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 393, height: 200 } } }))
    await act(async () => fireEvent(scroll, 'contentSizeChange', 393, 200))
    expect(screen.getByTestId('s-content', { includeHiddenElements: true }).props.scrollEnabled).toBe(false)
    expect(getByGestureTestId('s-head-drag').config.enabled).toBe(true)
  })

  it('Going’s empty and failed states scroll, so the action is never under the tab bar', () => {
    const src = readFileSync(join(__dirname, '..', 'app', '(tabs)', 'going.tsx'), 'utf8')
    for (const id of ['going-empty', 'going-failed']) {
      const at = src.indexOf(`testID="${id}"`)
      const opened = src.lastIndexOf('<ScrollView style={styles.stateScroll}', at)
      expect(opened).toBeGreaterThan(src.lastIndexOf('<StateScreen', at) - 200)
      expect(src.indexOf('</ScrollView>', at)).toBeGreaterThan(at)
    }
  })
})

describe('a 360 dp phone at font scale 1.3 (Android, RC drive 3: text one word per line beside a trailing piece)', () => {
  const at360 = () => act(async () => Dimensions.set({ window: { ...window, width: 360, fontScale: 1.3 }, screen: { ...window, width: 360, fontScale: 1.3 } }))
  const hidden = { includeHiddenElements: true }
  const flat = (id: string) => StyleSheet.flatten(screen.getByTestId(id, hidden).props.style)
  beforeEach(at360)

  it('the room’s anonymity banner: the sentence keeps six ems of measure, and Show who I am wraps under it rather than squeeze it ("You’re / anony / mous")', async () => {
    await render(<VisibilityBanner state="anon" onAction={jest.fn()} testID="b" />)
    const body = screen.getByTestId('b-body', hidden)
    expect(StyleSheet.flatten(body.props.style)).toMatchObject({ flexDirection: 'row', flexWrap: 'wrap' })
    // The sentence's basis is its measure at the scale it is drawn (6 em of meta at 1.3), never zero; it grows into the rest.
    expect(flat('b-text')).toMatchObject({ flexBasis: Math.round(6 * 14 * 1.3), flexGrow: 1 })
    // And as a minimum: the sentence is the body's one child that grows and shrinks (the action never shrinks), so Yoga's
    // single-flex-child shortcut sets its basis to 0 on a device and the basis alone never broke the line (RC drive 5).
    expect(flat('b-text').minWidth).toBe(Math.round(6 * 14 * 1.3))
    expect(flat('b-slot')?.flexShrink).toBeUndefined()
    expect(flat('b-text').flex).toBeUndefined()
    // The action is in that wrapping row, not a fixed column beside it.
    expect(body).toContainElement(screen.getByTestId('b-action', hidden))
  })

  it('Friends’ Make a crew row: the title keeps its measure, and "from your friends" wraps under it ("Make / a / crew")', async () => {
    await render(
      <SettingsGroup>
        <MakeCrewRow />
      </SettingsGroup>
    )
    const body = screen.getByTestId('make-crew-row-body', hidden)
    expect(StyleSheet.flatten(body.props.style)).toMatchObject({ flexDirection: 'row', flexWrap: 'wrap' })
    expect(flat('make-crew-row-text')).toMatchObject({ flexBasis: Math.round(6 * 17 * 1.3), minWidth: Math.round(6 * 17 * 1.3), flexGrow: 1 })
    expect(flat('make-crew-row-text').flex).toBeUndefined()
    expect(body).toContainElement(screen.getByTestId('make-crew-row-accessory', hidden))
    expect(flat('make-crew-row-accessory').flexShrink).toBe(1)
  })

  it('a row with no accessory is laid out as before: the text fills, no wrapping row', async () => {
    await render(<SettingsRow icon="bell" title="Notifications" trail="chevron" onPress={jest.fn()} testID="n" />)
    expect(screen.queryByTestId('n-body', hidden)).toBeNull()
    expect(flat('n-text').flex).toBe(1)
  })
})

describe('the Banner: as it was beside its action, hung from the first line once the action is under (review L9, R6)', () => {
  const at = (width: number, fontScale: number) => act(async () => Dimensions.set({ window: { ...window, width, fontScale }, screen: { ...window, width, fontScale } }))
  const hidden = { includeHiddenElements: true }
  const flat = (id: string) => StyleSheet.flatten(screen.getByTestId(id, hidden).props.style) ?? {}
  const lay = (id: string, layout: { y: number; height: number }) =>
    act(async () => fireEvent(screen.getByTestId(id, hidden), 'layout', { nativeEvent: { layout: { x: 0, width: 200, ...layout } } }))

  it('1x, a two-line sentence beside its action: the old layout exactly (all centred, nothing offset)', async () => {
    await at(390, 1)
    await render(<VisibilityBanner state="anon" onAction={jest.fn()} testID="b" />)
    await lay('b-text', { y: 0, height: 40 })
    await lay('b-slot', { y: 2, height: 36 })
    expect(flat('b').alignItems).toBe('center')
    expect(flat('b-body').alignItems).toBe('center')
    for (const id of ['b-glyph', 'b-text', 'b-slot']) expect(flat(id).marginTop).toBeUndefined()
    expect(flat('b-glyph').height).toBeUndefined()
  })

  it('the action wrapped under the sentence by the measure (360 dp at 1.3): the glyph sits on the first line', async () => {
    await at(360, 1.3)
    await render(<VisibilityBanner state="anon" onAction={jest.fn()} testID="b" />)
    await lay('b-text', { y: 0, height: 52 })
    await lay('b-slot', { y: 64, height: 36 })
    expect(flat('b').alignItems).toBe('flex-start')
    expect(flat('b-body').alignItems).toBe('flex-start')
    expect(flat('b-glyph').height).toBeCloseTo(20 * 1.3)
  })

  it('past 1.3x the action is under it from the start, and the glyph on the first line', async () => {
    await at(390, AX_XXXL)
    await render(<VisibilityBanner state="anon" onAction={jest.fn()} testID="b" />)
    expect(flat('b').alignItems).toBe('flex-start')
    expect(flat('b-glyph').height).toBeCloseTo(20 * AX_XXXL)
    expect(flat('b-text').marginTop).toBeUndefined()
  })

  it('with no action it is centred, as it was', async () => {
    await at(390, 1)
    const { Banner } = jest.requireActual('../components/ds/Banner')
    await render(<Banner kind="offline" text="You’re offline." testID="o" />)
    expect(flat('o').alignItems).toBe('center')
  })
})

describe('an ordinary phone at an ordinary size keeps text and its trailing piece side by side (review MEDIUM-4)', () => {
  it('a field label and its counter stay on one row below the AX sizes', async () => {
    await act(async () => Dimensions.set({ window: { ...window, fontScale: 1 }, screen: { ...window, fontScale: 1 } }))
    await render(<TextArea label="A line about the crew" value="" onChangeText={() => {}} limit={140} testID="bio" />)
    expect(StyleSheet.flatten(screen.getByTestId('bio-label-row').props.style).flexDirection).toBe('row')
  })

  const at = (width: number, fontScale: number) => act(async () => Dimensions.set({ window: { ...window, width, fontScale }, screen: { ...window, width, fontScale } }))
  const hidden = { includeHiddenElements: true }
  const basis = (id: string) => StyleSheet.flatten(screen.getByTestId(id, hidden).props.style).flexBasis
  const crewRow = () => (
    <SettingsGroup>
      <MakeCrewRow />
    </SettingsGroup>
  )

  it('390 dp at 1.0: no measure, so nothing wraps (six ems left ~5 pt to spare there)', async () => {
    await at(390, 1)
    await render(crewRow())
    expect(basis('make-crew-row-text')).toBe(0)
    await render(<VisibilityBanner state="anon" onAction={jest.fn()} testID="b" />)
    expect(basis('b-text')).toBe(0)
    expect(StyleSheet.flatten(screen.getByTestId('b-text', hidden).props.style).minWidth).toBe(0)
  })

  it('390 dp at 1.0 with Bold Text: still no measure (the wider bold words did not push "from your friends" under)', async () => {
    // Swapped, not spied: the preset's own mock has no implementation to restore to.
    const original = AccessibilityInfo.isBoldTextEnabled
    AccessibilityInfo.isBoldTextEnabled = () => Promise.resolve(true)
    try {
      await at(390, 1)
      await render(crewRow())
      await act(async () => {})
      expect(StyleSheet.flatten(screen.getByText('Make a crew').props.style).fontFamily).toMatch(/Bold|700/)
      expect(basis('make-crew-row-text')).toBe(0)
    } finally {
      AccessibilityInfo.isBoldTextEnabled = original
    }
  })

  it('375 dp at 1.0 (an iPhone SE or mini) takes the measure: the threshold is exclusive (review R7)', async () => {
    await at(375, 1)
    await render(crewRow())
    expect(basis('make-crew-row-text')).toBe(6 * 17)
    await at(376, 1)
    await render(crewRow())
    expect(basis('make-crew-row-text')).toBe(0)
  })

  it('360 dp at 1.3, and a narrow phone at 1.0, take the measure', async () => {
    await at(360, 1.3)
    await render(crewRow())
    expect(basis('make-crew-row-text')).toBe(Math.round(6 * 17 * 1.3))
    await at(360, 1)
    await render(crewRow())
    expect(basis('make-crew-row-text')).toBe(6 * 17)
  })
})

describe('below the accessibility sizes', () => {
  it('a Settings switch row stays side by side (fontScale 1.35, iOS xxxLarge)', async () => {
    await atScale(1.35)
    await render(<SettingsRow icon="users" title="Friends can see I’m here" trail="switch" value={false} onValueChange={jest.fn()} testID="row" />)
    expect(StyleSheet.flatten(screen.getByTestId('row').props.style).flexDirection).toBe('row')
    expect(StyleSheet.flatten(screen.getByTestId('row-text').props.style).flex).toBe(1)
  })
})

describe('a live change of the text size (React Native does not re-measure mounted text)', () => {
  it('remounts what a TextSizeBoundary holds when fontScale changes, and only then', async () => {
    let mounts = 0
    const Probe = () => {
      useEffect(() => {
        mounts += 1
      }, [])
      return <Text>probe</Text>
    }
    await atScale(1)
    await render(
      <View>
        <TextSizeBoundary>
          <Probe />
        </TextSizeBoundary>
      </View>
    )
    expect(mounts).toBe(1)
    await atScale(1)
    expect(mounts).toBe(1)
    await atScale(AX_XXXL)
    expect(mounts).toBe(2)
  })

  it('on Android it holds still: the Activity relaunch lays out afresh, and the old tree is not remounted (RC drive 2 D-1)', async () => {
    Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true })
    try {
      let mounts = 0
      const Probe = () => {
        useEffect(() => {
          mounts += 1
        }, [])
        return <Text>probe</Text>
      }
      await atScale(1)
      await render(
        <TextSizeBoundary>
          <Probe />
        </TextSizeBoundary>
      )
      await atScale(1.3)
      expect(mounts).toBe(1)
    } finally {
      Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true })
    }
  })

  it('every navigator carries it on its screens, and the root skips exactly the routes that are navigators', () => {
    const app = join(__dirname, '..', 'app')
    const nested = readdirSync(app, { withFileTypes: true })
      .filter((d) => d.isDirectory() && existsSync(join(app, d.name, '_layout.tsx')))
      .map((d) => d.name)
    expect([...nested].sort()).toEqual([...NAVIGATOR_ROUTES].sort())
    for (const dir of nested) expect(readFileSync(join(app, dir, '_layout.tsx'), 'utf8')).toMatch(/screenLayout=\{textSizeLayout\}/)
    const root = readFileSync(join(app, '_layout.tsx'), 'utf8')
    expect(root).toMatch(/screenLayout=\{rootTextSizeLayout\}/)
    // The tab bar is no screen: it carries its own.
    expect(readFileSync(join(app, '(tabs)', '_layout.tsx'), 'utf8')).toMatch(/<TextSizeBoundary>\s*<BlendnTabBar/)
  })
})

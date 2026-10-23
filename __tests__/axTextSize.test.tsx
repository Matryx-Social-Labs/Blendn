/**
 * RC drive D2: the accessibility text sizes (AX XXXL, fontScale 3.1) on the screens the drive caught, and a live change of
 * the text size.
 *
 * The rule (`AX_FONT_SCALE`, components/ds/shared.ts): reading text grows to its cap and wraps; nothing that grows sits in a
 * box of fixed height; controls and tab labels stop at CONTROL_FONT_CAP.
 */
import { act, render, screen } from '@testing-library/react-native'
import { readFileSync, readdirSync, existsSync } from 'fs'
import { join } from 'path'
import React, { useEffect } from 'react'
import { Dimensions, Platform, StyleSheet, Text, View } from 'react-native'
import type { ReactTestRendererJSON } from 'react-test-renderer'

jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default)
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
/* eslint-enable import/first */

/** iOS AX XXXL: body 53 pt over 17. */
const AX_XXXL = 3.1
const window = Dimensions.get('window')
const atScale = (fontScale: number) => act(async () => Dimensions.set({ window: { ...window, fontScale }, screen: { ...window, fontScale } }))
afterEach(() => Dimensions.set({ window: { ...window, fontScale: 2 }, screen: { ...window, fontScale: 2 } }))

type Node = ReactTestRendererJSON
const kids = (n: Node): Node[] => (n.children ?? []).filter((c): c is Node => typeof c === 'object')

/**
 * Every Text the scale reaches (no cap, or a cap above CONTROL_FONT_CAP) that sits inside a box of fixed `height`: at
 * AX XXXL its glyphs outgrow the box and are sliced. A `minHeight` grows; a `height` does not.
 */
function clipped(tree: Node | Node[] | null): string[] {
  const found: string[] = []
  const walk = (n: Node, fixed: boolean) => {
    const style = StyleSheet.flatten(n.props.style as never) as { height?: unknown } | undefined
    const boxed = fixed || typeof style?.height === 'number'
    if (n.type === 'Text') {
      const cap = n.props.maxFontSizeMultiplier as number | undefined
      const grows = cap === undefined || cap === 0 || cap > CONTROL_FONT_CAP
      if (boxed && grows) found.push(JSON.stringify(n.children))
      return
    }
    kids(n).forEach((c) => walk(c, boxed))
  }
  ;(Array.isArray(tree) ? tree : tree ? [tree] : []).forEach((n) => walk(n, false))
  return found
}

/** Every Text with no cap at all: at AX XXXL it draws at 3.1x, past every role's MAX_FONT_SCALE. */
function uncapped(tree: Node | Node[] | null): string[] {
  const found: string[] = []
  const walk = (n: Node) => {
    if (n.type === 'Text') {
      if (!n.props.maxFontSizeMultiplier) found.push(JSON.stringify(n.children))
      return
    }
    kids(n).forEach(walk)
  }
  ;(Array.isArray(tree) ? tree : tree ? [tree] : []).forEach(walk)
  return found
}

/** Reading text clamped to a single line at AX sizes: a word and an ellipsis ("Finish your pro…"). */
function oneLiners(tree: Node | Node[] | null, ignoreCapped = true): string[] {
  const found: string[] = []
  const walk = (n: Node) => {
    if (n.type === 'Text') {
      const cap = n.props.maxFontSizeMultiplier as number | undefined
      if (ignoreCapped && cap !== undefined && cap <= CONTROL_FONT_CAP) return
      if (n.props.numberOfLines === 1) found.push(JSON.stringify(n.children))
      return
    }
    kids(n).forEach(walk)
  }
  ;(Array.isArray(tree) ? tree : tree ? [tree] : []).forEach(walk)
  return found
}

describe('at AX XXXL (fontScale 3.1)', () => {
  beforeEach(() => atScale(AX_XXXL))

  it('is past AX_FONT_SCALE, and the jest scale is what the components read', () => {
    expect(AX_XXXL).toBeGreaterThan(AX_FONT_SCALE)
    expect(Dimensions.get('window').fontScale).toBe(AX_XXXL)
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

  it('the DM’s reveal bar and a form field’s name stop at their caps (D-3, D-8: EMAIL drew at 3.1x over a 1.3x input; now its label cap)', async () => {
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

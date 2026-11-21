/**
 * Your own face, wherever the app draws it, follows `personFace` (Banter C5, owner D1 A): you are named, so with no photo it
 * is your initial on your hue disc, never a glyph and never a creature. The owner, 2026-11-17: "why does the me screen show old
 * glyphs still if they have no uploaded a picture yet?" — the empty card on Me drew Flow 6's cat.
 *
 * Avatar and Icon are stubbed to say what they were asked to draw, so each case reads the kind of face, not pixels.
 */
import { AppState } from 'react-native'
import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import { render, screen } from '@testing-library/react-native'
import React from 'react'

import { MeIdentity } from '../components/profile/MeSections'
import { TabBar } from '../components/ds/TabBar'
import { InviteLinkCard } from '../components/friends/InviteLinkCard'
import { InviteQr } from '../components/friends/InviteQr'

jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default)
jest.mock('expo-glass-effect', () => {
  const { View } = jest.requireActual('react-native')
  return { GlassView: (props: object) => <View {...props} />, isGlassEffectAPIAvailable: jest.fn(() => true), isLiquidGlassAvailable: jest.fn(() => true) }
})
jest.mock('expo-blur', () => {
  const { View } = jest.requireActual('react-native')
  return { BlurView: (props: object) => <View {...props} /> }
})
jest.mock('../components/OptimizedImage', () => ({ OptimizedImage: () => null }))
jest.mock('../components/ds/Avatar', () => {
  const { Text, View } = jest.requireActual('react-native')
  return {
    Avatar: (p: { kind: string; name?: string; pseudonym?: string; uri?: string; testID?: string }) => (
      <View testID={p.testID ?? `avatar-${p.kind}`}>
        <Text>{`${p.kind}:${p.uri ?? p.name ?? p.pseudonym}`}</Text>
      </View>
    ),
  }
})
jest.mock('../components/ui/Icon', () => {
  const { View } = jest.requireActual('react-native')
  return { Icon: (p: { name: string }) => <View testID={`icon-${p.name}`} /> }
})

const all = { includeHiddenElements: true }
const drew = (text: string) => screen.queryByText(text, all) !== null

describe('the main photo on Me with none (Me + settings A 01)', () => {
  it('is your initial on your hue disc, never the cat, and a tap adds a photo', async () => {
    await render(<MeIdentity name="Audit Host 06" onEdit={jest.fn()} onPhoto={jest.fn()} />)
    expect(drew('initial:Audit Host 06')).toBe(true)
    expect(screen.queryByTestId('icon-cat', all)).toBeNull()
    expect(screen.getByTestId('me-photo', all).props.accessibilityLabel).toBe('Add a photo')
  })

  it('with a photo it is the photo (the control)', async () => {
    await render(<MeIdentity name="Audit Host 06" photo="https://cdn/a.jpg" onEdit={jest.fn()} onPhoto={jest.fn()} />)
    expect(drew('initial:Audit Host 06')).toBe(false)
  })
})

describe('Me in the tab bar', () => {
  const IDLE = { state: 'idle', eventId: null, badge: 0 } as const
  const bar = (p: { mePhoto?: string; meName?: string }) => (
    <TabBar selected="me" onSelect={jest.fn()} disc={{ target: IDLE, onPress: jest.fn() }} testID="tabs" {...p} />
  )
  beforeEach(() => {
    jest.spyOn(AppState, 'addEventListener').mockImplementation((() => ({ remove: jest.fn() })) as never)
  })
  afterEach(() => jest.restoreAllMocks())

  it('with no photo, your initial, not the person glyph', async () => {
    await render(bar({ meName: 'Audit Host 06' }))
    expect(screen.getByTestId('tabs-me-initial', all)).toBeTruthy()
    expect(drew('initial:Audit Host 06')).toBe(true)
    expect(screen.queryByTestId('icon-circle-user-round', all)).toBeNull()
  })

  it('with a photo, the photo (the control)', async () => {
    await render(bar({ mePhoto: 'https://x/me.jpg', meName: 'Audit Host 06' }))
    expect(screen.getByTestId('tabs-me-avatar', all)).toBeTruthy()
    expect(screen.queryByTestId('tabs-me-initial', all)).toBeNull()
  })

  it('before your name is known, the glyph: there is nobody to draw yet', async () => {
    await render(bar({}))
    expect(screen.getByTestId('icon-circle-user-round', all)).toBeTruthy()
  })
})

describe('your invite card and its QR code', () => {
  it('the link side: your initial, never a creature', async () => {
    await render(<InviteLinkCard url="https://www.blendn.app/f/x" name="Audit Host 06" photo={null} />)
    expect(drew('initial:Audit Host 06')).toBe(true)
    expect(screen.queryByTestId('avatar-creature', all)).toBeNull()
  })

  it('the QR side: the same', async () => {
    await render(<InviteQr url="https://www.blendn.app/f/x" size={240} face={{ name: 'Audit Host 06', photo: null, size: 56 }} />)
    expect(drew('initial:Audit Host 06')).toBe(true)
    expect(screen.queryByTestId('avatar-creature', all)).toBeNull()
  })

  it('with a photo, the photo (the control)', async () => {
    await render(<InviteLinkCard url="https://www.blendn.app/f/x" name="Audit Host 06" photo="https://x/me.jpg" />)
    expect(drew('photo:https://x/me.jpg')).toBe(true)
  })
})

/** The cat was the last glyph standing in for a person. A face is `personFace`'s, so the glyph never comes back as one. */
describe('no glyph stands in for a person', () => {
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((f) => {
      const p = join(dir, f)
      return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(f) ? [p] : []
    })
  const ROOT = join(__dirname, '..')
  const sources = ['app', 'components'].flatMap((d) => files(join(ROOT, d))).filter((p) => !p.includes(`${join('app', 'preview')}`))

  it('nothing draws the cat icon', () => {
    const hits = sources.filter((p) => /<Icon\s+name=["']cat["']/.test(readFileSync(p, 'utf8')))
    expect(hits).toEqual([])
  })

  it('the cat glyph is gone from the icon set, so no face can fall back to it', () => {
    const icons = readFileSync(join(ROOT, 'components', 'ui', 'Icon.tsx'), 'utf8')
    expect(icons).not.toMatch(/icons\/cat'|^\s*cat:/m)
  })

  it('the guard reads real sources (the control)', () => {
    expect(sources.some((p) => p.endsWith(join('components', 'profile', 'MeSections.tsx')))).toBe(true)
  })
})

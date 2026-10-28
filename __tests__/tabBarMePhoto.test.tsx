/*
 * The Me tab shows your photo (BAR-01). The photo comes from the session shape `GET /auth/session` sends (`profile.photos`, the
 * profile nested, NOT a top-level `photos`), so the fixture is that shape; never `user.image`, the OAuth avatar.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import React from 'react'
import { AppState } from 'react-native'

import { TabBar } from '../components/ds/TabBar'
import { COLOR } from '../lib/design/tokens'
import { myMainPhoto } from '../lib/myPhoto'

jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default)
jest.mock('expo-glass-effect', () => {
  const { View } = jest.requireActual('react-native')
  return { GlassView: (props: object) => <View {...props} />, isGlassEffectAPIAvailable: jest.fn(() => true), isLiquidGlassAvailable: jest.fn(() => true) }
})
jest.mock('expo-image', () => {
  const { View } = jest.requireActual('react-native')
  return { Image: (props: object) => <View testID="face" {...props} /> }
})
jest.mock('expo-blur', () => {
  const { View } = jest.requireActual('react-native')
  return { BlurView: (props: object) => <View {...props} /> }
})

const IDLE = { state: 'idle', eventId: null, badge: 0 } as const
const session = (photos: string[]) => ({ image: 'https://oauth.example/avatar.jpg', profile: { photos } })

const Bar = ({ user, selected = 'pulse' }: { user: ReturnType<typeof session>; selected?: 'pulse' | 'me' }) => (
  <TabBar selected={selected} onSelect={jest.fn()} disc={{ target: IDLE, onPress: jest.fn() }} mePhoto={myMainPhoto(user) ?? undefined} testID="tabs" />
)

describe('Me tab photo', () => {
  beforeEach(() => {
    jest.spyOn(AppState, 'addEventListener').mockImplementation((() => ({ remove: jest.fn() })) as never)
  })
  afterEach(() => jest.restoreAllMocks())

  it('draws the session profile photo', async () => {
    await render(<Bar user={session(['https://x/a.jpg'])} />)
    expect(screen.getByTestId('tabs-me-avatar', { includeHiddenElements: true })).toBeTruthy()
    expect(screen.getByTestId('face', { includeHiddenElements: true }).props.source).toEqual({ uri: 'https://x/a.jpg' })
  })

  it('follows a changed main photo', async () => {
    const view = await render(<Bar user={session(['https://x/a.jpg'])} />)
    await view.rerender(<Bar user={session(['https://x/b.jpg', 'https://x/a.jpg'])} />)
    expect(screen.getByTestId('face', { includeHiddenElements: true }).props.source).toEqual({ uri: 'https://x/b.jpg' })
  })

  it('with no photo it is the glyph, never the OAuth image', async () => {
    await render(<Bar user={session([])} />)
    expect(screen.queryByTestId('tabs-me-avatar', { includeHiddenElements: true })).toBeNull()
    expect(screen.queryByTestId('face', { includeHiddenElements: true })).toBeNull()
  })

  it('a photo that fails to load falls back to the glyph, and a new URL gets its try', async () => {
    const view = await render(<Bar user={session(['https://x/dead.jpg'])} />)
    await fireEvent(screen.getByTestId('face', { includeHiddenElements: true }), 'error')
    expect(screen.queryByTestId('tabs-me-avatar', { includeHiddenElements: true })).toBeNull()
    await view.rerender(<Bar user={session(['https://x/new.jpg'])} />)
    expect(screen.getByTestId('face', { includeHiddenElements: true }).props.source).toEqual({ uri: 'https://x/new.jpg' })
  })

  it('a dead URL is tried again when the app comes back to the front (L5)', async () => {
    let onChange: (s: string) => void = () => {}
    const spy = jest.spyOn(AppState, 'addEventListener').mockImplementation(((_: string, fn: (s: string) => void) => {
      onChange = fn
      return { remove: jest.fn() }
    }) as never)
    await render(<Bar user={session(['https://x/dead.jpg'])} />)
    await fireEvent(screen.getByTestId('face', { includeHiddenElements: true }), 'error')
    expect(screen.queryByTestId('face', { includeHiddenElements: true })).toBeNull()
    await act(async () => onChange('active'))
    expect(screen.getByTestId('face', { includeHiddenElements: true }).props.source).toEqual({ uri: 'https://x/dead.jpg' })
    spy.mockRestore()
  })

  it('is ringed white when selected', async () => {
    await render(<Bar user={session(['https://x/a.jpg'])} selected="me" />)
    const ring = screen.getByTestId('tabs-me-avatar-ring', { includeHiddenElements: true })
    expect(ring.props.style).toEqual(expect.arrayContaining([expect.objectContaining({ backgroundColor: COLOR.textPrimary })]))
  })
})

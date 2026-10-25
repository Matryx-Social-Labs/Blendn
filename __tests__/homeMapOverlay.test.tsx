/*
 * What sits over the home map: "my location" (SCRUM-667, placeholder look),
 * riding the drawer, and the map's corner credit, which replaced MapLibre's
 * (i) button (the owner, 2026-10-15).
 */
import React from 'react'
import { AccessibilityInfo } from 'react-native'
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import { makeMutable } from 'react-native-reanimated'

// The credit shares the map's Reduce Motion hook, which lives beside the map's native layers.
jest.mock('@maplibre/maplibre-react-native', () => ({}))

// eslint-disable-next-line import/first
import { LocateButton } from '../components/home/LocateButton'
// eslint-disable-next-line import/first
import { MapCredit } from '../components/home/MapCredit'
// eslint-disable-next-line import/first
import { MAP_THEME } from '../lib/mapTheme'

const drawer = { half: 420, full: 120 }

describe('LocateButton', () => {
  const button = (over: Partial<React.ComponentProps<typeof LocateButton>> = {}) => (
    <LocateButton visible following pending={false} drawerTop={makeMutable(drawer.half)} drawer={drawer} onPress={jest.fn()} {...over} />
  )

  it('is a button a screen reader calls "Show my location", at least 44 pt, that does what it says', async () => {
    const onPress = jest.fn()
    await render(button({ onPress }))
    const target = screen.getByRole('button', { name: 'Show my location' })
    expect(MAP_THEME.locate.sizePx).toBeGreaterThanOrEqual(44)
    expect(target).toHaveStyle({ width: MAP_THEME.locate.sizePx, height: MAP_THEME.locate.sizePx })
    fireEvent.press(target)
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('says whether the map is following you', async () => {
    await render(button())
    expect(screen.getByRole('button', { name: 'Show my location' })).toBeSelected()
    await render(button({ following: false }))
    expect(screen.getByRole('button', { name: 'Show my location' })).not.toBeSelected()
  })

  it('says it is waiting while it asks for a fix, and takes no second tap (review L7)', async () => {
    const onPress = jest.fn()
    await render(button({ pending: true, onPress }))
    const target = screen.getByRole('button', { name: 'Show my location' })
    expect(target).toBeBusy()
    fireEvent.press(target)
    expect(onPress).not.toHaveBeenCalled()
  })

  it('stays drawn while the drawer reaches full, but cannot be tapped or read there (review L3)', async () => {
    await render(button({ visible: false }))
    expect(screen.queryByRole('button', { name: 'Show my location' })).toBeNull()
    // Still mounted, so its fade finishes instead of popping out.
    expect(screen.getByRole('button', { name: 'Show my location', includeHiddenElements: true })).toBeTruthy()
  })
})

describe('MapCredit', () => {
  const text = 'OpenFreeMap · © OpenMapTiles · © OpenStreetMap contributors'
  const ours = `${text} · Overture Maps Foundation · Google Open Buildings · Microsoft`
  const seconds = async (ms: number) => {
    await act(async () => {
      jest.advanceTimersByTime(ms)
    })
  }
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => {
    jest.useRealTimers()
    jest.restoreAllMocks()
  })

  it('is there as the map opens, and gone after its few seconds', async () => {
    await render(<MapCredit text={text} top={100} gestures={0} />)
    expect(screen.getByText(text)).toBeTruthy()
    await seconds(MAP_THEME.credit.showForMs - 1)
    expect(screen.getByText(text)).toBeTruthy()
    await seconds(1)
    expect(screen.queryByText(text)).toBeNull()
    expect(MAP_THEME.credit.showForMs).toBe(5000)
  })

  it('goes on the next gesture', async () => {
    await render(<MapCredit text={text} top={100} gestures={0} />)
    await screen.rerender(<MapCredit text={text} top={100} gestures={1} />)
    expect(screen.queryByText(text)).toBeNull()
  })

  it('comes back when what it credits changes — our buildings after a pick — then goes again (review H1)', async () => {
    await render(<MapCredit text={text} top={100} gestures={0} />)
    await screen.rerender(<MapCredit text={text} top={100} gestures={3} />)
    expect(screen.queryByText(text)).toBeNull()
    // The pick draws our tiles: a new line, up again, though gestures happened before it.
    await screen.rerender(<MapCredit text={ours} top={100} gestures={3} />)
    expect(screen.getByText(ours)).toBeTruthy()
    await seconds(MAP_THEME.credit.showForMs)
    expect(screen.queryByText(ours)).toBeNull()
    // And on the next gesture after a fresh one.
    await screen.rerender(<MapCredit text={text} top={100} gestures={3} />)
    expect(screen.getByText(text)).toBeTruthy()
    await screen.rerender(<MapCredit text={text} top={100} gestures={4} />)
    expect(screen.queryByText(text)).toBeNull()
  })

  it('fades out, or with Reduce Motion simply goes', async () => {
    await render(<MapCredit text={text} top={100} gestures={0} />)
    expect(JSON.stringify(screen.toJSON())).toContain(`opacity ${MAP_THEME.credit.fadeMs}ms`)
    await screen.unmount()
    // Switched on mid-session: lib/motion follows the system's change (audit M1).
    let emit: (on: boolean) => void = () => {}
    jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation(((name: string, handler: (on: boolean) => void) => {
      if (name === 'reduceMotionChanged') emit = handler
      return { remove: () => {} }
    }) as never)
    await render(<MapCredit text={text} top={100} gestures={0} />)
    await act(async () => emit(true))
    expect(JSON.stringify(screen.toJSON())).not.toContain('ms ease-out')
    await act(async () => emit(false))
  })
})

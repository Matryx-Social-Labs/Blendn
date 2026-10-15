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
    <LocateButton visible following drawerTop={makeMutable(drawer.half)} drawer={drawer} onPress={jest.fn()} {...over} />
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

  it('is not there while the drawer is full', async () => {
    await render(button({ visible: false }))
    expect(screen.queryByRole('button', { name: 'Show my location' })).toBeNull()
  })
})

describe('MapCredit', () => {
  const text = 'OpenFreeMap · © OpenMapTiles · © OpenStreetMap contributors'
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => {
    jest.useRealTimers()
    jest.restoreAllMocks()
  })

  it('is there as the map opens, and gone after its few seconds', async () => {
    await render(<MapCredit text={text} top={100} dismissed={false} />)
    expect(screen.getByText(text)).toBeTruthy()
    await act(async () => {
      jest.advanceTimersByTime(MAP_THEME.credit.showForMs - 1)
    })
    expect(screen.getByText(text)).toBeTruthy()
    await act(async () => {
      jest.advanceTimersByTime(1)
    })
    expect(screen.queryByText(text)).toBeNull()
    expect(MAP_THEME.credit.showForMs).toBe(5000)
  })

  it('goes on the first gesture, and stays gone', async () => {
    await render(<MapCredit text={text} top={100} dismissed={false} />)
    await screen.rerender(<MapCredit text={text} top={100} dismissed />)
    expect(screen.queryByText(text)).toBeNull()
    // Back to following the fix is not a reason to show it again.
    await screen.rerender(<MapCredit text={text} top={100} dismissed={false} />)
    expect(screen.queryByText(text)).toBeNull()
  })

  it('fades out, or with Reduce Motion simply goes', async () => {
    await render(<MapCredit text={text} top={100} dismissed={false} />)
    const fades = JSON.stringify(screen.toJSON())
    expect(fades).toContain(`opacity ${MAP_THEME.credit.fadeMs}ms`)
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true)
    await render(<MapCredit text={text} top={100} dismissed={false} />)
    await act(async () => {})
    expect(JSON.stringify(screen.toJSON())).not.toContain('ms ease-out')
  })
})

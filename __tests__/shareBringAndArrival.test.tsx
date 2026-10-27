/*
 * "Bring someone?" (Flow 16 · 16.1) and "You were sent …" (Flow 16 · 16.7): the two small cards that put sharing and
 * arriving where the moment is.
 */
const mockAsyncGet = jest.fn()
const mockAsyncSet = jest.fn()
const mockReferrer = jest.fn()
const mockGetEvent = jest.fn()
const mockGetVenue = jest.fn()
const mockPush = jest.fn()
jest.mock('@react-native-async-storage/async-storage', () => ({ getItem: (...a: unknown[]) => mockAsyncGet(...a), setItem: (...a: unknown[]) => mockAsyncSet(...a) }))
jest.mock('expo-application', () => ({ getInstallReferrerAsync: () => mockReferrer() }))
jest.mock('../lib/apiClient', () => ({ apiClient: { getEvent: (...a: unknown[]) => mockGetEvent(...a), getVenue: (...a: unknown[]) => mockGetVenue(...a) } }))
jest.mock('../lib/logger', () => ({ Logger: { warn: jest.fn(), debug: jest.fn(), error: jest.fn(), info: jest.fn() } }))
jest.mock('expo-router', () => ({ router: { push: (...a: unknown[]) => mockPush(...a) } }))
jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default)
jest.mock('expo-glass-effect', () => {
  const { View } = jest.requireActual('react-native')
  return { GlassView: (props: object) => <View {...props} />, isGlassEffectAPIAvailable: jest.fn(() => true), isLiquidGlassAvailable: jest.fn(() => true) }
})
jest.mock('expo-linear-gradient', () => {
  const { View } = jest.requireActual('react-native')
  return { LinearGradient: (props: object) => <View {...props} /> }
})

import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react-native'
import React from 'react'
import { Platform, StyleSheet } from 'react-native'

import { ArrivalBanner } from '../components/share/ArrivalBanner'
import { BringSomeoneRow } from '../components/share/BringSomeoneRow'
import { PulseArrival } from '../components/share/PulseArrival'
import { ARRIVAL_SEEN_KEY, arrivalFromReferrer, lookUpArrival, useArrival } from '../lib/arrivalLink'
import { H } from '../lib/haptics'

const ID = '7f3a2c4e-91d0-4b8a-a1c2-0d5e6f7a8b9c'
const START = new Date(2026, 9, 4, 21, 0, 0).toISOString()
const EVENT = { id: ID, title: 'Neon Nights', startTime: START, venueName: 'Toit', city: 'Indiranagar', coverImageUrl: 'https://img/c.jpg', status: 'published', visibility: 'public' }

const on = (os: 'ios' | 'android') => Object.defineProperty(Platform, 'OS', { value: os, configurable: true })

let spies: jest.SpyInstance[]
beforeEach(() => {
  on('android')
  mockAsyncGet.mockReset().mockResolvedValue(null)
  mockAsyncSet.mockReset().mockResolvedValue(undefined)
  mockReferrer.mockReset().mockResolvedValue(`link=e/${ID}`)
  mockGetEvent.mockReset().mockResolvedValue({ success: true, data: EVENT })
  mockGetVenue.mockReset().mockResolvedValue({ success: true, data: { venue: { id: 'v1', name: 'Toit', venueTypeLabel: 'Brewery', city: 'Indiranagar' } } })
  mockPush.mockReset()
  spies = Object.keys(H).map((k) => jest.spyOn(H, k as keyof typeof H).mockImplementation(() => {}))
})
afterEach(() => spies.forEach((s) => s.mockRestore()))

describe('“Bring someone?”', () => {
  it('says why, and offers WhatsApp first and the tray after, each named for the event', async () => {
    await render(<BringSomeoneRow eventTitle="Neon Nights" onWhatsApp={jest.fn()} onShare={jest.fn()} testID="b" />)
    expect(screen.getByText('Bring someone?')).toBeTruthy()
    expect(screen.getByText('You’re going. Send the night on.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'WhatsApp, send Neon Nights' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Share Neon Nights' })).toBeTruthy()
  })

  it('WhatsApp plays H.primary on press-in and sends; the circle plays H.select and opens the tray', async () => {
    const onWhatsApp = jest.fn()
    const onShare = jest.fn()
    await render(<BringSomeoneRow eventTitle="Neon Nights" onWhatsApp={onWhatsApp} onShare={onShare} testID="b" />)
    await fireEvent(screen.getByRole('button', { name: 'WhatsApp, send Neon Nights' }), 'pressIn')
    expect(H.primary).toHaveBeenCalledTimes(1)
    await fireEvent.press(screen.getByRole('button', { name: 'WhatsApp, send Neon Nights' }))
    expect(onWhatsApp).toHaveBeenCalledTimes(1)
    await fireEvent.press(screen.getByRole('button', { name: 'Share Neon Nights' }))
    expect(H.select).toHaveBeenCalledTimes(1)
    expect(onShare).toHaveBeenCalledTimes(1)
  })

  it('centres the small button on the row with its own alignSelf', async () => {
    await render(<BringSomeoneRow eventTitle="Neon Nights" onWhatsApp={jest.fn()} onShare={jest.fn()} testID="b" />)
    // The button's placement style sits on its outer wrapper, one or two levels above the pressable.
    let node = screen.getByTestId('b-whatsapp') as { props: { style?: unknown }; parent: unknown } | null
    let alignSelf: string | undefined
    while (node && !alignSelf) {
      alignSelf = (StyleSheet.flatten(node.props.style as never) as { alignSelf?: string } | undefined)?.alignSelf
      node = node.parent as typeof node
    }
    expect(alignSelf).toBe('center')
  })

  it('survives a very long event name in its label without growing the row’s words', async () => {
    const long = 'The Very Long Festival of Independent Bengaluru Bands, B-Sides and the Occasional Encore'
    await render(<BringSomeoneRow eventTitle={long} onWhatsApp={jest.fn()} onShare={jest.fn()} />)
    expect(screen.getByRole('button', { name: `WhatsApp, send ${long}` })).toBeTruthy()
    expect(screen.getByText('Bring someone?')).toBeTruthy()
  })
})

describe('reading the install referrer', () => {
  it('takes an event or a venue link and nothing else', () => {
    expect(arrivalFromReferrer(`link=e/${ID}`)).toEqual({ kind: 'event', id: ID })
    expect(arrivalFromReferrer(`utm_source=google-play&link=v%2F${ID}&utm_medium=organic`)).toEqual({ kind: 'venue', id: ID })
    expect(arrivalFromReferrer('utm_source=google-play&utm_medium=organic')).toBeNull()
    expect(arrivalFromReferrer(`link=f/abcdefghijklmnopqrstuv`)).toBeNull()
    expect(arrivalFromReferrer('link=https://evil.example/e/abc')).toBeNull()
    expect(arrivalFromReferrer('link=%E0%A4%A')).toBeNull()
    expect(arrivalFromReferrer('')).toBeNull()
    expect(arrivalFromReferrer(null)).toBeNull()
  })
})

describe('what the banner says', () => {
  it('names the event, when and where, and carries its cover and route', async () => {
    await expect(lookUpArrival({ kind: 'event', id: ID })).resolves.toEqual({
      status: 'ready',
      details: { title: 'Neon Nights', meta: 'Sun 4 Oct, 9 PM · Toit, Indiranagar', cover: 'https://img/c.jpg', route: `/event/${ID}` },
    })
  })

  it('names the area only for an unlisted event', async () => {
    mockGetEvent.mockResolvedValue({ success: true, data: { ...EVENT, visibility: 'unlisted' } })
    const lookup = await lookUpArrival({ kind: 'event', id: ID })
    expect(lookup).toMatchObject({ status: 'ready', details: { meta: 'Sun 4 Oct, 9 PM · Indiranagar' } })
    expect(JSON.stringify(lookup)).not.toContain('Toit')
  })

  // D24 (C38): the organiser's "Something else" never reaches a guest. Negative control: the raw label fails.
  it('a venue of type other reads "Venue" in the banner, never the organizer’s word', async () => {
    mockGetVenue.mockResolvedValue({ success: true, data: { venue: { id: 'v1', name: 'Hall 3', venueType: 'other', venueTypeLabel: 'Something else', city: 'Indiranagar' } } })
    const lookup = await lookUpArrival({ kind: 'venue', id: 'v1' })
    expect(lookup).toMatchObject({ status: 'ready', details: { meta: 'Venue · Indiranagar' } })
  })

  it('says nothing for an event that is gone, private or a draft, and asks again later when it could not ask', async () => {
    mockGetEvent.mockResolvedValue({ success: false, errorCode: 'NOT_FOUND' })
    await expect(lookUpArrival({ kind: 'event', id: ID })).resolves.toEqual({ status: 'gone' })
    mockGetEvent.mockResolvedValue({ success: true, data: { ...EVENT, visibility: 'private' } })
    await expect(lookUpArrival({ kind: 'event', id: ID })).resolves.toEqual({ status: 'gone' })
    mockGetEvent.mockResolvedValue({ success: false, error: 'offline' })
    await expect(lookUpArrival({ kind: 'event', id: ID })).resolves.toEqual({ status: 'retry' })
    mockGetEvent.mockRejectedValue(new Error('boom'))
    await expect(lookUpArrival({ kind: 'event', id: ID })).resolves.toEqual({ status: 'retry' })
  })

  it('names a venue by its type and area', async () => {
    await expect(lookUpArrival({ kind: 'venue', id: 'v1' })).resolves.toEqual({
      status: 'ready',
      details: { title: 'Toit', meta: 'Brewery · Indiranagar', cover: null, route: '/venue/v1' },
    })
  })
})

describe('when the banner is shown', () => {
  it('on Android, once, and it is marked seen as it is drawn', async () => {
    const { result } = await renderHook(() => useArrival())
    await waitFor(() => expect(result.current).toMatchObject({ title: 'Neon Nights' }))
    expect(mockAsyncSet).toHaveBeenCalledWith(ARRIVAL_SEEN_KEY, '1')
  })

  it('never on iOS (a link does not survive the App Store; v1 lands on the Pulse)', async () => {
    on('ios')
    const { result } = await renderHook(() => useArrival())
    await act(async () => {})
    expect(mockReferrer).not.toHaveBeenCalled()
    expect(result.current).toBeNull()
  })

  it('not again once seen, and not at all without a link in the referrer (which is also marked seen)', async () => {
    mockAsyncGet.mockResolvedValue('1')
    const seen = await renderHook(() => useArrival())
    await act(async () => {})
    expect(mockReferrer).not.toHaveBeenCalled()
    expect(seen.result.current).toBeNull()
    mockAsyncGet.mockResolvedValue(null)
    mockReferrer.mockResolvedValue('utm_source=google-play&utm_medium=organic')
    const plain = await renderHook(() => useArrival())
    await waitFor(() => expect(mockAsyncSet).toHaveBeenCalledWith(ARRIVAL_SEEN_KEY, '1'))
    expect(plain.result.current).toBeNull()
  })

  it('a dead link says nothing, once; an unreachable server is tried again next launch', async () => {
    mockGetEvent.mockResolvedValue({ success: false, errorCode: 'NOT_FOUND' })
    const gone = await renderHook(() => useArrival())
    await waitFor(() => expect(mockAsyncSet).toHaveBeenCalledWith(ARRIVAL_SEEN_KEY, '1'))
    expect(gone.result.current).toBeNull()
    mockAsyncSet.mockClear()
    mockGetEvent.mockResolvedValue({ success: false, error: 'offline' })
    const offline = await renderHook(() => useArrival())
    await act(async () => {})
    expect(mockAsyncSet).not.toHaveBeenCalled()
    expect(offline.result.current).toBeNull()
  })

  it('a clipboard-style failure reading the referrer is logged, not thrown', async () => {
    mockReferrer.mockRejectedValue(new Error('no play services'))
    const { result } = await renderHook(() => useArrival())
    await act(async () => {})
    expect(result.current).toBeNull()
  })
})

describe('the banner', () => {
  const banner = (props: Partial<React.ComponentProps<typeof ArrivalBanner>> = {}) => (
    <ArrivalBanner title="Neon Nights" meta="Sun 4 Oct, 9 PM · Toit" cover="https://img/c.jpg" onOpen={jest.fn()} onDismiss={jest.fn()} testID="a" {...props} />
  )

  it('says who it is from nobody: the event, the date and the place, and two controls named for it', async () => {
    await render(banner())
    expect(screen.getByText('You were sent Neon Nights')).toBeTruthy()
    expect(screen.getByText('Sun 4 Oct, 9 PM · Toit')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Open Neon Nights' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Dismiss' })).toBeTruthy()
  })

  it('Open plays H.primary on press-in and opens; × is silent and dismisses', async () => {
    const onOpen = jest.fn()
    const onDismiss = jest.fn()
    await render(banner({ onOpen, onDismiss }))
    await fireEvent(screen.getByRole('button', { name: 'Open Neon Nights' }), 'pressIn')
    expect(H.primary).toHaveBeenCalledTimes(1)
    await fireEvent.press(screen.getByRole('button', { name: 'Open Neon Nights' }))
    expect(onOpen).toHaveBeenCalledTimes(1)
    await fireEvent.press(screen.getByRole('button', { name: 'Dismiss' }))
    expect(onDismiss).toHaveBeenCalledTimes(1)
    expect(H.select).not.toHaveBeenCalled()
  })

  it('is announced politely, once, and holds a venue (no cover) and a one-letter or very long name', async () => {
    const long = 'The Very Long Festival of Independent Bengaluru Bands, B-Sides and the Occasional Encore'
    await render(banner({ title: long, cover: null, meta: '' }))
    expect(screen.getByText(`You were sent ${long}`).props.numberOfLines).toBe(1)
    expect(screen.getByTestId('a').props.accessibilityLiveRegion).toBe('polite')
    expect(screen.queryByTestId('a-cover')).toBeNull()
  })
})

describe('on the Pulse', () => {
  it('shows the banner for the link, opens the event on Open, and is gone after', async () => {
    await render(<PulseArrival />)
    await waitFor(() => expect(screen.getByText('You were sent Neon Nights')).toBeTruthy())
    await fireEvent.press(screen.getByRole('button', { name: 'Open Neon Nights' }))
    expect(mockPush).toHaveBeenCalledWith(`/event/${ID}`)
    expect(screen.queryByText('You were sent Neon Nights')).toBeNull()
  })

  it('× takes it away for good without opening anything', async () => {
    await render(<PulseArrival />)
    await waitFor(() => expect(screen.getByText('You were sent Neon Nights')).toBeTruthy())
    await fireEvent.press(screen.getByRole('button', { name: 'Dismiss' }))
    expect(mockPush).not.toHaveBeenCalled()
    expect(screen.queryByText('You were sent Neon Nights')).toBeNull()
  })

  it('draws nothing when there is no link to arrive from', async () => {
    mockReferrer.mockResolvedValue('utm_source=google-play')
    await render(<PulseArrival />)
    await act(async () => {})
    expect(screen.queryByTestId('pulse-arrival')).toBeNull()
  })
})

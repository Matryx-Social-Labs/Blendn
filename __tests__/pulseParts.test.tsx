/**
 * The Pulse's own parts (Flow 3 `home`): the city picker, the banners, the empty states, the peek and the search row.
 */
import { act, fireEvent, render, screen, within } from '@testing-library/react-native'
import React from 'react'

import { H } from '../lib/haptics'
import type { CityOption } from '../lib/city'

jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 47, bottom: 34, left: 0, right: 0 }) }))
jest.mock('../components/cityArt/drawable', () => ({ drawableCityArt: () => null }))
jest.mock('../components/RealtimeStatusBanner', () => () => null)
jest.mock('../components/ds/Sheet', () => ({
  Sheet: (p: { visible: boolean; title: string; children: React.ReactNode }) => {
    const { View, Text } = require('react-native')
    return p.visible ? (
      <View>
        <Text accessibilityRole="header">{p.title}</Text>
        {p.children}
      </View>
    ) : null
  },
}))
jest.mock('../components/ds/ContextMenu', () => ({
  LongPressMenu: (p: { visible: boolean; items: { label: string; onPress: () => void }[]; children: React.ReactNode }) => {
    const { Pressable, Text, View } = require('react-native')
    return p.visible ? (
      <View testID="menu">
        {p.children}
        {p.items.map((i) => (
          <Pressable key={i.label} accessibilityRole="button" accessibilityLabel={i.label} onPress={i.onPress}>
            <Text>{i.label}</Text>
          </Pressable>
        ))}
      </View>
    ) : null
  },
}))

/* eslint-disable import/first */
import { CityPicker, matchingCities } from '../components/pulse/CityPicker'
import { PulseBanners } from '../components/pulse/PulseBanners'
import { PulseEmpty, PulseLoadFailed } from '../components/pulse/PulseEmpty'
import { PulsePeek } from '../components/pulse/PulsePeek'
import { PulseSearch } from '../components/pulse/PulseHeader'
/* eslint-enable import/first */

const CITIES: CityOption[] = [
  { city: 'Bengaluru', eventCount: 14 },
  { city: 'Mumbai', eventCount: 9 },
  { city: 'Goa', eventCount: 0 },
  { city: 'Mysuru', eventCount: 0, placeCount: 31 },
]

describe('the city picker', () => {
  it('groups by country, home first, with Toronto coming soon and Elsewhere last (travel plan §4.1)', async () => {
    const cities: CityOption[] = [
      { city: 'Bengaluru', eventCount: 48, slug: 'bengaluru', country: 'IN', access: 'full' },
      { city: 'Toronto', eventCount: 0, placeCount: 0, slug: 'toronto', country: 'CA', access: 'comingSoon' },
      { city: 'Hosur', eventCount: 2, slug: null, country: null, access: 'full' },
    ]
    const countries = [
      { code: 'IN', name: 'India', defaultCitySlug: 'bengaluru' },
      { code: 'CA', name: 'Canada', defaultCitySlug: 'toronto' },
    ]
    await render(<CityPicker visible onClose={jest.fn()} cities={cities} countries={countries} homeCountry="IN" selectedCity="Bengaluru" deviceCity={null} onChoose={jest.fn()} onLocate={jest.fn()} />)
    expect(screen.getAllByRole('header').map((h) => h.props.children)).toEqual(expect.arrayContaining(['INDIA · HOME', 'CANADA', 'ELSEWHERE']))
    expect(screen.getByLabelText('Toronto, coming soon')).toBeTruthy()
    await fireEvent.changeText(screen.getByTestId('city-search-input'), 'tor')
    expect(screen.queryByTestId('city-group-IN')).toBeNull()
    expect(screen.getByTestId('city-group-CA')).toBeTruthy()
  })
  const picker = (over: Partial<React.ComponentProps<typeof CityPicker>> = {}) => (
    <CityPicker visible onClose={jest.fn()} cities={CITIES} selectedCity="Bengaluru" deviceCity={null} onChoose={jest.fn()} onLocate={jest.fn()} {...over} />
  )

  it('filters as you type, and says so when nothing matches', async () => {
    expect(matchingCities(CITIES, ' MUM ').map((c) => c.city)).toEqual(['Mumbai'])
    await render(picker())
    await fireEvent.changeText(screen.getByLabelText('Search cities'), 'mum')
    expect(screen.getByTestId('city-row-Mumbai')).toBeTruthy()
    expect(screen.queryByTestId('city-row-Bengaluru')).toBeNull()
    await fireEvent.changeText(screen.getByLabelText('Search cities'), 'zzz')
    expect(screen.getByTestId('city-no-match')).toBeTruthy()
  })

  it('marks the chosen city, and counts in Geist Mono: "events", "places" for a city with none, "Coming soon" for none', async () => {
    await render(picker())
    expect(screen.getByTestId('city-row-Bengaluru').props.accessibilityState).toMatchObject({ selected: true })
    expect(screen.getByTestId('city-row-Mumbai').props.accessibilityState).toMatchObject({ selected: false })
    // One unit cue per row (GO-10, A6): "9 events" beside "31 places", never a bare "9 on".
    expect(screen.getByTestId('city-row-Mumbai')).toHaveTextContent(/9 events/)
    expect(screen.getByRole('header', { name: 'Browse in' })).toBeTruthy()
    expect(screen.getByTestId('city-row-Mysuru')).toHaveTextContent(/31 places/)
    expect(screen.getByTestId('city-row-Goa')).toHaveTextContent(/Coming soon/)
  })

  it('choosing another city plays one H.select and chooses it; the chosen one again is a quiet choice', async () => {
    const select = jest.spyOn(H, 'select').mockImplementation(() => {})
    const onChoose = jest.fn()
    await render(picker({ onChoose }))
    await fireEvent.press(screen.getByTestId('city-row-Mumbai'))
    expect(onChoose).toHaveBeenCalledWith('Mumbai', false)
    expect(select).toHaveBeenCalledTimes(1)
    await fireEvent.press(screen.getByTestId('city-row-Bengaluru'))
    expect(select).toHaveBeenCalledTimes(1)
  })

  it('the locate row is always there: with a known place it chooses it; without one it asks and closes', async () => {
    const onChoose = jest.fn()
    const onLocate = jest.fn()
    const onClose = jest.fn()
    const view = await render(picker({ onChoose, onLocate, onClose, deviceCity: 'Mysuru' }))
    await fireEvent.press(screen.getByRole('button', { name: 'Use my current location, Mysuru' }))
    expect(onChoose).toHaveBeenCalledWith('Mysuru', true)
    await view.rerender(picker({ onChoose, onLocate, onClose, deviceCity: null }))
    await fireEvent.press(screen.getByRole('button', { name: 'Use my current location' }))
    expect(onLocate).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('no cities at all: the honest line, with the locate row still there', async () => {
    await render(picker({ cities: [], deviceCity: null }))
    expect(screen.getByTestId('city-none')).toBeTruthy()
    expect(screen.getByTestId('city-locate')).toBeTruthy()
  })
})

describe('the banners', () => {
  const base = { socketStatus: { state: 'connected' } as never, switchTo: null, onSwitch: jest.fn(), away: null, locationDenied: false, onOpenSettings: jest.fn(), refreshFailed: false, onRetry: jest.fn() }
  it('say nothing when there is nothing to say', async () => {
    await render(<PulseBanners {...base} />)
    expect(screen.queryByTestId('pulse-switch')).toBeNull()
    expect(screen.queryByTestId('pulse-away')).toBeNull()
  })
  it('the switch offer has its one action; the away notice has none', async () => {
    const onSwitch = jest.fn()
    await render(<PulseBanners {...base} switchTo="Mumbai" onSwitch={onSwitch} away={{ kind: 'notThere', deviceCity: 'Saarbrücken', selected: 'Bengaluru' }} />)
    expect(screen.getByText('You’re in Mumbai. Browse events here?')).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: 'Switch' }))
    expect(onSwitch).toHaveBeenCalledWith('Mumbai')
    expect(screen.getByText('We’re not in Saarbrücken yet. You’re browsing Bengaluru.')).toBeTruthy()
    expect(within(screen.getByTestId('pulse-away')).queryByRole('button')).toBeNull()
  })
  it('a coming-soon city the phone is in is said to be coming, not near', async () => {
    await render(<PulseBanners {...base} away={{ kind: 'comingSoon', deviceCity: 'Toronto', selected: 'Bengaluru' }} />)
    expect(screen.getByText('Toronto is coming soon. You’re browsing Bengaluru.')).toBeTruthy()
  })
  it('the travel banner goes back home, and can be put away', async () => {
    const onTravelBack = jest.fn()
    const onTravelDismiss = jest.fn()
    const travel = { kind: 'browsing' as const, text: 'Browsing Canada. Times are Toronto time. Check-in opens when you’re there.', back: 'Bengaluru' }
    await render(<PulseBanners {...base} travel={travel} onTravelBack={onTravelBack} onTravelDismiss={onTravelDismiss} />)
    expect(screen.getByText(travel.text)).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: 'Back to Bengaluru' }))
    expect(onTravelBack).toHaveBeenCalledTimes(1)
    await fireEvent.press(screen.getByRole('button', { name: 'Dismiss' }))
    expect(onTravelDismiss).toHaveBeenCalledTimes(1)
  })
  it('denied sends to Settings; a failed refresh offers Try again', async () => {
    const onOpenSettings = jest.fn()
    const onRetry = jest.fn()
    await render(<PulseBanners {...base} locationDenied refreshFailed onOpenSettings={onOpenSettings} onRetry={onRetry} />)
    await fireEvent.press(screen.getByRole('button', { name: 'Settings' }))
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }))
    expect(onOpenSettings).toHaveBeenCalled()
    expect(onRetry).toHaveBeenCalled()
  })
})

describe('the empty states', () => {
  const props = { city: 'Bengaluru', canChangeCity: true, onClearSearch: jest.fn(), onClearFilters: jest.fn(), onChangeCity: jest.fn(), onRefresh: jest.fn() }
  it('a search miss clears the search; a filter miss clears the filters; neither offers a city', async () => {
    const view = await render(<PulseEmpty {...props} kind="search" copy={{ title: 'No matches', message: 'Nothing here matches “jazz”.' }} />)
    await fireEvent.press(screen.getByRole('button', { name: 'Clear search' }))
    expect(props.onClearSearch).toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Change city' })).toBeNull()
    await view.rerender(<PulseEmpty {...props} kind="filters" copy={{ title: 'No matches', message: 'x' }} />)
    await fireEvent.press(screen.getByRole('button', { name: 'Clear filters' }))
    expect(props.onClearFilters).toHaveBeenCalled()
  })
  it('a quiet city offers another city, or a refresh; with no list of cities, only the refresh', async () => {
    const view = await render(<PulseEmpty {...props} kind="quiet" copy={{ title: 'Nothing on in Bengaluru', message: 'Try another city.' }} />)
    expect(screen.getByRole('button', { name: 'Change city' })).toBeTruthy()
    await view.rerender(<PulseEmpty {...props} canChangeCity={false} kind="notLive" copy={{ title: 'Coming soon to Goa', message: 'x' }} />)
    expect(screen.queryByRole('button', { name: 'Change city' })).toBeNull()
    await fireEvent.press(screen.getByRole('button', { name: 'Refresh' }))
    expect(props.onRefresh).toHaveBeenCalled()
  })
  it('a failed first load is "Couldn’t load events" with Try again', async () => {
    const onRetry = jest.fn()
    await render(<PulseLoadFailed onRetry={onRetry} />)
    expect(screen.getByText('Couldn’t load events')).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }))
    expect(onRetry).toHaveBeenCalled()
  })
})

describe('the peek', () => {
  const event = { id: 'e1', title: 'Vinyl Night', venue_name: 'Toit', start_time: new Date(Date.now() + 3_600_000).toISOString(), end_time: new Date(Date.now() + 7_200_000).toISOString(), cover_image_url: null } as never
  const peek = { event, anchor: { x: 24, y: 300, width: 240, height: 170 }, kind: 'compact' as const }
  const open = (over: Partial<React.ComponentProps<typeof PulsePeek>> = {}) => (
    <PulsePeek peek={peek} now={Date.now()} withDistance={false} interested={false} checkedIn={false} withinFence={false} onAction={jest.fn()} onClose={jest.fn()} {...over} />
  )
  it('is shut with nothing held', async () => {
    await render(open({ peek: null }))
    expect(screen.queryByTestId('menu')).toBeNull()
  })
  it('lifts the card and lists Save, Share, Preview; each item says what it is for this event', async () => {
    const onAction = jest.fn()
    await render(open({ onAction }))
    expect(within(screen.getByTestId('menu')).getByRole('button', { name: /^Vinyl Night/ })).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: 'Share' }))
    expect(onAction).toHaveBeenCalledWith('share', event)
    expect(screen.queryByRole('button', { name: 'Check in' })).toBeNull()
  })
  it('inside the fence: Check in; checked in: Check out; saved: Remove from saved', async () => {
    const view = await render(open({ withinFence: true, interested: true }))
    expect(screen.getByRole('button', { name: 'Check in' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Remove from saved' })).toBeTruthy()
    await view.rerender(open({ checkedIn: true }))
    expect(screen.getByRole('button', { name: 'Check out' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Check in' })).toBeNull()
  })
})

describe('the search row', () => {
  it('has the filter with its badge, and each applied filter as a removable chip', async () => {
    const onRemove = jest.fn()
    await render(
      <PulseSearch query="" onChangeQuery={jest.fn()} onPressFilter={jest.fn()} activeFilterCount={2} applied={[{ key: 'when', label: 'This weekend', onRemove }, { key: 'radiusKm', label: 'Within 5 km', onRemove: jest.fn() }]} />
    )
    expect(screen.getByRole('button', { name: 'Filters' }).props.accessibilityHint).toBe('2 applied')
    expect(screen.getByTestId('pulse-filter-badge', { includeHiddenElements: true })).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: 'This weekend, remove filter' }))
    expect(onRemove).toHaveBeenCalledTimes(1)
  })
  it('shows no badge and no chips with no filter', async () => {
    await render(<PulseSearch query="" onChangeQuery={jest.fn()} onPressFilter={jest.fn()} />)
    expect(screen.queryByTestId('pulse-filter-badge', { includeHiddenElements: true })).toBeNull()
    expect(screen.queryByTestId('pulse-applied')).toBeNull()
  })
})

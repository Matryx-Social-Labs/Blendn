import { useEffect, useMemo, useState } from 'react'

import { SettingsRow } from '../ds/SettingsRow'
import { CityPicker } from '../pulse/CityPicker'
import { useToast } from '../Toast'
import { apiClient } from '../../lib/apiClient'
import { cityFor, homeCity, type CatalogueCountry, type CityOption, type CityRef } from '../../lib/city'
import { saveHomeCity, useHomeCitySlug } from '../../lib/homeCity'

/**
 * Settings → "Home city" (travel plan §4.5): the city "travel" is measured from, so a person who moved can re-anchor it.
 * The same picker as the Pulse, titled "Your home city", listing only catalogued cities (a home is a slug; an Elsewhere
 * city has none). Writes `homeCitySlug` with `PUT /profiles/:id`; the Pulse's chip follows through `useHomeCitySlug`.
 */
export function HomeCityRow({ userId }: { userId: string }) {
  const { showToast } = useToast()
  const slug = useHomeCitySlug(userId)
  const [catalogue, setCatalogue] = useState<{ cities: CityOption[]; countries: CatalogueCountry[] }>({ cities: [], countries: [] })
  const [open, setOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    Promise.resolve()
      .then(() => apiClient.getEventCities())
      .then((response) => {
        if (cancelled || !response.success || !response.data) return
        setCatalogue({ cities: response.data.cities, countries: response.data.countries ?? [] })
      })
      // The row still opens; an empty sheet says no cities, and the Pulse's own copy of the list is the same request.
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  const choosable = useMemo(() => catalogue.cities.filter((c) => !!c.slug), [catalogue.cities])
  const home = homeCity({ homeCitySlug: slug, available: choosable })

  const choose = (choice: CityRef) => {
    const option = cityFor(choosable, choice)
    setOpen(false)
    if (!option?.slug || option.slug === slug) return
    void saveHomeCity(userId, option.slug).then((saved) => {
      if (!saved) showToast('Couldn’t save your home city. Try again.', 'error', { haptic: 'error' })
    })
  }

  return (
    <>
      <SettingsRow
        icon="map-pin"
        title="Home city"
        hint={home?.city ?? (slug === null ? 'Not set' : undefined)}
        trail="chevron"
        onPress={() => setOpen(true)}
        testID="settings-home-city"
      />
      <CityPicker
        visible={open}
        onClose={() => setOpen(false)}
        title="Your home city"
        showLocate={false}
        cities={choosable}
        countries={catalogue.countries}
        homeCountry={home?.country ?? null}
        selectedCity={home?.city ?? null}
        selectedSlug={home?.slug ?? null}
        deviceCity={null}
        onChoose={choose}
        onLocate={() => {}}
      />
    </>
  )
}

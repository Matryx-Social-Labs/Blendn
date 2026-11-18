import { useEffect, useState } from 'react'
import { Linking } from 'react-native'

import { SettingsGroup, SettingsRow } from '../ds/SettingsRow'
import { apiClient } from '../../lib/apiClient'
import { cityChannel, homeCity, type CityOption } from '../../lib/city'
import { useHomeCitySlug } from '../../lib/homeCity'
import { Logger } from '../../lib/logger'

/**
 * "Your city" in Notification settings (Flow 9 A · 6, owner ruling 7): the home city's WhatsApp Channel, India only. Canada and
 * every other country have no row. The server sends no channel URL yet (ROADMAP § Backend later), so until it does, no city has
 * one and nothing is drawn.
 */
export function CityChannelRow({ userId }: { userId: string }) {
  const slug = useHomeCitySlug(userId)
  const [cities, setCities] = useState<CityOption[]>([])
  useEffect(() => {
    let cancelled = false
    Promise.resolve()
      .then(() => apiClient.getEventCities())
      .then((response) => {
        if (!cancelled && response.success && response.data) setCities(response.data.cities)
      })
      // No list, no row: the rest of the screen is unaffected.
      .catch((error) => Logger.warn('notifications', 'city channel: cities failed', { error }))
    return () => {
      cancelled = true
    }
  }, [])
  const channel = cityChannel(homeCity({ homeCitySlug: slug, available: cities }))
  if (!channel) return null
  return (
    <SettingsGroup title="Your city" testID="notification-settings-city">
      <SettingsRow
        icon="message-square"
        title={`Blend’n ${channel.city} on WhatsApp`}
        hint="What’s on this week, in the city channel"
        trail="external"
        opens="opens WhatsApp"
        onPress={() => void Linking.openURL(channel.url).catch((error) => Logger.warn('notifications', 'city channel: open failed', { error }))}
        testID="notification-settings-city-channel"
      />
    </SettingsGroup>
  )
}

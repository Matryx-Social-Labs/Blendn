import * as Notifications from 'expo-notifications'
import { router, useIsFocused } from 'expo-router'
import { useEffect, useState } from 'react'

import { apiClient } from '../../lib/apiClient'
import { bannerFor, bannerPresentation, claimBannerHost, nextBanner, type BannerSpec } from '../../lib/inAppBanners'
import { Logger } from '../../lib/logger'
import { isOnScreenThread, landFromNotificationData } from '../../lib/notifications'
import { InAppBanner } from '../ds/InAppBanner'

/**
 * The in-app banner for a push that arrives while the tabs are showing (Flow 9 · 9.4): a person, a crew, an
 * event, or two of the same kind merged ("2 new matches"). One at a time, keyed by the arrival, so the next
 * one lands as a new banner. It claims the banner host while the tabs are focused, which is what makes the
 * push handler (`lib/notifications`) leave the system banner and the sound out.
 *
 * Tapping it goes where the push would (`landFromNotificationData`: a request lands on the Notifications screen, highlighted) and marks it read when the push says which row it is
 * (`data.notificationId`); a merged one opens the Notifications screen, which has all of them.
 */
export function ForegroundBanners() {
  const focused = useIsFocused()
  const [banner, setBanner] = useState<BannerSpec | null>(null)

  useEffect(() => (focused ? claimBannerHost('tabs') : undefined), [focused])

  useEffect(() => {
    const sub = Notifications.addNotificationReceivedListener((notification) => {
      const { title, body, data } = notification.request.content
      const content = { title: title ?? '', body: body ?? '', data: data ?? {} }
      if (isOnScreenThread(content.data) || bannerPresentation(content.data) !== 'in-app') return
      const incoming = bannerFor(content, Date.now())
      if (incoming) setBanner((current) => nextBanner(current, incoming))
    })
    return () => sub.remove()
  }, [])

  if (!banner) return null
  const open = () => {
    if (banner.merged > 1) {
      router.push('/notifications')
      return
    }
    landFromNotificationData(banner.data)
    const id = banner.data.notificationId
    if (id) {
      apiClient.markNotificationsRead([id]).catch((error) => {
        Logger.warn('notifications', 'markRead:failed', { error: error as never })
      })
    }
  }
  return (
    <InAppBanner
      key={banner.key}
      visual={banner.visual}
      title={banner.title}
      context={banner.context}
      onPress={open}
      onDismiss={() => setBanner((current) => (current?.key === banner.key ? null : current))}
      testID="foreground-banner"
    />
  )
}

import { useCallback, useEffect, useState } from 'react'
import { Linking } from 'react-native'

import { useToast } from '../components/Toast'
import { apiClient } from './apiClient'
import { Logger } from './logger'
import { initializePushNotifications, removePushTokenFromProfile } from './notifications'
import { clearPushDeclined } from './pushDecline'
import { useOsPush } from './pushStatus'
import { PUSH_BLOCKED_SHEET } from './settingsSheets'
import { showSheet } from './sheet'
import { useAuth } from './useAuth'

/**
 * Whether this person gets pushes: what the account says (`profiles.push_enabled`) and what the phone says
 * (`lib/pushStatus`). It is the master switch on the Notification settings screen and the "Push is off" row
 * on the Notifications screen, which have to agree.
 *
 * `enabled` is `null` until the profile has been read (or when it could not be): a switch that has not heard
 * from the server holds still rather than show a guess. `off` is the sentence's truth: the phone refuses,
 * or the account switched it off. Turning it on after the phone has said no explains, and changes nothing.
 */
export function usePushPreference() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const { os, known, refresh: refreshOs } = useOsPush()
  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [saving, setSaving] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)
  const userId = user?.id

  const load = useCallback(async () => {
    if (!userId) return
    try {
      const result = await apiClient.getProfile(userId)
      if (!result.success || !result.data) throw new Error(result.error ?? 'The profile did not load')
      const data = result.data as { profile?: { push_enabled?: unknown }; push_enabled?: unknown }
      const value = (data.profile ?? data).push_enabled
      setEnabled(typeof value === 'boolean' ? value : true)
      setLoadFailed(false)
    } catch (error) {
      Logger.warn('notifications', 'push preference did not load', { error: error as never })
      setLoadFailed(true)
    }
  }, [userId])

  useEffect(() => {
    // Every setState in `load` comes after its first await; the rule cannot see through the async function.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  /** Saves `next`; the account's choice, then the phone's side of it (register to turn on, drop the token to turn off). */
  const save = useCallback(
    async (next: boolean) => {
      if (!userId) return
      const previous = enabled
      setEnabled(next)
      setSaving(true)
      try {
        const result = await apiClient.updateProfile(userId, { push_enabled: next })
        if (!result.success) throw new Error(result.error || 'Failed to save setting')
        if (next) {
          // Turning it on is the answer onboarding's "Maybe later" deferred. It may ask the phone for the first time; read its answer back either way.
          void clearPushDeclined(userId)
            .then(() => initializePushNotifications())
            .catch(() => {})
            .finally(() => void refreshOs())
        } else {
          removePushTokenFromProfile().catch(() => {})
        }
      } catch {
        setEnabled(previous)
        showToast('Couldn’t save “Push notifications”. Try again.', 'error', { haptic: 'error' })
      } finally {
        setSaving(false)
      }
    },
    [userId, enabled, showToast, refreshOs]
  )

  /** The switch: refused with an explanation when the phone has said no for good. */
  const toggle = useCallback(() => {
    if (enabled === null || saving) return
    if (os === 'blocked') {
      showSheet(PUSH_BLOCKED_SHEET)
      return
    }
    void save(!enabled)
  }, [enabled, saving, os, save])

  /** "Turn on": asks if the phone still can, otherwise opens the phone's settings. */
  const turnOn = useCallback(async () => {
    if (os === 'blocked') {
      await Linking.openSettings().catch(() => {})
      return
    }
    await save(true)
  }, [os, save])

  return {
    os,
    enabled,
    saving,
    loadFailed,
    load,
    toggle,
    turnOn,
    /** The phone refuses, or the account switched it off. Unknown (still loading) is not off. */
    off: (known && os !== 'granted') || enabled === false,
  }
}

import { useCallback, useEffect, useState } from 'react'

import { useToast } from '../components/Toast'
import { Logger } from './logger'
import { notificationPrefsApi, parsePrefs, PREF_ROWS, type NotificationPrefs, type PrefKey } from './notificationPrefs'

/**
 * The per-kind switches, as the server holds them. `prefs` is null until the server has answered in the
 * shape `parsePrefs` accepts (and for good where it has no such endpoint): the screen draws no per-kind
 * row for null. A switch flips at once and goes back, with a toast naming it, when the save fails.
 */
export function useNotificationPrefs() {
  const { showToast } = useToast()
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null)
  const [saving, setSaving] = useState<ReadonlySet<PrefKey>>(new Set())

  const load = useCallback(async () => {
    try {
      const result = await notificationPrefsApi.get()
      setPrefs(result.success ? parsePrefs(result.data) : null)
    } catch (error) {
      Logger.warn('notifications', 'prefs:failed', { error: error as never })
    }
  }, [])

  useEffect(() => {
    // `load` sets state only after its first await; the rule cannot see through the async function.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  const toggle = useCallback(
    async (key: PrefKey) => {
      if (!prefs || saving.has(key)) return
      const previous = prefs
      const next = !prefs[key]
      setPrefs({ ...prefs, [key]: next })
      setSaving((s) => new Set(s).add(key))
      try {
        const result = await notificationPrefsApi.set({ [key]: next })
        if (!result.success) throw new Error(result.error ?? 'The setting did not save')
        setPrefs(parsePrefs(result.data) ?? { ...previous, [key]: next })
      } catch {
        setPrefs(previous)
        const title = PREF_ROWS.find((r) => r.key === key)?.title ?? 'that setting'
        showToast(`Couldn’t save “${title}”. Try again.`, 'error', { haptic: 'error' })
      } finally {
        setSaving((s) => {
          const rest = new Set(s)
          rest.delete(key)
          return rest
        })
      }
    },
    [prefs, saving, showToast]
  )

  return { prefs, saving, toggle }
}

import { useEffect, useState } from 'react'

import { offersApi } from '../../lib/offers'
import { SettingsRow } from '../ds/SettingsRow'
import { useToast } from '../Toast'

/**
 * "Offers from places" (step 12 review M6): one switch for every place's offers. The server keeps it
 * (`/me/offers`) and leaves you out of every audience while it is off; the switch shows what the server
 * saved. It is the one per-kind switch the server has today, so it sits under "Tell me about" with the
 * rest (Flow 9 · 9.6).
 */
export function OffersFromPlacesRow() {
  const { showToast } = useToast()
  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    Promise.resolve()
      .then(() => offersApi.offersFromPlaces())
      .then((res) => {
        if (res.success && res.data) setEnabled(res.data.enabled)
      })
      .catch(() => {})
  }, [])
  const flip = async () => {
    if (enabled === null || saving) return
    setSaving(true)
    try {
      const res = await offersApi.setOffersFromPlaces(!enabled)
      if (res.success && res.data) setEnabled(res.data.enabled)
      else showToast(res.error || "That didn’t save. Try again.", 'error', { haptic: 'error' })
    } catch {
      showToast("That didn’t save. Try again.", 'error', { haptic: 'error' })
    } finally {
      setSaving(false)
    }
  }
  return (
    <SettingsRow
      icon="gift"
      title="Offers from places"
      hint="Offers places you keep going back to send their regulars. They never learn who gets them."
      trail="switch"
      value={enabled === true}
      onValueChange={() => void flip()}
      busy={saving}
      disabled={enabled === null}
      testID="settings-offers"
    />
  )
}

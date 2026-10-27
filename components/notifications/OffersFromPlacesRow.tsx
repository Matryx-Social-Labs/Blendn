import { useEffect, useState } from 'react'

import { offersApi, regularsActive } from '../../lib/offers'
import { SettingsRow } from '../ds/SettingsRow'
import { useToast } from '../Toast'

/**
 * "Offers from places" (step 12 review M6): one switch for every place's offers. The server keeps it
 * (`/me/offers`) and leaves you out of every audience while it is off; the switch shows what the server
 * saved. It is the one per-kind switch the server has today, so it sits under "Tell me about" with the
 * rest (Flow 9 · 9.6).
 *
 * D21 (owner: regulars are deferred): no control for a feature that doesn't exist. The row is drawn only when `/me/offers`
 * says a place has regulars on for this person (`regulars.active`, absent is off). With push off, or the phone blocking it,
 * no offer can arrive: the switch is off, held, and says why.
 */
export const OFFERS_PUSH_OFF = 'Off while push is off'

export function OffersFromPlacesRow({ pushOff }: { pushOff: boolean }) {
  const { showToast } = useToast()
  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [active, setActive] = useState(false)
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    Promise.resolve()
      .then(() => offersApi.offersFromPlaces())
      .then((res) => {
        if (!res.success || !res.data) return
        setEnabled(res.data.enabled)
        setActive(regularsActive(res.data as { regulars?: { active?: boolean } }))
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
  if (!active) return null
  return (
    <SettingsRow
      icon="gift"
      title="Offers from places"
      hint={pushOff ? OFFERS_PUSH_OFF : 'Offers places you keep going back to send their regulars. They never learn who gets them.'}
      trail="switch"
      value={!pushOff && enabled === true}
      onValueChange={() => void flip()}
      busy={saving}
      disabled={pushOff || enabled === null}
      testID="settings-offers"
    />
  )
}

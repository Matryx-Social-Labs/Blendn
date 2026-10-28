import { useEffect, useState } from 'react'

import { apiClient } from '../../lib/apiClient'

/** The fields of work, for `workFieldLabel`: `getWorkFields()` is cached by the client, so this is one cheap read per screen. Empty until it lands or if it fails. */
export function useWorkFields(): { slug: string; label: string }[] {
  const [fields, setFields] = useState<{ slug: string; label: string }[]>([])
  useEffect(() => {
    let live = true
    Promise.resolve()
      .then(() => apiClient.getWorkFields())
      .then((r) => {
        if (live && r?.success && r.data?.workFields) setFields(r.data.workFields)
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [])
  return fields
}

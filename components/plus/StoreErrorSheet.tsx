import { useState } from 'react'

import { Sheet } from '../ds/Sheet'
import { storeErrorTitle } from './storeActions'

export type StoreError = { message: string; manage?: boolean }

/**
 * A store error drawn by the paywall itself (review MED-C): `showStoreError`'s root sheet waits behind the paywall,
 * which holds the screen while it is up (lib/modalTurn), so a failed purchase there showed nothing. Rendered inside the
 * paywall's RouteModal, this one presents from it. The same words and actions as `showStoreError`.
 */
export function StoreErrorSheet({ error, onClose, onManage }: { error: StoreError | null; onClose: () => void; onManage: () => void }) {
  // The words stay while it leaves: `error` is already null by then.
  const [last, setLast] = useState<StoreError | null>(error)
  if (error && error !== last) setLast(error)
  const actions = last?.manage
    ? [
        {
          label: 'Manage subscription',
          kind: 'lit' as const,
          onPress: () => {
            onClose()
            onManage()
          },
        },
        { label: 'Close', kind: 'tertiary' as const, onPress: onClose },
      ]
    : [{ label: 'Close', kind: 'tertiary' as const, onPress: onClose }]
  return (
    <Sheet visible={!!error} onClose={onClose} icon="circle-alert" title={storeErrorTitle(last?.manage)} body={last?.message} actions={actions} testID="plus-store-error" />
  )
}

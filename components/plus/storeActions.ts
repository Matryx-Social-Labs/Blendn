import { Linking } from 'react-native'

import { manageSubscriptionUrl } from '../../lib/purchases'
import { showSheet } from '../../lib/sheet'

/** Opens the store's own subscriptions page (never ours); `onFail` says it did not open. */
export async function openStoreSubscriptions(onFail: () => void): Promise<void> {
  Linking.openURL(await manageSubscriptionUrl()).catch(onFail)
}

/**
 * A store error in words, as a tray (R4-D12 12-3); "already bought" points at
 * Manage subscription. Shared by the page and the Tonight sheet, which both
 * sell through the same store.
 */
export function showStoreError(message: string, manageIt: boolean | undefined, onManage: () => void): void {
  showSheet({
    kind: 'actions',
    hue: 'violet',
    icon: 'circle-alert',
    title: manageIt ? 'Already purchased' : 'The purchase didn’t go through',
    message,
    actions: manageIt ? [{ label: 'Manage subscription', then: onManage }, { label: 'Close', cancel: true }] : [{ label: 'Close', cancel: true }],
  })
}

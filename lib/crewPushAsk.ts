import * as Notifications from 'expo-notifications'

import { initializePushNotifications } from './notifications'
import { clearPushDeclined } from './pushDecline'
import { showSheet } from './sheet'

/** Flow 9's ask, the moment it earns its place: you just joined, and "We're here" is a push. */
export const CREW_PUSH_TITLE = 'Want to know when your crew’s here?'
export const CREW_PUSH_BODY = 'We’ll tell you when someone from your crew arrives. No names, and no place, in the push.'

/** Whether the phone can still be asked: it has not said yes or no yet. */
export async function mayAskForPush(): Promise<boolean> {
  try {
    const { status, canAskAgain } = await Notifications.getPermissionsAsync()
    return status === 'undetermined' && canAskAgain
  } catch {
    return false
  }
}

/**
 * After Join: the pre-permission ask, once the phone has not been asked. Turning it on is the
 * answer Settings gives (clear a "maybe later", register, which asks the OS); Not now asks nothing.
 */
export async function askCrewPush(userId: string): Promise<void> {
  if (!(await mayAskForPush())) return
  showSheet({
    kind: 'actions',
    icon: 'bell',
    title: CREW_PUSH_TITLE,
    message: CREW_PUSH_BODY,
    actions: [
      {
        label: 'Turn on notifications',
        variant: 'primary',
        then: () => void clearPushDeclined(userId).then(() => initializePushNotifications()).catch(() => {}),
      },
      { label: 'Not now', cancel: true },
    ],
  })
}

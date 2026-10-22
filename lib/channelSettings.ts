import * as Application from 'expo-application'
import { Linking, Platform } from 'react-native'

/**
 * Android apps cannot switch their own channels: the row opens that channel's page in the phone's settings
 * (Flow 9 · 9.6 A1). Anywhere that cannot (iOS, an intent the phone refuses) it opens the app's own settings.
 */
export async function openChannelSettings(channelId: string): Promise<void> {
  if (Platform.OS === 'android') {
    try {
      await Linking.sendIntent('android.settings.CHANNEL_NOTIFICATION_SETTINGS', [
        { key: 'android.provider.extra.APP_PACKAGE', value: Application.applicationId ?? '' },
        { key: 'android.provider.extra.CHANNEL_ID', value: channelId },
      ])
      return
    } catch {
      // Fall through to the app's settings.
    }
  }
  await Linking.openSettings().catch(() => {})
}

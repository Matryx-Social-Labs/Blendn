import { Linking, Platform } from 'react-native'

/** iOS lists the schemes an app may ask about (`LSApplicationQueriesSchemes` in app.json); Android 11+ would need `<queries>`. */
const WHATSAPP_PROBE = 'whatsapp://send'

export const whatsAppLink = (text: string): string => `whatsapp://send?text=${encodeURIComponent(text)}`

/**
 * Whether to offer WhatsApp: asked of iOS, assumed on Android, where a missing app is found by trying (`openWhatsApp`)
 * and the caller falls back to More…, so the one platform that cannot be asked is not left without a button.
 */
export async function whatsAppInstalled(): Promise<boolean> {
  if (Platform.OS !== 'ios') return true
  try {
    return await Linking.canOpenURL(WHATSAPP_PROBE)
  } catch {
    return false
  }
}

/** Opens a WhatsApp chat picker with `text` written; false when it could not (no WhatsApp). */
export async function openWhatsApp(text: string): Promise<boolean> {
  try {
    await Linking.openURL(whatsAppLink(text))
    return true
  } catch {
    return false
  }
}

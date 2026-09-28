import * as Application from 'expo-application'
import Constants from 'expo-constants'
import { Platform } from 'react-native'

import { COMMUNITY_GUIDELINES_URL } from './communityGuidelines'

/**
 * Where people reach us, and what we need to know when they do.
 *
 * One address, here, so Settings, Contact support and the crash screen cannot
 * drift apart. The pages are the published ones Settings has always linked.
 */
export const SUPPORT_EMAIL = 'support@blendn.app'

export const BLENDN_LINKS = {
  safety: 'https://blendn.app/safety',
  guidelines: COMMUNITY_GUIDELINES_URL,
  help: 'https://blendn.app/help',
  terms: 'https://blendn.app/terms',
  privacy: 'https://blendn.app/privacy',
  deleteAccount: 'https://www.blendn.app/delete-account',
} as const

/**
 * "1.0.0 (118)". The binary's own numbers, not app.json's: the build number is
 * EAS's (`appVersionSource: remote`) and never appears in the config, and an OTA
 * update changes the config without changing the binary it runs on.
 */
export function appVersionLabel(): string {
  const version = Application.nativeApplicationVersion ?? Constants.expoConfig?.version ?? 'unknown'
  const build = Application.nativeBuildVersion
  return build ? `${version} (${build})` : version
}

/** "iOS 18.2", "Android 35". */
export function platformLabel(): string {
  const name = Platform.OS === 'ios' ? 'iOS' : Platform.OS === 'android' ? 'Android' : Platform.OS
  return `${name} ${Platform.Version}`
}

/**
 * A `mailto:` to support with the facts we would otherwise have to ask for.
 *
 * The details go under the space for the message, so the person writes first
 * and the version, platform and account ride along below.
 */
export function supportMailto({
  subject,
  userId,
  errorId,
}: {
  subject: string
  userId?: string | null
  errorId?: string | null
}): string {
  const details = [
    `App: ${appVersionLabel()}`,
    `Device: ${platformLabel()}`,
    userId ? `Account: ${userId}` : null,
    errorId ? `Error: ${errorId}` : null,
  ].filter(Boolean)
  const body = `\n\n\n--\n${details.join('\n')}`
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}

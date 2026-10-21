import * as Application from 'expo-application'
import Constants from 'expo-constants'
import { Platform } from 'react-native'

export { appVersionNumber } from './appVersion'

/**
 * Where people reach us, and what we need to know when they do.
 *
 * One address, here, so Settings, Contact support and the crash screen cannot
 * drift apart. The pages themselves are in `./links`.
 */
export const SUPPORT_EMAIL = 'support@blendn.app'

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

/** The OS and its version apart ("iOS", "18.2"), for the Support card's own row. */
export function platformParts(): { name: string; version: string } {
  const name = Platform.OS === 'ios' ? 'iOS' : Platform.OS === 'android' ? 'Android' : Platform.OS
  return { name, version: String(Platform.Version) }
}

/** "iOS 18.2", "Android 35". */
export function platformLabel(): string {
  const { name, version } = platformParts()
  return `${name} ${version}`
}

/** An account id short enough to read aloud and to fit a row: "8f3a…c21e". The email carries the whole of it. */
export function shortAccountId(id: string): string {
  return id.length > 9 ? `${id.slice(0, 4)}…${id.slice(-4)}` : id
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

/**
 * The grievance officer the IT Rules 2021 (r.3(2)) ask every platform to name, with the legal name and the registered
 * address: shown on About › Grievances, one place so it is corrected once. The legal name only here; everywhere else the
 * company is Matrix Social Labs.
 */
export const GRIEVANCE = {
  officer: 'Likhith Gowda',
  email: 'grievance@blendn.app',
  company: 'Matryx Social Labs Private Limited',
  address: 'No 12, 11th Cross, near Kittur Rani Chennamma Road, Bendre Nagar, Banashankari 2nd Stage, Bengaluru 560070',
} as const

/** The row's hint on About: who, and where a notice can be sent. */
export const GRIEVANCE_LINE = `Grievance officer: ${GRIEVANCE.officer} · ${GRIEVANCE.company}, ${GRIEVANCE.address}`

export const grievanceMailto = () => `mailto:${GRIEVANCE.email}?subject=${encodeURIComponent("Blend'n grievance")}`

/** A copy of someone's data (Flow 7 R4.1 7.2): a prefilled email to support, with the account in it. Nothing is sent until they press Send. */
export const dataCopyMailto = (userId?: string | null) => {
  const body = `\n\nPlease send me a copy of the data Blend'n holds about me.\n\n--\nApp: ${appVersionLabel()}${userId ? `\nAccount: ${userId}` : ''}`
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('A copy of my data')}&body=${encodeURIComponent(body)}`
}

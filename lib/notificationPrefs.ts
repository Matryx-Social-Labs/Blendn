import { apiClient, type ApiResponse } from './apiClient'
import type { IconName } from '../components/ui/Icon'

/**
 * What a person can switch off, by kind (Flow 9 · 9.6): the same words here and in the phone's settings.
 *
 * The server has no per-kind preferences yet, so this is the client's side of a contract it has not
 * signed: `GET /api/mobile/me/notification-preferences` answers `{ matches, crew, night }`, three
 * booleans, and `PUT` takes any of them and answers all three. Until a GET answers in exactly that
 * shape, `parsePrefs` is null and the screen shows no per-kind row at all (a switch that cannot be saved
 * would be a lie). Offers are already the server's (`/me/offers`) and always shown.
 *
 * A switch stops the push only: the bell still fills (the row is written regardless).
 */
export const PREF_ROWS = [
  { key: 'matches', title: 'Matches and friends', icon: 'heart', channel: 'matches' },
  { key: 'crew', title: 'Your crew', icon: 'users', channel: 'crew' },
  { key: 'night', title: 'After the night', icon: 'moon', channel: 'after-the-night' },
] as const satisfies readonly { key: string; title: string; icon: IconName; channel: string }[]

export type PrefKey = (typeof PREF_ROWS)[number]['key']
export type NotificationPrefs = Readonly<Record<PrefKey, boolean>>

/** All three, as booleans, or nothing: half an answer is no answer. */
export function parsePrefs(raw: unknown): NotificationPrefs | null {
  if (typeof raw !== 'object' || raw === null) return null
  const record = raw as Record<string, unknown>
  const [matches, crew, night] = PREF_ROWS.map((r) => record[r.key])
  if (typeof matches !== 'boolean' || typeof crew !== 'boolean' || typeof night !== 'boolean') return null
  return { matches, crew, night }
}

/** The same fact, as the push settings sentence says it. */
export const PREFS_FOOT = 'These stop the push only; the bell still fills.'

export const notificationPrefsApi = {
  get(): Promise<ApiResponse<unknown>> {
    return apiClient.queuedRequest('/api/mobile/me/notification-preferences')
  },
  set(patch: Partial<Record<PrefKey, boolean>>): Promise<ApiResponse<unknown>> {
    return apiClient.queuedRequest('/api/mobile/me/notification-preferences', { method: 'PUT', body: JSON.stringify(patch) }, true, 2)
  },
}

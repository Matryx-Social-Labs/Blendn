/**
 * Gone, or just not loaded?
 *
 * A screen that reads every failed request as "this doesn't exist" tells
 * somebody on a train that their friend removed them. The server answers a
 * thing that really is gone with a 404, which `apiClient` carries through as
 * `errorCode: 'NOT_FOUND'` (the API's `notFoundResponse`). Everything else — no
 * signal, a timeout, a 5xx — is a failure to load, and gets "Try again".
 */
export function isGone(result: { success: boolean; errorCode?: string }): boolean {
  return !result.success && result.errorCode === 'NOT_FOUND'
}

/**
 * A fetch that gives up.
 *
 * There was no timeout anywhere in this app. `fetch` has no default one, so a
 * socket that opens and then goes quiet — a captive portal, a carrier stalling
 * a connection, a server that accepted and never answered — leaves a promise
 * that never settles.
 *
 * That is not merely a slow screen. `apiClient`'s `RequestQueue` runs six
 * concurrent slots and only frees one when its promise settles, so six hung
 * sockets deadlock **every** request in the app, on every screen. On top of
 * that the GET de-duplicator hands each new caller the same pending promise, so
 * pull-to-refresh and the 12-second `useLiveSync` poll both join the dead
 * request rather than starting a live one. The Matches tab spinning forever was
 * this, and nothing in the retry logic could rescue it: retries only run after
 * a rejection, and there was never going to be one.
 *
 * ## One controller per call, deliberately
 *
 * The signal is created *inside* this function, so a caller looping over
 * retries gets a fresh `AbortController` per attempt for free. Hoisting one
 * controller outside a retry loop is the classic bug here — it is already
 * aborted by attempt two, so every retry fails instantly with an error that
 * looks exactly like the timeout it is not.
 *
 * ## Aborts are not network errors
 *
 * `apiClient` retries when `isNetworkFailure(error)`: what `fetch` throws when the connection genuinely fails (a `TypeError`
 * from the XHR fetch, a `FetchError` from `expo/fetch`: see below). An abort is not one, so
 * it falls straight through to the error return without burning retries — which
 * is what we want, since the deadline has already covered the waiting. Use
 * `isTimeoutError` to tell the user which of the two happened; "took too long"
 * and "no connection" ask for different things from them.
 */

/**
 * 15 seconds.
 *
 * Long enough for a slow venue connection to answer, short enough that the
 * worst case stays bearable: a GET retries twice with 800ms and 1600ms of
 * backoff, so a total blackout surfaces in about 47 seconds rather than never.
 */
export const REQUEST_TIMEOUT_MS = 15_000

export const TIMEOUT_MESSAGE = 'This is taking too long. Check your connection and try again.'

/** A response whose body has been read: what is left to look at. */
export type ResponseHead = Pick<Response, 'ok' | 'status' | 'statusText' | 'headers'>

/**
 * `fetch`, but it rejects once `timeoutMs` has passed.
 *
 * `fetchImpl` exists so tests can supply a promise that never settles — the
 * exact condition being defended against, and one you cannot produce with a
 * real network.
 *
 * ## The body is read inside the deadline
 *
 * Since SDK 56 the global `fetch` is `expo/fetch`, which resolves when the
 * headers arrive and streams the body after. A deadline that stops at the
 * headers leaves `response.text()` with none, and a body that stalls holds its
 * queue slot for good — the Me tab on its skeleton with requests "still
 * running" after two minutes (SCRUM-498). So this reads the body itself and
 * hands it back with only the head of the response, so there is no stream
 * left to read.
 */
export async function fetchWithTimeout(
  input: string,
  init: RequestInit = {},
  timeoutMs: number = REQUEST_TIMEOUT_MS,
  fetchImpl: typeof fetch = fetch
): Promise<{ response: ResponseHead; body: string }> {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined

  /*
   * Abort *and* race, rather than abort alone.
   *
   * Aborting is what frees the socket, and on any transport that honours the
   * signal it is also what rejects the promise. But "the promise always
   * settles" is the entire guarantee this function exists to make, and hanging
   * it on the transport's cooperation is the same conditional that produced
   * the original bug. React Native's fetch has honoured `signal` since 0.60,
   * and a polyfill, an interceptor or a future version that quietly does not
   * would put us back to a spinner that never resolves.
   *
   * So the deadline rejects on its own authority. The abort still fires, so
   * nothing is left holding a connection open.
   */
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort()
      const error = new Error('Request timed out')
      error.name = 'AbortError'
      reject(error)
    }, timeoutMs)
  })

  try {
    const answer = fetchImpl(input, { ...init, signal: controller.signal }).then(async (response) => ({
      response,
      body: await response.text(),
    }))
    return await Promise.race([answer, deadline])
  } finally {
    // Always, including the success path. A pending timer holds a reference to
    // the controller and, on some engines, keeps a task queued long after the
    // response arrived.
    clearTimeout(timer)
  }
}

/**
 * Did this reject because we gave up, rather than because the network did?
 *
 * Matched on `name`, not `instanceof DOMException`: React Native has shipped
 * abort errors as both a `DOMException` and a plain `Error` with this name
 * depending on the version, and the name has been stable across all of them.
 */
export function isTimeoutError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    (error as { name?: unknown }).name === 'AbortError'
  )
}

/**
 * `work`, or `fallback` once `ms` has passed: a promise a caller may hold a spinner on. A rejection still rejects.
 *
 * `fetchWithTimeout` bounds the fetch, and only the fetch. What a call does before it reaches one is not
 * bounded: a slot in `apiClient`'s queue, the keychain read of the token, a shared token refresh. A screen
 * that awaits the call to end its busy state (a request answered in place) needs the whole of it to settle.
 */
export async function settleWithin<T>(work: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const late = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), ms)
  })
  try {
    return await Promise.race([work, late])
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Words a native transport uses for "the network did not carry it", for the failures that reach us as a plain `Error` (a body
 * that drops mid-read, where `expo/fetch` errors the stream with the native text as it is). iOS (NSURLError) and Android
 * (OkHttp/java.net) both. Deliberately not "timed out" (that is the deadline's, `isTimeoutError`) and not "aborted".
 */
const NATIVE_NETWORK_TEXT =
  /network (request failed|connection|is unreachable)|internet connection|offline|unable to resolve host|unknownhost|no address associated|failed to connect|connection (reset|refused|abort|closed|lost)|software caused connection|unexpected end of stream|econn|enotfound|hostname could not be found|could not connect to the server|socket/i

/**
 * Did this reject because the network did not carry the request (airplane mode, no signal, no route), rather than because we
 * gave up or the answer was bad?
 *
 * One rule for both transports, because they reject differently (SCRUM-898):
 * - the XHR `fetch` rejects with a `TypeError` ("Network request failed");
 * - `expo/fetch`, the global `fetch` since SDK 56, rejects with a `FetchError` -- an `Error`, never a `TypeError` -- whose
 *   message is "fetch failed: <native text>", on Android and iOS alike; a body that drops while it is read rejects with a
 *   plain `Error(<native text>)`.
 * `apiClient` used to ask `instanceof TypeError` alone, so on Android (and in practice iOS) offline fell through to the
 * generic failure: no retry, `networkStatus` left 'unknown', and no screen's OfflineBanner ever drawn.
 *
 * Our own deadline (`AbortError`) and an abort the transport reports ("The operation was aborted.") are never the network.
 */
export function isNetworkFailure(error: unknown): boolean {
  if (isTimeoutError(error)) return false
  if (error instanceof TypeError) return true
  if (!(error instanceof Error)) return false
  const text = error.message
  if (/operation was aborted/i.test(text)) return false
  return /^fetch failed:/i.test(text) || NATIVE_NETWORK_TEXT.test(text)
}

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
 * `apiClient` retries on `error instanceof TypeError`, which is what `fetch`
 * throws when the connection genuinely fails. An abort is not a `TypeError`, so
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

/**
 * `fetch`, but it rejects once `timeoutMs` has passed.
 *
 * `fetchImpl` exists so tests can supply a promise that never settles — the
 * exact condition being defended against, and one you cannot produce with a
 * real network.
 */
export async function fetchWithTimeout(
  input: string,
  init: RequestInit = {},
  timeoutMs: number = REQUEST_TIMEOUT_MS,
  fetchImpl: typeof fetch = fetch
): Promise<Response> {
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
    return await Promise.race([fetchImpl(input, { ...init, signal: controller.signal }), deadline])
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

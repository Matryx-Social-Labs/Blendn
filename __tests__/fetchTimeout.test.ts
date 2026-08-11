import {
  REQUEST_TIMEOUT_MS,
  fetchWithTimeout,
  isTimeoutError,
} from '../lib/fetchTimeout'

/**
 * The condition this defends against cannot be produced with a real network:
 * a socket that opens and then never answers. So every test here supplies a
 * `fetchImpl` that returns a promise nobody ever settles, and drives the clock
 * by hand.
 *
 * Note that `never` ignores the abort signal entirely — it is the *hostile*
 * transport, the one that takes a signal and does nothing with it. That is
 * deliberate: it proves the deadline rejects on its own authority rather than
 * relying on the transport to cooperate.
 */

const never = (): Promise<Response> => new Promise<Response>(() => {})

describe('fetchWithTimeout', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  it('rejects once the deadline passes, rather than hanging forever', async () => {
    const pending = fetchWithTimeout('/x', {}, 1000, never)
    const assertion = expect(pending).rejects.toMatchObject({ name: 'AbortError' })

    jest.advanceTimersByTime(1000)
    await assertion
  })

  it('does not reject before the deadline', async () => {
    let settled = false
    void fetchWithTimeout('/x', {}, 1000, never).catch(() => {
      settled = true
    })

    jest.advanceTimersByTime(999)
    await Promise.resolve()
    expect(settled).toBe(false)
  })

  it('passes a signal through so the request is actually cancelled', async () => {
    const seen: (AbortSignal | null | undefined)[] = []
    const capture: typeof fetch = (_input, init) => {
      seen.push(init?.signal)
      return never()
    }

    const pending = fetchWithTimeout('/x', { method: 'POST' }, 1000, capture)
    const assertion = expect(pending).rejects.toBeDefined()

    expect(seen).toHaveLength(1)
    expect(seen[0]).toBeInstanceOf(AbortSignal)
    expect(seen[0]?.aborted).toBe(false)

    jest.advanceTimersByTime(1000)
    // The signal the caller was handed is the one that fires — otherwise the
    // promise rejects while the socket underneath stays open.
    expect(seen[0]?.aborted).toBe(true)
    await assertion
  })

  it('preserves the caller options it was given', async () => {
    const seen: RequestInit[] = []
    const capture: typeof fetch = (_input, init) => {
      seen.push(init as RequestInit)
      return Promise.resolve({ ok: true } as Response)
    }

    await fetchWithTimeout('/x', { method: 'PUT', body: 'hi' }, 1000, capture)
    expect(seen[0]).toMatchObject({ method: 'PUT', body: 'hi' })
  })

  it('gives every call its own controller, so a retry loop is not poisoned', async () => {
    /*
     * The bug this exists to prevent: one AbortController hoisted outside a
     * retry loop is already aborted by attempt two, so every retry fails
     * instantly with an error indistinguishable from a real timeout. Because
     * the controller is created inside the function, looping is safe by
     * construction — attempt two must arrive with a signal that is NOT aborted.
     */
    const signals: (AbortSignal | null | undefined)[] = []
    const capture: typeof fetch = (_input, init) => {
      signals.push(init?.signal)
      return never()
    }

    const first = fetchWithTimeout('/x', {}, 1000, capture)
    const firstAssertion = expect(first).rejects.toBeDefined()
    jest.advanceTimersByTime(1000)
    await firstAssertion

    const second = fetchWithTimeout('/x', {}, 1000, capture)
    const secondAssertion = expect(second).rejects.toBeDefined()

    expect(signals).toHaveLength(2)
    expect(signals[0]?.aborted).toBe(true)
    expect(signals[1]?.aborted).toBe(false)
    expect(signals[0]).not.toBe(signals[1])

    jest.advanceTimersByTime(1000)
    await secondAssertion
  })

  it('clears its timer on the success path', async () => {
    const ok: typeof fetch = () => Promise.resolve({ ok: true } as Response)
    const clearSpy = jest.spyOn(global, 'clearTimeout')

    await fetchWithTimeout('/x', {}, 1000, ok)
    expect(clearSpy).toHaveBeenCalled()

    // Nothing left pending that could fire against a finished request.
    expect(jest.getTimerCount()).toBe(0)
    clearSpy.mockRestore()
  })

  it('clears its timer when the request itself fails', async () => {
    const boom: typeof fetch = () => Promise.reject(new TypeError('Network request failed'))

    await expect(fetchWithTimeout('/x', {}, 1000, boom)).rejects.toBeInstanceOf(TypeError)
    expect(jest.getTimerCount()).toBe(0)
  })

  it('defaults to a deadline that is set, not absent', () => {
    // The whole failure mode was "no deadline at all", so a falsy or absurd
    // default would reintroduce it quietly.
    expect(REQUEST_TIMEOUT_MS).toBeGreaterThan(0)
    expect(REQUEST_TIMEOUT_MS).toBeLessThanOrEqual(30_000)
  })
})

describe('isTimeoutError', () => {
  it('recognises an abort', () => {
    const err = new Error('Aborted')
    err.name = 'AbortError'
    expect(isTimeoutError(err)).toBe(true)
  })

  it('recognises an abort that is not an Error instance', () => {
    // React Native has shipped this as both a DOMException and a plain object
    // depending on the version; the name is the stable part.
    expect(isTimeoutError({ name: 'AbortError' })).toBe(true)
  })

  it('does not mistake a real network failure for a timeout', () => {
    /*
     * These are different things to tell a user. "No connection" asks them to
     * check their wifi; "took too long" asks them to try again. `apiClient`
     * also retries one and not the other.
     */
    expect(isTimeoutError(new TypeError('Network request failed'))).toBe(false)
  })

  it('is safe on the values that actually reach a catch block', () => {
    for (const value of [null, undefined, 'AbortError', 0, {}, []]) {
      expect(isTimeoutError(value)).toBe(false)
    }
  })
})

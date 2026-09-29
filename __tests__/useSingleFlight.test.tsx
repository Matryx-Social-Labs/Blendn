import { act, renderHook } from '@testing-library/react-native'

import { useSingleFlight } from '../lib/useSingleFlight'

/**
 * A second tap while a send is in flight sends nothing.
 *
 * The iOS announcement prompt had no pending state, so a second tap broadcast a
 * second announcement to everyone in the event chat, and the modal that replaced
 * it guarded with a `disabled` flag that only reaches the button on the next
 * render. Both taps are dispatched inside one `act` here, before anything can
 * re-render, which is exactly the case a disabled flag alone does not cover.
 */
function deferred() {
  let resolve!: () => void
  let reject!: (e: unknown) => void
  const promise = new Promise<void>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

it('runs the action once for two taps before anything re-renders', async () => {
  const gate = deferred()
  const send = jest.fn(() => gate.promise)
  const { result } = await renderHook(() => useSingleFlight(send))

  await act(async () => {
    void result.current.run()
    void result.current.run()
  })
  expect(send).toHaveBeenCalledTimes(1)
  expect(result.current.pending).toBe(true)

  await act(async () => {
    gate.resolve()
    await gate.promise
  })
  expect(result.current.pending).toBe(false)
})

it('runs again once the first send has finished', async () => {
  const send = jest.fn(() => Promise.resolve())
  const { result } = await renderHook(() => useSingleFlight(send))

  await act(async () => {
    await result.current.run()
  })
  await act(async () => {
    await result.current.run()
  })
  expect(send).toHaveBeenCalledTimes(2)
})

it('lets go after a failure, so the person can try again', async () => {
  const gate = deferred()
  const send = jest.fn().mockReturnValueOnce(gate.promise).mockResolvedValue(undefined)
  const { result } = await renderHook(() => useSingleFlight(send))

  let first!: Promise<void>
  await act(async () => {
    first = result.current.run()
  })
  await act(async () => {
    gate.reject(new Error('network down'))
    await first.catch(() => {})
  })
  expect(result.current.pending).toBe(false)

  await act(async () => {
    await result.current.run()
  })
  expect(send).toHaveBeenCalledTimes(2)
})

it('calls the newest action, so it reads the text as it is now', async () => {
  const seen: string[] = []
  const { result, rerender } = await renderHook(
    ({ text }: { text: string }) => useSingleFlight(async () => void seen.push(text)),
    { initialProps: { text: 'draft' } }
  )
  await rerender({ text: 'final wording' })

  await act(async () => {
    await result.current.run()
  })
  expect(seen).toEqual(['final wording'])
})

it('passes its arguments through', async () => {
  const send = jest.fn((_word: string, _n: number) => Promise.resolve())
  const { result } = await renderHook(() => useSingleFlight(send))
  await act(async () => {
    await result.current.run('a', 2)
  })
  expect(send).toHaveBeenCalledWith('a', 2)
})

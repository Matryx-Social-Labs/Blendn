/**
 * Auth's keychain work, held clear of the one native call that can wedge it (RC drive D1).
 *
 * On iOS every Expo async function runs on ONE serial queue (`expo.modules.AsyncFunctionQueue`). expo-notifications'
 * `getPermissionsAsync` waits on that queue with a semaphore until `usernotificationsd` answers, and when it does not answer
 * every later Expo call (SecureStore's token reads, writes and deletes among them) waits behind it for good. A JS timeout
 * frees our await, never the queue.
 *
 * So sign-in, sign-up, the launch's session restore, a token refresh and sign-out's server half run "on the critical path",
 * and a permission read (`lib/pushStatus`, `readPushPermission`) waits until none is running and `PAINT_GRACE_MS` has passed since the last
 * ended: the session is in the keychain and the first screen has painted before the queue is risked.
 *
 * ponytail: the grace is a fixed delay standing in for "the first screen painted"; a paint signal from the root layout is
 * the upgrade if one ever matters.
 */
export const PAINT_GRACE_MS = 1500

let running = 0
let quietAt = 0
let waiting: (() => void)[] = []
let timer: ReturnType<typeof setTimeout> | null = null

function wakeWhenQuiet(): void {
  if (running > 0 || waiting.length === 0) return
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => {
    timer = null
    if (running > 0) return
    if (Date.now() < quietAt) return wakeWhenQuiet()
    const woken = waiting
    waiting = []
    woken.forEach((wake) => wake())
  }, Math.max(0, quietAt - Date.now()))
}

/** Run `work` on the critical path: permission reads wait until it (and every other) has ended, plus the grace. */
export function onCriticalPath<T>(work: () => Promise<T>): Promise<T> {
  running += 1
  const ended = () => {
    running -= 1
    quietAt = Date.now() + PAINT_GRACE_MS
    wakeWhenQuiet()
  }
  let p: Promise<T>
  try {
    p = work()
  } catch (error) {
    ended()
    return Promise.reject(error)
  }
  p.then(ended, ended)
  return p
}

/** Resolves once nothing is on the critical path and the grace has passed. Immediately, when that is already so. */
export function offCriticalPath(): Promise<void> {
  if (running === 0 && Date.now() >= quietAt) return Promise.resolve()
  return new Promise((resolve) => {
    waiting.push(resolve)
    wakeWhenQuiet()
  })
}

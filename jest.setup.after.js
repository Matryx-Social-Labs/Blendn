/* global afterEach */
// A test's stored values never reach the next: the AsyncStorage mock is one module-wide store.
// (A test that mocks it differently, with no `clear`, is left alone.)
afterEach(async () => {
  const storage = require('@react-native-async-storage/async-storage')
  const store = storage.default ?? storage
  if (typeof store.clear === 'function') await store.clear()
})

/*
 * No real timer outlives its test file (SCRUM-1043).
 *
 * RNTL v14's `fireEvent` is async. Called without `await`, its act() overlaps the next one, and React can lose the
 * unmount's effect cleanups: a component's `clearTimeout` never runs. The timer then fires in whichever file runs next
 * on that worker, after this file's environment is torn down, and fails a suite that did nothing wrong (roomBar's
 * focus timer failed presenceMonitorVenueDay, nearbyEmpty, ... a different one each run). Await every fireEvent; this
 * sweep is the backstop, so a missed one fails nothing but its own file. Fake timers are jest's and die with the file.
 */
/* global afterAll */
const pendingTimers = new Set()
const realSetTimeout = global.setTimeout
const realClearTimeout = global.clearTimeout
global.setTimeout = function setTimeout(fn, ms, ...args) {
  const timer = realSetTimeout(function fire(...fired) {
    pendingTimers.delete(timer)
    return fn.apply(this, fired)
  }, ms, ...args)
  pendingTimers.add(timer)
  return timer
}
global.clearTimeout = function clearTimeout(timer) {
  pendingTimers.delete(timer)
  return realClearTimeout(timer)
}
afterAll(() => {
  pendingTimers.forEach((timer) => realClearTimeout(timer))
  pendingTimers.clear()
})

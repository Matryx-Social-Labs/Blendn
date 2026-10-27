/* global afterEach */
// A test's stored values never reach the next: the AsyncStorage mock is one module-wide store.
// (A test that mocks it differently, with no `clear`, is left alone.)
afterEach(async () => {
  const storage = require('@react-native-async-storage/async-storage')
  const store = storage.default ?? storage
  if (typeof store.clear === 'function') await store.clear()
})

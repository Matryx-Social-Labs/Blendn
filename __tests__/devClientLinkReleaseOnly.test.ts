/* In a Release build the dev client's launch link keeps nothing: its query is stripped like any other link. */
import { nativeIntentPath } from '../lib/shareLinks'

const g = globalThis as unknown as { __DEV__: boolean }
const was = g.__DEV__
afterEach(() => {
  g.__DEV__ = was
})

it('Release strips the dev-client query', () => {
  g.__DEV__ = false
  expect(nativeIntentPath('exp+blendn://expo-development-client/?url=https%3A%2F%2Fevil.example')).not.toMatch(/\?/)
})

it('development keeps it, so the dev client still launches', () => {
  g.__DEV__ = true
  expect(nativeIntentPath('exp+blendn://expo-development-client/?url=x')).toMatch(/\?url=x$/)
})

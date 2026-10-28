/** SYS-14: the build number the server's per-build minimum judges: a plain integer, or nothing. */
let mockBuild: string | null = '126'
jest.mock('expo-application', () => ({
  get nativeBuildVersion() {
    return mockBuild
  },
}))

import { appBuildNumber } from '../lib/appVersion'

it.each([
  ['126', '126'],
  ['0', '0'],
  [null, null],
  ['', null],
  ['1.0.0', null],
  ['12a', null],
  ['1234567890', null],
])('reads %p as %p', (native, expected) => {
  mockBuild = native
  expect(appBuildNumber()).toBe(expected)
})

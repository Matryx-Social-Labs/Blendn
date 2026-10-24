/*
 * lib/time reads the phone's zone from the native `ExpoLocalization` module (c1de8268, 793b91e0). On iOS that module is
 * only in a build whose Podfile.lock carries it: a lock without it builds an app where the module is absent and the zone
 * falls back to the engine's. Android autolinks it from node_modules (`expoAutolinking.useExpoModules()`), so it has no
 * lock to pin.
 */
import { readFileSync } from 'fs'
import { join } from 'path'

const read = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8')

it('the iOS lock carries ExpoLocalization, from node_modules, with its privacy bundle copied into the app', () => {
  const lock = read('ios/Podfile.lock')
  expect(lock).toMatch(/^  - ExpoLocalization \(\d+\.\d+\.\d+\):$/m)
  expect(lock).toContain('  - ExpoLocalization (from `../node_modules/expo-localization/ios`)')
  expect(lock).toMatch(/^  ExpoLocalization: [0-9a-f]{40}$/m)
  expect(read('ios/blendn.xcodeproj/project.pbxproj')).toContain('ExpoLocalization/ExpoLocalization_privacy.bundle')
  expect(read('lib/time.ts')).toContain('ExpoLocalization')
})

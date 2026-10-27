/*
 * What the iOS Podfile.lock records is what ships. EAS runs `pod install` itself, so a stale lock does not break a
 * build today, but it stops recording what the binary links, and a local build from it can miss a module.
 *
 * lib/time reads the phone's zone from the native `ExpoLocalization` module (c1de8268, 793b91e0). Android autolinks
 * from node_modules (`expoAutolinking.useExpoModules()`), so it has no lock to pin.
 */
import { existsSync, readdirSync, readFileSync } from 'fs'
import { join } from 'path'

const ROOT = join(__dirname, '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')

it('the iOS lock carries ExpoLocalization, from node_modules, with its privacy bundle copied into the app', () => {
  const lock = read('ios/Podfile.lock')
  expect(lock).toMatch(/^  - ExpoLocalization \(\d+\.\d+\.\d+\):$/m)
  expect(lock).toContain('  - ExpoLocalization (from `../node_modules/expo-localization/ios`)')
  expect(lock).toMatch(/^  ExpoLocalization: [0-9a-f]{40}$/m)
  expect(read('ios/blendn.xcodeproj/project.pbxproj')).toContain('ExpoLocalization/ExpoLocalization_privacy.bundle')
  expect(read('lib/time.ts')).toContain('ExpoLocalization')
})

/*
 * The app-review audit (2026-10-24 #15) found four native modules the JS imports missing from the lock:
 * react-native-keyboard-controller, expo-web-browser, react-native-view-shot and expo-sharing. Every dependency that
 * ships a podspec is autolinked on iOS, so every one must be in the lock, from its node_modules path.
 */
it('every dependency with a podspec is in the iOS lock, from node_modules', () => {
  const lock = read('ios/Podfile.lock')
  const native = Object.keys(JSON.parse(read('package.json')).dependencies).filter((dep) =>
    [`node_modules/${dep}`, `node_modules/${dep}/ios`].some(
      (dir) => existsSync(join(ROOT, dir)) && readdirSync(join(ROOT, dir)).some((f) => f.endsWith('.podspec'))
    )
  )
  expect(native).toEqual(expect.arrayContaining(['expo-sharing', 'expo-web-browser', 'react-native-keyboard-controller', 'react-native-view-shot']))
  const missing = native.filter((dep) => !lock.includes(`(from \`../node_modules/${dep}/`) && !lock.includes(`(from \`../node_modules/${dep}\`)`))
  expect(missing).toEqual([])
})

it('react-native-view-shot’s privacy manifest is copied into the app', () => {
  expect(read('ios/blendn.xcodeproj/project.pbxproj')).toContain('react-native-view-shot/RNViewShotPrivacyInfo.bundle')
})

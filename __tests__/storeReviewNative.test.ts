import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * What App Review and Play review read in the native config (app-review-readiness 2026-10-24).
 *
 * `ios/` and `android/` are committed, so EAS builds from them and never runs prebuild: each rule is pinned twice,
 * in app.json (what a prebuild would write) and in the native file the binary is actually built from.
 */
const read = (...p: string[]) => readFileSync(join(__dirname, '..', ...p), 'utf8')
const expoConfig = () => JSON.parse(read('app.json')).expo

describe('iPhone only for v1.0 (2.4.1: nothing has been QA’d at iPad sizes)', () => {
  it('app.json does not support tablets', () => {
    expect(expoConfig().ios.supportsTablet).toBe(false)
  })

  it('every build configuration targets iPhone alone', () => {
    const families = [...read('ios/blendn.xcodeproj/project.pbxproj').matchAll(/TARGETED_DEVICE_FAMILY = ([^;]+);/g)].map((m) => m[1])
    expect(families.length).toBeGreaterThan(0)
    for (const family of families) expect(family.replace(/"/g, '')).toBe('1')
  })
})

describe('no Face ID purpose string (5.1.1(ii): the app never uses Face ID)', () => {
  /*
   * expo-secure-store's plugin adds the generic "Allow $(PRODUCT_NAME) to access your Face ID biometric data." unless
   * told `faceIDPermission: false`. The app stores its tokens with `requireAuthentication: false` (lib/apiClient), so a
   * Face ID string is a purpose for a permission it never asks for.
   */
  it('app.json tells expo-secure-store not to add one', () => {
    const plugin = expoConfig().plugins.find((p: unknown) => (Array.isArray(p) ? p[0] : p) === 'expo-secure-store')
    expect(plugin).toEqual(['expo-secure-store', { faceIDPermission: false }])
  })

  it('the committed Info.plist has none', () => {
    expect(read('ios/blendn/Info.plist')).not.toContain('NSFaceIDUsageDescription')
  })

  it('the app never asks secure-store for biometrics', () => {
    expect(read('lib/apiClient.ts')).toContain('requireAuthentication: false')
    expect(read('lib/apiClient.ts')).not.toContain('requireAuthentication: true')
  })
})

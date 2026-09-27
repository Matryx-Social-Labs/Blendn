import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * The purpose strings iOS requires, in the file the binary is built from.
 *
 * `ios/` is committed, so EAS builds from ios/blendn/Info.plist and never runs
 * prebuild. `ios.infoPlist` in app.json reaches the binary only when somebody
 * regenerates `ios/` — a string added there alone ships nothing, and nothing
 * says so until App Store Connect refuses the build.
 *
 * Build 112 was refused that way (ITMS-90683, no NSMotionUsageDescription).
 * The app never asks for motion: expo-location 57 links
 * CMMotionActivityManager, and Apple scans for the symbol, not the call.
 */
const read = (...p: string[]) => readFileSync(join(__dirname, '..', ...p), 'utf8')

// Read as a value, not matched as text: `pod install` re-serialises the plist
// with a bare apostrophe where Xcode wrote `&apos;`.
function plistString(key: string): string | undefined {
  const re = new RegExp(`<key>${key}</key>\\s*<string>([^<]*)</string>`)
  return read('ios/blendn/Info.plist').match(re)?.[1]?.replace(/&apos;/g, "'")
}

describe('iOS purpose strings', () => {
  it('carries NSMotionUsageDescription, which expo-location makes Apple require', () => {
    expect(plistString('NSMotionUsageDescription')).toMatch(/^Blend'n /)
  })

  it('ships every usage string app.json declares, word for word', () => {
    const declared = Object.entries(JSON.parse(read('app.json')).expo.ios.infoPlist).filter(
      ([key]) => key.endsWith('UsageDescription')
    )
    expect(declared.map(([key]) => key)).toContain('NSMotionUsageDescription')
    for (const [key, value] of declared) expect([key, plistString(key)]).toEqual([key, value])
  })
})

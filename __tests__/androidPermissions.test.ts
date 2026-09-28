import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * The Android permissions a release build must not ask for, in the file the
 * binary is built from.
 *
 * `android/` is committed, so EAS builds from the manifest and never runs
 * prebuild. `android.blockedPermissions` in app.json reaches the binary only
 * when somebody regenerates `android/`; the manifest has to say it too.
 *
 * RECORD_AUDIO came from expo-image-picker's config plugin, which prebuild
 * applies without it being listed in app.json and which adds the microphone
 * unless told `microphonePermission: false`. The app picks and shoots images
 * only (`lib/photoUtils.ts`, `mediaTypes: ['images']`), so the Play Data safety
 * form says audio is not collected, and the manifest has to agree.
 *
 * SYSTEM_ALERT_WINDOW came from Expo's base manifest template. React Native's
 * dev tools need it, and only in debug, which `src/debug/AndroidManifest.xml`
 * grants on its own.
 */
const read = (...p: string[]) => readFileSync(join(__dirname, '..', ...p), 'utf8')

const MAIN = 'android/app/src/main/AndroidManifest.xml'
const DEBUG = 'android/app/src/debug/AndroidManifest.xml'

function permission(file: string, name: string): string | undefined {
  const escaped = name.replace(/\./g, '\\.')
  return read(file).match(new RegExp(`<uses-permission android:name="${escaped}"[^>]*/>`))?.[0]
}

const removed = (name: string) =>
  `<uses-permission android:name="${name}" tools:node="remove"/>`

describe('Android permissions', () => {
  it('removes RECORD_AUDIO from the merged manifest, whichever library adds it', () => {
    expect(permission(MAIN, 'android.permission.RECORD_AUDIO')).toBe(
      removed('android.permission.RECORD_AUDIO')
    )
  })

  it('removes SYSTEM_ALERT_WINDOW from release and keeps it in debug', () => {
    expect(permission(MAIN, 'android.permission.SYSTEM_ALERT_WINDOW')).toBe(
      removed('android.permission.SYSTEM_ALERT_WINDOW')
    )
    expect(permission(DEBUG, 'android.permission.SYSTEM_ALERT_WINDOW')).toBe(
      '<uses-permission android:name="android.permission.SYSTEM_ALERT_WINDOW"/>'
    )
  })

  it('removes every permission app.json blocks, so a prebuild would change nothing', () => {
    const blocked: string[] = JSON.parse(read('app.json')).expo.android.blockedPermissions
    expect(blocked).toEqual(
      expect.arrayContaining(['android.permission.RECORD_AUDIO', 'android.permission.SYSTEM_ALERT_WINDOW'])
    )
    for (const name of blocked) expect([name, permission(MAIN, name)]).toEqual([name, removed(name)])
  })
})

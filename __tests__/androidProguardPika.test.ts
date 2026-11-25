/**
 * SCRUM-947: with R8 on, Expo SDK 57's Pika introspection classes were
 * renamed/stripped and every module call that returns a Record (the image
 * picker's asset) threw ERR_UNEXPECTED after the file was picked. Release-only,
 * so jest cannot run it: this pins the keep rules whose absence was driven to
 * fail on an Android emulator (library and camera both) and whose presence
 * was driven to work.
 */
import { readFileSync } from 'fs'
import { join } from 'path'

const rules = readFileSync(join(__dirname, '..', 'android', 'app', 'proguard-rules.pro'), 'utf8')

it('keeps the Pika introspection classes and providers R8 would rename', () => {
  expect(rules).toContain('-keep class io.github.lukmccall.pika.** { *; }')
  expect(rules).toContain('-keep class * implements io.github.lukmccall.pika.PIntrospectionProvider { *; }')
})
